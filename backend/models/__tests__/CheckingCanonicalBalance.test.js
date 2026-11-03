jest.mock('../../services/canonicalCheckingBalanceService', () => ({ getCanonicalCheckingBalance: jest.fn() }));
const { getCanonicalCheckingBalance } = require('../../services/canonicalCheckingBalanceService');
const Checking = require('../Checking');
beforeEach(() => jest.clearAllMocks());
test.each(['1234567', '0', '-1234', null])('global balance delegates to canonical bank amount %s without ledger calculations', async amount => {
  const query = jest.fn().mockResolvedValue({ rows: [{ known_balance: '999999', balance_date: '2026-07-15', total_abonos: '0', total_cargos: '0' }] });
  const dto = { source: 'fintoc', amount, available: amount, current: amount, state: amount === null ? 'unavailable' : 'available', freshness: amount === null ? 'unknown' : 'current' };
  getCanonicalCheckingBalance.mockResolvedValue(dto);
  expect(await new Checking({ query }).globalBalance('owner')).toEqual({ ...dto, saldo_actual: amount === null ? null : Number(amount) });
  expect(getCanonicalCheckingBalance).toHaveBeenCalledWith('owner', { query });
  expect(query).not.toHaveBeenCalled();
});
test('historical month summary has an explicit historical name and never masquerades as current bank balance', async () => {
  const query = jest.fn().mockResolvedValueOnce({ rows: [{ abonos: '20', cargos: '10' }] }).mockResolvedValueOnce({ rows: [{ initial_balance: '100' }] });
  expect(await new Checking({ query }).summary('owner', 2026, 7)).toEqual({ source: 'historical_ledger', initial_balance: 100, abonos: 20, cargos: 10, neto: 10, saldo_periodo: 110 });
});
