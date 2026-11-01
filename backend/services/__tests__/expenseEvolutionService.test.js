/** DCE-01–21: all persistence is replaced before loading the service. */
jest.mock('../../config/database', () => ({ query: jest.fn() }));

const db = require('../../config/database');
const {
  parseEvolutionQuery,
  parseTransactionQuery,
  getEvolution,
  getTransactions,
} = require('../expenseEvolutionService');

const QUERY = { endYear: '2026', endMonth: '10', months: '6', basis: 'billing' };
const DETAIL = { year: '2026', month: '10', categoryId: '1' };
const allSources = 'tc_nacional,tc_internacional,cuenta_corriente';
const emptyPayload = () => ({ categories: [], aggregates: [], exclusions: { missingPeriodCount: 0, missingCLPCount: 0 } });
const answer = (payload) => db.query.mockResolvedValue({ rows: [payload] });

beforeEach(() => {
  db.query.mockReset();
  jest.useFakeTimers().setSystemTime(new Date('2026-11-01T01:00:00.000Z'));
  answer(emptyPayload());
});
afterEach(() => jest.useRealTimers());

describe('expense evolution request contract', () => {
  test('uses an explicit billing period and safe defaults', () => {
    expect(parseEvolutionQuery({ endYear: '2026', endMonth: '10' })).toEqual({
      endYear: 2026, endMonth: 10, months: 6, basis: 'billing', sources: ['tc_nacional'],
    });
    expect(parseTransactionQuery(DETAIL)).toEqual({
      year: 2026, month: 10, categoryId: '1', basis: 'billing', sources: ['tc_nacional'], limit: 100, offset: 0,
    });
  });

  test('normalizes source identity without accepting arbitrary SQL or source names', () => {
    expect(parseEvolutionQuery({ ...QUERY, sources: 'cuenta_corriente,tc_nacional,tc_nacional' }).sources)
      .toEqual(['tc_nacional', 'cuenta_corriente']);
    expect(() => parseEvolutionQuery({ ...QUERY, sources: "tc_nacional'); DELETE FROM transactions;--" })).toThrow();
  });

  test.each([
    {}, { endYear: '2019', endMonth: '10' }, { endYear: '2051', endMonth: '10' },
    { ...QUERY, endYear: '2026x' }, { ...QUERY, endYear: '2026.5' }, { ...QUERY, endMonth: '0' },
    { ...QUERY, endMonth: '13' }, { ...QUERY, endMonth: ['10'] }, { ...QUERY, months: '0' },
    { ...QUERY, months: '4' }, { ...QUERY, months: '6x' }, { ...QUERY, basis: 'calendar' },
    { ...QUERY, sources: '' }, { ...QUERY, sources: 'all' }, { ...QUERY, sources: ['tc_nacional'] },
  ])('rejects malformed evolution parameters before reading data: %j', async (query) => {
    await expect(getEvolution('owner', query)).rejects.toMatchObject({ status: 400 });
    expect(db.query).not.toHaveBeenCalled();
  });

  test.each([
    { ...DETAIL, categoryId: '0' }, { ...DETAIL, categoryId: '-1' }, { ...DETAIL, categoryId: '1x' },
    { ...DETAIL, categoryId: '1 OR 1=1' }, { ...DETAIL, limit: '201' }, { ...DETAIL, limit: '0' },
    { ...DETAIL, offset: '-1' }, { ...DETAIL, offset: '1.5' }, { ...DETAIL, year: '2026x' },
  ])('rejects malformed detail parameters without reading data: %j', async (query) => {
    await expect(getTransactions('owner', query)).rejects.toMatchObject({ status: 400 });
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('the monthly category matrix', () => {
  test('anchors the six-month window to the requested historic month, including a year boundary', async () => {
    const result = await getEvolution('owner', { endYear: '2025', endMonth: '2' });
    expect(result.months.map((m) => m.key)).toEqual(['2024-09', '2024-10', '2024-11', '2024-12', '2025-01', '2025-02']);
    expect(result.scope).toEqual({ endYear: 2025, endMonth: 2, months: 6, basis: 'billing', sources: ['tc_nacional'] });
    expect(result.months.every((m) => m.status === 'past' && m.coverage === 'unknown')).toBe(true);
    expect(result.generatedAt).toBe('2026-11-01T01:00:00.000Z');
  });

  test('handles January, February in a leap year and both other supported windows', async () => {
    const jan = await getEvolution('owner', { endYear: '2024', endMonth: '1', months: '3' });
    expect(jan.months.map((m) => m.key)).toEqual(['2023-11', '2023-12', '2024-01']);
    const feb = await getEvolution('owner', { endYear: '2024', endMonth: '2', months: '12' });
    expect(feb.months).toHaveLength(12);
    expect(feb.months[11].key).toBe('2024-02');
  });

  test('determines past/current/future in Santiago rather than the UTC month', async () => {
    const result = await getEvolution('owner', { endYear: '2026', endMonth: '11', months: '3' });
    expect(result.months.map((m) => [m.key, m.status])).toEqual([
      ['2026-09', 'past'], ['2026-10', 'current'], ['2026-11', 'future'],
    ]);
  });

  test('returns every authorized category by stable id, including zero, special names and uncategorized', async () => {
    answer({ ...emptyPayload(), categories: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: ['year', 'month', '__proto__', 'Nombre.con.puntos'][i] || 'Categoría ' + i })) });
    const result = await getEvolution('owner', QUERY);
    expect(result.categories).toHaveLength(13);
    expect(result.categories.find((c) => c.id === 'uncategorized').name).toBe('Sin categoría');
    expect(result.categories.find((c) => c.id === '3').name).toBe('__proto__');
    expect(result.categories.every((c) => typeof c.id === 'string' && c.values.length === 6)).toBe(true);
    expect(result.categories.every((c) => c.values.every((v) => v.total === 0 && v.count === 0))).toBe(true);
  });

  test('reconciles categories, months, sources and summary using stored cents before adding', async () => {
    answer({
      categories: [{ id: 1, name: 'Servicios' }, { id: 2, name: 'year' }, { id: 3, name: 'Servicios' }],
      aggregates: [
        { year: 2026, month: 9, category_id: 1, source: 'tc_nacional', total: '100.10', count: '1' },
        { year: 2026, month: 10, category_id: 1, source: 'tc_nacional', total: '100.10', count: '1' },
        { year: 2026, month: 10, category_id: 1, source: 'tc_internacional', total: '200.20', count: '1' },
        { year: 2026, month: 10, category_id: 1, source: 'cuenta_corriente', total: '300.30', count: '1' },
        { year: 2026, month: 10, category_id: null, source: 'tc_nacional', total: '20.01', count: '1' },
        { year: 2026, month: 10, category_id: 2, source: 'tc_nacional', total: '0.10', count: '1' },
      ],
      exclusions: { missingPeriodCount: 2, missingCLPCount: 1 },
    });
    const result = await getEvolution('owner', { ...QUERY, sources: allSources });
    expect(result.summary).toMatchObject({ total: 720.81, count: 6, currentTotal: 620.71, previousTotal: 100.1, delta: 520.61 });
    expect(result.categories.find((c) => c.id === '1')).toMatchObject({ total: 700.7, currentTotal: 600.6, previousTotal: 100.1, delta: 500.5, deltaPct: 500 });
    expect(result.summary.largestIncrease).toEqual({ categoryId: '1', name: 'Servicios', delta: 500.5 });
    expect(result.months[5].bySource).toEqual({
      tc_nacional: { total: 120.21, count: 3 }, tc_internacional: { total: 200.2, count: 1 }, cuenta_corriente: { total: 300.3, count: 1 },
    });
    expect(result.exclusions).toEqual({ missingPeriodCount: 2, missingCLPCount: 1 });
    expect(result.coverage).toMatchObject({ status: 'unknown', consolidation: 'unverified' });
    expect(result.coverage.warnings.length).toBeGreaterThan(0);
    expect(result.categories.filter((c) => c.name === 'Servicios')).toHaveLength(2);
  });

  test('includes the month before the visible window in the first delta without adding it to totals', async () => {
    answer({ categories: [{ id: 1, name: 'A' }], aggregates: [
      { year: 2026, month: 4, category_id: 1, source: 'tc_nacional', total: '100', count: 1 },
      { year: 2026, month: 5, category_id: 1, source: 'tc_nacional', total: '150', count: 1 },
    ], exclusions: {} });
    const result = await getEvolution('owner', QUERY);
    expect(result.months[0]).toMatchObject({ key: '2026-05', previousTotal: 100, total: 150, delta: 50, deltaPct: 50 });
    expect(result.summary.total).toBe(150);
    expect(result.summary.count).toBe(1);
  });

  test('zero records do not claim coverage or fabricate an infinite percentage', async () => {
    const result = await getEvolution('owner', QUERY);
    expect(result.summary).toMatchObject({ total: 0, count: 0, delta: 0, deltaPct: null, largestIncrease: null });
    expect(result.coverage).toMatchObject({ status: 'unknown', consolidation: 'single-source' });
    expect(result.coverage.message).toMatch(/cobertura.*no verificada/i);
    expect(result.months.every((m) => m.deltaPct === null)).toBe(true);
  });

  test('uses one parameterized SELECT snapshot with the canonical persisted periods and no mutations', async () => {
    await getEvolution('owner-uuid', { ...QUERY, sources: allSources });
    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql.trim()).toMatch(/^WITH\b/i);
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|MERGE)\b/i);
    expect(sql).toMatch(/billing_year/);
    expect(sql).toMatch(/billing_month/);
    expect(sql).toMatch(/period_year/);
    expect(sql).toMatch(/period_month/);
    expect(sql).not.toMatch(/installment|projected_occurrences|DISTINCT ON/i);
    expect(sql).toMatch(/pago%tarjeta/);
    expect(params[0]).toBe('owner-uuid');
    expect(params[1]).toEqual(['tc_nacional', 'tc_internacional', 'cuenta_corriente']);
    expect(params.every((p) => p !== undefined)).toBe(true);
  });
});

describe('the category-month detail', () => {
  const details = () => ({
    category: { id: '1', name: 'Servicios' }, total: '600.60', count: '3',
    transactions: [
      { id: 'same-id', source: 'tc_nacional', fecha: '2026-09-12', descripcion: 'Compra', amount: '100.10' },
      { id: 'same-id', source: 'tc_internacional', fecha: '2026-09-12', descripcion: 'Compra', amount: '200.20' },
    ],
  });

  test('retains the actual date and source+id identity, while totals describe the whole cell', async () => {
    answer(details());
    const result = await getTransactions('owner', { ...DETAIL, sources: allSources, limit: '2' });
    expect(result.scope).toEqual({ year: 2026, month: 10, categoryId: '1', basis: 'billing', sources: ['tc_nacional', 'tc_internacional', 'cuenta_corriente'] });
    expect(result).toMatchObject({ category: { id: '1', name: 'Servicios' }, total: 600.6, count: 3, limit: 2, offset: 0, hasMore: true });
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toMatchObject({ fecha: '2026-09-12', amount: 100.1 });
    expect(result.transactions[1]).toMatchObject({ id: 'same-id', source: 'tc_internacional' });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).not.toMatch(/make_date|\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i);
    expect(sql).toMatch(/ORDER BY/i);
    expect(params[0]).toBe('owner');
    expect(params).toContain(2);
  });

  test('returns an empty existing category and rejects an unknown or foreign category', async () => {
    answer({ category: { id: '1', name: 'Servicios' }, total: '0', count: '0', transactions: [] });
    expect(await getTransactions('owner', DETAIL)).toMatchObject({ total: 0, count: 0, hasMore: false, transactions: [] });
    answer({ category: null, total: '0', count: '0', transactions: [] });
    await expect(getTransactions('owner', DETAIL)).rejects.toMatchObject({ status: 404 });
  });

  test('supports the uncategorized group without creating a category', async () => {
    answer({ category: { id: 'uncategorized', name: 'Sin categoría' }, total: '0', count: '0', transactions: [] });
    const result = await getTransactions('owner', { ...DETAIL, categoryId: 'uncategorized', offset: '10' });
    expect(result.category).toEqual({ id: 'uncategorized', name: 'Sin categoría' });
    expect(result.offset).toBe(10);
  });

  test('does not convert a failed read into empty data', async () => {
    db.query.mockRejectedValue(new Error('read unavailable'));
    await expect(getEvolution('owner', QUERY)).rejects.toThrow('read unavailable');
    await expect(getTransactions('owner', DETAIL)).rejects.toThrow('read unavailable');
  });
});
