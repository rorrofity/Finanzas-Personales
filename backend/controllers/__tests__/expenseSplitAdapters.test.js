const mockTransactions = { getAllTransactions: jest.fn() };
const mockChecking = { list: jest.fn(), listRecentMonths: jest.fn(), update: jest.fn() };
const mockIntl = { listByMonth: jest.fn(), update: jest.fn() };
jest.mock('../../config/database', () => ({ query: jest.fn(), pool: {} }));
jest.mock('../../models/Transaction', () => jest.fn(() => mockTransactions));
jest.mock('../../models/Checking', () => jest.fn(() => mockChecking));
jest.mock('../../models/IntlUnbilled', () => jest.fn(() => mockIntl));
jest.mock('../../services/expenseSplitService', () => ({ attachSplits: jest.fn() }), { virtual: true });
const db = require('../../config/database');
const { attachSplits } = require('../../services/expenseSplitService');
const national = require('../transactionController');
const checking = require('../checkingController');
const intl = require('../intlUnbilledController');
const categories = require('../categoryController');
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
const row = { id: 'fixture-id', monto: '180.00', category_id: 7 };
const decorated = { ...row, split: { version: 'fixture-version', total_clp: '180.00', parts: [{ amount_clp: '100.00', category_id: 8 }, { amount_clp: '80.00', category_id: null }] } };
beforeEach(() => {
  jest.clearAllMocks();
  mockTransactions.getAllTransactions.mockResolvedValue([row]);
  mockChecking.list.mockResolvedValue([row]);
  mockChecking.listRecentMonths.mockResolvedValue([row]);
  mockIntl.listByMonth.mockResolvedValue([row]);
  attachSplits.mockResolvedValue([decorated]);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
test.each([
  ['national', national.getAllTransactions, {}, 'tc_nacional', false],
  ['international', intl.listByMonth, { year: '2026', month: '11' }, 'tc_internacional', false],
  ['checking month', checking.list, { year: '2026', month: '11' }, 'cuenta_corriente', true],
  ['checking recent', checking.list, { recent: 'true' }, 'cuenta_corriente', true],
  ['checking default', checking.list, {}, 'cuenta_corriente', true],
])('%s list adds owner-scoped split overlay in one batch', async (_label, handler, query, source, wrapped) => {
  const res = response();
  await handler({ user: { id: 'resolved-owner' }, query }, res);
  expect(attachSplits).toHaveBeenCalledTimes(1);
  expect(attachSplits).toHaveBeenCalledWith('resolved-owner', source, [row]);
  expect(res.json).toHaveBeenCalledWith(wrapped ? { items: [decorated], total: 1 } : [decorated]);
  expect(row).toEqual({ id: 'fixture-id', monto: '180.00', category_id: 7 });
});
test.each([
  ['national edit', national.updateTransaction, 'query'],
  ['national category', national.updateTransactionCategory, 'query'],
  ['checking edit', checking.update, 'checking'],
  ['international edit', intl.update, 'intl'],
])('%s maps protected original conflict to 409 without exposing database details', async (_label, handler, target) => {
  const error = Object.assign(new Error('EXPENSE_SPLIT_PARENT_LOCKED'), { code: 'P0001' });
  if (target === 'query') db.query.mockRejectedValueOnce(error);
  else (target === 'checking' ? mockChecking.update : mockIntl.update).mockRejectedValueOnce(error);
  const res = response();
  await handler({ user: { id: 'owner' }, params: { id: row.id }, body: { category_id: 8 } }, res);
  expect(res.status).toHaveBeenCalledWith(409);
  expect(res.json).toHaveBeenCalledWith({ error: expect.stringMatching(/división/i), code: 'EXPENSE_SPLIT_PARENT_LOCKED' });
});
test('category referenced by a split cannot silently disappear', async () => {
  db.query.mockResolvedValueOnce({ rows: [{ count: '0' }] }).mockRejectedValueOnce(Object.assign(new Error('private SQL detail'), { code: '23503', constraint: 'expense_split_parts_category_id_fkey' }));
  const res = response();
  await categories.deleteCategory({ user: { id: 'owner' }, params: { id: 7 } }, res);
  expect(res.status).toHaveBeenCalledWith(409);
  expect(res.json).toHaveBeenCalledWith({ error: expect.stringMatching(/divisi/i), code: 'EXPENSE_SPLIT_CATEGORY_IN_USE' });
});
