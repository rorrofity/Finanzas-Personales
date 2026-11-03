jest.mock('../../config/database', () => ({ query: jest.fn() }));

const db = require('../../config/database');
const { getEvolution, getTransactions } = require('../expenseEvolutionService');

beforeEach(() => db.query.mockReset());

test('ESP-09: category memberships do not multiply original monthly or source purchase counts', async () => {
  db.query.mockResolvedValue({ rows: [{
    categories: [{ id: 1, name: 'Calzado' }, { id: 2, name: 'Ropa' }],
    aggregates: [
      { year: 2026, month: 10, category_id: 1, source: 'tc_nacional', total: '100000.00', count: '1' },
      { year: 2026, month: 10, category_id: 2, source: 'tc_nacional', total: '80000.00', count: '1' },
      { year: 2026, month: 10, category_id: null, source: 'cuenta_corriente', total: '20000.00', count: '1' },
    ],
    monthly_counts: [
      { year: 2026, month: 10, source: 'tc_nacional', count: '1' },
      { year: 2026, month: 10, source: 'cuenta_corriente', count: '1' },
    ],
    exclusions: {},
  }] });
  const result = await getEvolution('owner', { endYear: '2026', endMonth: '10', months: '3', sources: 'tc_nacional,cuenta_corriente' });
  expect(result.summary).toMatchObject({ currentTotal: 200000, total: 200000, count: 2 });
  expect(result.months.at(-1)).toMatchObject({ count: 2, bySource: { tc_nacional: { total: 180000, count: 1 }, cuenta_corriente: { total: 20000, count: 1 } } });
  expect(result.categories.find(c => c.id === '1').values.at(-1).count).toBe(1);
  expect(result.categories.find(c => c.id === '2').values.at(-1).count).toBe(1);
});

test('ESP-09: category detail preserves original identity and exposes the attributed amount with original total', async () => {
  db.query.mockResolvedValue({ rows: [{
    category: { id: '2', name: 'Ropa' }, total: '80000.00', count: '1',
    transactions: [{ id: 'original-purchase', source: 'tc_nacional', fecha: '2026-10-01', descripcion: 'Fixture', amount: '80000.00', original_amount: '180000.00', is_split: true }],
  }] });
  const result = await getTransactions('owner', { year: '2026', month: '10', categoryId: '2' });
  expect(result.transactions).toEqual([{ id: 'original-purchase', source: 'tc_nacional', fecha: '2026-10-01', descripcion: 'Fixture', amount: 80000, originalAmount: 180000, isSplit: true }]);
});

test('ESP-09: original-count payload cannot inject a negative or fractional purchase count', async () => {
  db.query.mockResolvedValue({ rows: [{ categories: [], aggregates: [], exclusions: {}, monthly_counts: [{ year: 2026, month: 10, source: 'tc_nacional', count: '-1' }] }] });
  await expect(getEvolution('owner', { endYear: '2026', endMonth: '10', months: '3' })).rejects.toThrow(/Cantidad/);
});

test('ESP-09: legacy category detail uses the exact database total rather than adding binary decimal amounts', async () => {
  db.query.mockResolvedValue({ rows: [
    { id: 'one', source: 'tc_nacional', fecha: '2026-10-01', descripcion: 'A', monto: '0.10', category_total: '0.30' },
    { id: 'two', source: 'tc_internacional', fecha: '2026-10-02', descripcion: 'B', monto: '0.20', category_total: '0.30' },
  ] });
  const response = { json: jest.fn(), status: jest.fn().mockReturnThis() };
  await require('../../controllers/dashboardController').getCategoryTransactions({ user: { id: 'owner' }, query: { periodYear: '2026', periodMonth: '10', category: 'Calzado' } }, response);
  expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ total: 0.3, count: 2 }));
});
