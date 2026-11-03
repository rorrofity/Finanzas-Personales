jest.mock('../../config/database', () => ({ query: jest.fn() }));
jest.mock('../../utils/commitments', () => ({ computeCommitments: jest.fn().mockResolvedValue({ total: 0 }) }));
jest.mock('../../services/canonicalCheckingBalanceService', () => ({ getCanonicalCheckingBalance: jest.fn() }));
const db = require('../../config/database');
const { getCanonicalCheckingBalance } = require('../../services/canonicalCheckingBalanceService');
const { getOverview } = require('../dashboardController');
beforeEach(() => { jest.clearAllMocks(); db.query.mockResolvedValue({ rows: [] }); });
test.each(['1234567', '0', null])('dashboard liquidity uses canonical bank amount %s with its exact provenance', async amount => {
  const checking = { amount, available: amount, source: 'fintoc', state: amount === null ? 'unavailable' : 'available', freshness: amount === null ? 'unknown' : 'current', bankUpdatedAt: '2026-11-02T10:00:00Z' };
  getCanonicalCheckingBalance.mockResolvedValue(checking);
  const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
  await getOverview({ user: { id: 'owner' }, query: { year: '2026', month: '11' } }, res);
  expect(res.status).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ checking, disponibleHoy: amount === null ? null : Number(amount) }));
  expect(getCanonicalCheckingBalance).toHaveBeenCalledWith('owner', { query: db.query });
  expect(db.query.mock.calls.some(([sql]) => sql.includes('FROM checking_balances'))).toBe(false);
});
