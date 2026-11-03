/** The saved bank snapshot is the only current checking balance in the app. */
const iso = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null;
const signedInteger = value => typeof value === 'string' && /^(0|-?[1-9]\d*)$/.test(value)
  && Number.isSafeInteger(Number(value)) && String(Number(value)) === value;
function isValidBankBalanceSnapshot(snapshot) {
  return snapshot?.currency === 'CLP' && signedInteger(snapshot.available) && signedInteger(snapshot.current)
    && typeof snapshot.queriedAt === 'string' && iso(snapshot.queriedAt)
    && (snapshot.bankUpdatedAt === null || (typeof snapshot.bankUpdatedAt === 'string' && iso(snapshot.bankUpdatedAt)));
}
function empty(state, reason) {
  return { source: 'fintoc', provider: 'fintoc', currency: 'CLP', amount: null, available: null, current: null,
    state, freshness: 'unknown', bankUpdatedAt: null, queriedAt: null, reason };
}
/** SELECT only; callers may provide their read-only transaction's query. */
async function getCanonicalCheckingBalance(owner, { query, env = process.env, now } = {}) {
  if (!owner || owner !== env.FINTOC_OWNER_USER_ID || !env.FINTOC_ACCOUNT_ID) return empty('unavailable', 'FINTOC_BALANCE_NOT_CONFIGURED');
  try {
    const select = query || require('../config/database').query;
    const row = (await select(`SELECT currency,available::text,current::text,bank_updated_at,queried_at
      FROM fintoc_bank_balances WHERE user_id=$1 AND account_id=$2`, [owner, env.FINTOC_ACCOUNT_ID])).rows[0];
    if (!row) return empty('unavailable', 'FINTOC_BALANCE_UNAVAILABLE');
    const bankUpdatedAt = iso(row.bank_updated_at), queriedAt = iso(row.queried_at);
    const snapshot = { currency: row.currency, available: String(row.available), current: String(row.current), bankUpdatedAt, queriedAt };
    if (!isValidBankBalanceSnapshot(snapshot) || (row.bank_updated_at !== null && !bankUpdatedAt)) return empty('error', 'FINTOC_BALANCE_INVALID_RESPONSE');
    const instant = typeof now === 'function' ? now() : now || new Date();
    const age = bankUpdatedAt ? new Date(instant).getTime() - Date.parse(bankUpdatedAt) : null;
    const freshness = age === null || !Number.isFinite(age) || age < -300000 ? 'unknown' : age > 86400000 ? 'stale' : 'current';
    const reason = freshness === 'current' ? null : freshness === 'stale' ? 'FINTOC_BALANCE_STALE' : 'FINTOC_BALANCE_TIMESTAMP_UNKNOWN';
    return { source: 'fintoc', provider: 'fintoc', ...snapshot, amount: snapshot.available, state: 'available', freshness, reason };
  } catch (_) { return empty('error', 'FINTOC_BALANCE_STORAGE_ERROR'); }
}
module.exports = { getCanonicalCheckingBalance, isValidBankBalanceSnapshot };
