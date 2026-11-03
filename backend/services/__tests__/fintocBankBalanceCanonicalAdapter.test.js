jest.mock('../canonicalCheckingBalanceService', () => ({ getCanonicalCheckingBalance: jest.fn(), isValidBankBalanceSnapshot: jest.fn() }));
const { getCanonicalCheckingBalance } = require('../canonicalCheckingBalanceService');
const { createFintocBankBalanceService } = require('../fintocBankBalanceService');
test('saved bank endpoint delegates to the same canonical read while preserving owner restriction', async () => {
  const query = jest.fn(), now = () => new Date('2026-11-02T10:00:00Z'), env = { FINTOC_OWNER_USER_ID: 'owner', FINTOC_ACCOUNT_ID: 'account' };
  const dto = { source: 'fintoc', provider: 'fintoc', amount: '123', available: '123', current: '120', state: 'available', freshness: 'current' };
  getCanonicalCheckingBalance.mockResolvedValue(dto);
  const service = createFintocBankBalanceService({ db: { query }, env, now, provider: { readBalance: jest.fn() } });
  expect(await service.getBankBalance('owner')).toEqual(dto);
  expect(getCanonicalCheckingBalance).toHaveBeenCalledWith('owner', { query: expect.any(Function), env, now });
  await expect(service.getBankBalance('other')).rejects.toMatchObject({ status: 403 });
  expect(getCanonicalCheckingBalance).toHaveBeenCalledTimes(1);
});
