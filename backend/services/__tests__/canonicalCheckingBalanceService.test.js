const { getCanonicalCheckingBalance, isValidBankBalanceSnapshot } = require('../canonicalCheckingBalanceService');
const owner = 'owner-fixture';
const env = { FINTOC_OWNER_USER_ID: owner, FINTOC_ACCOUNT_ID: 'account-fixture' };
const now = new Date('2026-11-02T15:00:00.000Z');
const row = (patch = {}) => ({ currency: 'CLP', available: '1234567', current: '1200000', bank_updated_at: '2026-11-02T10:00:00Z', queried_at: '2026-11-02T10:01:00Z', ...patch });
const run = (data, options = {}) => {
  const query = jest.fn().mockResolvedValue({ rows: data ? [data] : [] });
  return { query, result: getCanonicalCheckingBalance(owner, { query, env, now, ...options }) };
};
test('uses only saved available bank balance, account and owner scoped, without summing ledger', async () => {
  const { query, result } = run(row());
  expect(await result).toEqual({ source: 'fintoc', provider: 'fintoc', currency: 'CLP', amount: '1234567', available: '1234567', current: '1200000', state: 'available', freshness: 'current', bankUpdatedAt: '2026-11-02T10:00:00.000Z', queriedAt: '2026-11-02T10:01:00.000Z', reason: null });
  expect(query).toHaveBeenCalledTimes(1);
  expect(query).toHaveBeenCalledWith(expect.stringMatching(/^\s*SELECT\b/i), [owner, 'account-fixture']);
  expect(query.mock.calls[0][0]).toContain('FROM fintoc_bank_balances');
  expect(query.mock.calls[0][0]).not.toMatch(/checking_balances|checking_transactions|INSERT|UPDATE|DELETE/);
});
test.each(['0', '-1234567'])('official amount %s is preserved rather than falling back', async value => {
  const { result } = run(row({ available: value })); expect(await result).toMatchObject({ amount: value, available: value, state: 'available', freshness: 'current' });
});
test('missing bank snapshot is unavailable, never a zero or historical fallback', async () => {
  const { query, result } = run(null);
  expect(await result).toMatchObject({ amount: null, available: null, current: null, state: 'unavailable', freshness: 'unknown', bankUpdatedAt: null, queriedAt: null, reason: 'FINTOC_BALANCE_UNAVAILABLE' });
  expect(query).toHaveBeenCalledTimes(1);
});
test.each([{}, { FINTOC_OWNER_USER_ID: 'someone-else', FINTOC_ACCOUNT_ID: 'account-fixture' }])('unconfigured/other owner is unavailable without consulting bank account: %j', async config => {
  const { query, result } = run(row(), { env: config });
  expect(await result).toMatchObject({ amount: null, state: 'unavailable', reason: 'FINTOC_BALANCE_NOT_CONFIGURED' }); expect(query).not.toHaveBeenCalled();
});
test('old bank data remains last known value with its original age, not query time', async () => {
  const { result } = run(row({ bank_updated_at: '2026-10-30T10:00:00Z', queried_at: '2026-11-02T14:59:00Z' }));
  expect(await result).toMatchObject({ amount: '1234567', state: 'available', freshness: 'stale', bankUpdatedAt: '2026-10-30T10:00:00.000Z', queriedAt: '2026-11-02T14:59:00.000Z', reason: 'FINTOC_BALANCE_STALE' });
});
test.each([null, '2026-11-03T10:00:00Z'])('missing or future bank timestamp %s is never current', async time => {
  const { result } = run(row({ bank_updated_at: time })); expect(await result).toMatchObject({ amount: '1234567', freshness: 'unknown', reason: 'FINTOC_BALANCE_TIMESTAMP_UNKNOWN' });
});
test.each([{ available: '1.50' }, { available: '1e6' }, { current: 'bad' }, { available: '9007199254740993' }, { currency: 'USD' }, { queried_at: 'invalid' }, { bank_updated_at: 'invalid' }])('invalid stored snapshot is an explicit error with no monetary fallback: %j', async patch => {
  const { result } = run(row(patch)); expect(await result).toMatchObject({ amount: null, available: null, current: null, state: 'error', freshness: 'unknown', reason: 'FINTOC_BALANCE_INVALID_RESPONSE' });
});
test('storage error returns a safe missing value and code without leaking detail', async () => {
  const query = jest.fn().mockRejectedValue(new Error('PRIVATE ledger credential'));
  const result = await getCanonicalCheckingBalance(owner, { query, env, now });
  expect(result).toMatchObject({ amount: null, state: 'error', reason: 'FINTOC_BALANCE_STORAGE_ERROR' }); expect(JSON.stringify(result)).not.toContain('PRIVATE');
});
test('same validation protects persistence and reads, no provider dependency', () => {
  expect(isValidBankBalanceSnapshot({ currency: 'CLP', available: '1', current: '1', bankUpdatedAt: null, queriedAt: '2026-11-02T10:00:00.000Z' })).toBe(true);
  expect(isValidBankBalanceSnapshot({ currency: 'CLP', available: '1.1', current: '1', bankUpdatedAt: null, queriedAt: '2026-11-02T10:00:00.000Z' })).toBe(false);
});
