jest.mock('../../config/database', () => ({ query: jest.fn(), pool: {} }));
const { createFinancialHealthController } = require('../financialHealthController');
const instant = new Date('2026-11-02T15:00:00.000Z');
const bank = (patch = {}) => ({ source: 'fintoc', provider: 'fintoc', currency: 'CLP', amount: '10000', available: '10000', current: '9800', state: 'available', freshness: 'current', bankUpdatedAt: '2026-11-02T10:00:00.000Z', queriedAt: '2026-11-02T10:01:00.000Z', reason: null, ...patch });
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn(), set: jest.fn() });
function fixture(options = {}) {
  const projected = options.projected || [
    { occurrence_id: 'one', template_id: 'template-one', nombre: 'Fijo ficticio', tipo: 'gasto', monto: '50.10', fecha: '2026-11-03', active: true, virtual: false, updated_at: '2026-11-01T13:00Z' },
    { occurrence_id: null, template_id: 'template-two', nombre: 'Ingreso ficticio', tipo: 'ingreso', monto: '100.20', fecha: '2026-11-30', active: true, virtual: true, updated_at: '2026-11-02T13:00Z' },
    { occurrence_id: 'inactive', template_id: 'template-inactive', nombre: 'No incluir', tipo: 'gasto', monto: '999', fecha: '2026-11-15', active: false, virtual: false },
  ];
  const query = jest.fn(async (sql) => {
    if (/^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)/.test(sql.trim())) return { rows: [] };
    if (options.fail && sql.includes(options.fail)) throw Object.assign(new Error('PRIVATE database detail'), { code: 'XX999' });
    if (sql.includes('FROM transactions')) return { rows: [{ network: 'visa', tipo: 'gasto', total: '1000.10', count: 1 }, { network: 'visa', tipo: 'pago', total: '200', count: 1 }, ...(options.unknown ? [{ network: 'unknown', tipo: 'gasto', total: '50', count: 1 }] : [])] };
    if (sql.includes('FROM installment_occurrences')) return { rows: [{ brand: 'visa', total: '100', count: 1, last_changed_at: '2026-11-01T11:00Z' }] };
    if (sql.includes('FROM intl_unbilled')) return { rows: [{ brand: 'visa', total: '300', conversion_pending_count: options.pending ? '2' : '0' }] };
    if (sql.includes('HFS_EFFECTIVE_PROJECTIONS')) return { rows: projected };
    if (sql.includes('FROM sync_runs')) return { rows: options.syncRows || [{ created_at: instant, failed: false, latest_success_at: instant }] };
    throw Error('Unexpected SQL: ' + sql);
  });
  const client = { query, release: jest.fn() }, db = { pool: { connect: jest.fn().mockResolvedValue(client) }, query };
  const checking = jest.fn().mockResolvedValue(options.bank || bank());
  const controller = createFinancialHealthController({ db, getCheckingBalance: checking, now: () => instant });
  return { controller, client, db, query, checking };
}
test('uses only canonical balance, complete effective projections and exact monetary sums in a read-only snapshot', async () => {
  const s = fixture(), res = response(); await s.controller.getSummary({ user: { id: 'owner' }, query: { year: '2026', month: '11' } }, res);
  expect(res.status).not.toHaveBeenCalled(); const data = res.json.mock.calls[0][0];
  expect(data.checking).toMatchObject({ currentBalance: 10000, source: 'fintoc', lastUpdated: bank().bankUpdatedAt });
  expect(data.projected).toMatchObject({ expenses: 50.1, income: 100.2 });
  expect(data.projected.details.income[0]).toMatchObject({ name: 'Ingreso ficticio', amount: 100.2, virtual: true });
  expect(data.summary).toMatchObject({ totalCommitments: 1250.2, projectedBalance: 8850, amountsPartial: false, partialReasons: [] });
  expect(data.generatedAt).toBe(instant.toISOString());
  expect(data.sources.checking).toMatchObject({ state: 'available', freshness: 'current', asOf: bank().bankUpdatedAt });
  expect(data.sources.projected).toMatchObject({ state: 'available', asOf: '2026-11-02T13:00:00.000Z' });
  expect(data.sources.installments.asOf).toBe('2026-11-01T11:00:00.000Z');
  expect(s.query.mock.calls[0][0]).toMatch(/BEGIN.*REPEATABLE READ.*READ ONLY/);
  expect(s.query.mock.calls.some(([sql]) => /checking_balances|INSERT|UPDATE|DELETE/.test(sql))).toBe(false);
  expect(s.client.release).toHaveBeenCalledTimes(1);
});
test.each([
  ['unavailable', bank({ amount: null, available: null, current: null, state: 'unavailable', freshness: 'unknown', bankUpdatedAt: null })],
  ['stale', bank({ freshness: 'stale' })],
])('a %s balance never produces a definitive health score or an invented zero', async (_name, snapshot) => {
  const s = fixture({ bank: snapshot }), res = response(); await s.controller.getSummary({ user: { id: 'owner' }, query: { year: '2026', month: '11' } }, res);
  const data = res.json.mock.calls[0][0]; expect(data.summary.amountsPartial).toBe(true); expect(data.summary.healthScore).toBeNull(); expect(data.summary.healthStatus).toBe('unknown'); expect(data.summary.partialReasons.length).toBeGreaterThan(0);
  if (snapshot.amount === null) { expect(data.checking.currentBalance).toBeNull(); expect(data.summary.projectedBalance).toBeNull(); }
});
test('a real bank zero remains a known zero', async () => {
  const s = fixture({ bank: bank({ amount: '0', available: '0', current: '0' }) }), res = response(); await s.controller.getSummary({ user: { id: 'owner' }, query: { year: '2026', month: '11' } }, res);
  const data = res.json.mock.calls[0][0]; expect(data.checking.currentBalance).toBe(0); expect(data.sources.checking.state).toBe('available'); expect(data.summary.amountsPartial).toBe(false);
});
test('a bank value outside safe cent precision remains unavailable for calculations instead of becoming a false zero', async () => {
  const s = fixture({ bank: bank({ amount: '9007199254740991', available: '9007199254740991' }) }), res = response(); await s.controller.getSummary({ user: { id: 'owner' }, query: { year: '2026', month: '11' } }, res);
  expect(res.status).not.toHaveBeenCalled(); const data = res.json.mock.calls[0][0]; expect(data.checking.currentBalance).toBeNull(); expect(data.summary.projectedBalance).toBeNull(); expect(data.summary.partialReasons).toContain('CHECKING_AMOUNT_UNSAFE');
});
test.each(['FROM transactions', 'FROM installment_occurrences', 'FROM intl_unbilled', 'HFS_EFFECTIVE_PROJECTIONS'])('source error %s is isolated by savepoint and cannot masquerade as a zero', async fail => {
  const s = fixture({ fail }), res = response(); await s.controller.getSummary({ user: { id: 'owner' }, query: { year: '2026', month: '11' } }, res);
  const data = res.json.mock.calls[0][0]; expect(data.summary.amountsPartial).toBe(true); expect(data.summary.healthScore).toBeNull(); expect(data.summary.projectedBalance).toBeNull(); expect(JSON.stringify(data)).not.toContain('PRIVATE');
  expect(s.query.mock.calls.some(([sql]) => /^ROLLBACK TO SAVEPOINT/.test(sql))).toBe(true);
  expect(s.query.mock.calls.some(([sql]) => /^COMMIT/.test(sql))).toBe(true);
});
test.each([{ pending: true }, { unknown: true }])('unconverted or unidentified card movements make the evaluation partial: %j', async options => {
  const s = fixture(options), res = response(); await s.controller.getSummary({ user: { id: 'owner' }, query: { year: '2026', month: '11' } }, res);
  const data = res.json.mock.calls[0][0]; expect(data.summary.amountsPartial).toBe(true); expect(data.summary.healthScore).toBeNull(); expect(data.summary.partialReasons.length).toBeGreaterThan(0);
});
test.each([
  [{ fail: 'FROM sync_runs' }, 'EMAIL_SYNC_UNVERIFIED', 'unknown'],
  [{ syncRows: [] }, 'EMAIL_SYNC_UNVERIFIED', 'unknown'],
  [{ syncRows: [{ created_at: '2026-10-30T15:00Z', latest_success_at: '2026-10-30T15:00Z', failed: false }] }, 'EMAIL_SYNC_STALE', 'stale'],
])('unverified synchronization metadata never presents card data as freshly confirmed: %j', async (options, reason, freshness) => {
  const s = fixture(options), res = response(); await s.controller.getSummary({ user: { id: 'owner' }, query: { year: '2026', month: '11' } }, res);
  const data = res.json.mock.calls[0][0]; expect(data.summary.partialReasons).toContain(reason); expect(data.summary.healthScore).toBeNull(); expect(data.sources.national.freshness).toBe(freshness); expect(data.sources.international.freshness).toBe(freshness); expect(data.creditCards.combined).toBe(1200.1);
});
test.each([{ year: '2026', month: '0' }, { year: '2026', month: '13' }, { year: 'NaN', month: '11' }, { year: '2026', month: '11', unexpected: 'x' }, { year: ['2026'], month: '11' }, { year: '2026', month: ['11'] }])('rejects invalid periods %j before database access', async query => {
  const s = fixture(), res = response(); await s.controller.getSummary({ user: { id: 'owner' }, query }, res); expect(res.status).toHaveBeenCalledWith(400); expect(s.db.pool.connect).not.toHaveBeenCalled();
});
