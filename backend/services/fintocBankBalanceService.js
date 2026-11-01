const { withCheckingWriteTransaction } = require('./withCheckingWriteTransaction');

class FintocBankBalanceError extends Error {
  constructor(status, code, message) { super(message); this.name = 'FintocBankBalanceError'; this.status = status; this.code = code; }
}
const failure = (status, suffix, message) => new FintocBankBalanceError(status, `FINTOC_BALANCE_${suffix}`, message);
const iso = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null;
const signedInteger = value => typeof value === 'string' && /^(0|-?[1-9]\d*)$/.test(value)
  && Number.isSafeInteger(Number(value)) && String(Number(value)) === value;
function validSnapshot(snapshot) {
  return snapshot?.currency === 'CLP' && signedInteger(snapshot.available) && signedInteger(snapshot.current)
    && typeof snapshot.queriedAt === 'string' && iso(snapshot.queriedAt)
    && (snapshot.bankUpdatedAt === null || (typeof snapshot.bankUpdatedAt === 'string' && iso(snapshot.bankUpdatedAt)));
}

/** Additive bank metadata only; neither an older request nor older bank data can regress it. */
async function storeBankBalance(client, config, snapshot) {
  if (!config?.userId || !config.accountId || !validSnapshot(snapshot)) {
    throw failure(502, 'INVALID_RESPONSE', 'El saldo bancario no pudo validarse.');
  }
  const result = await client.query(`INSERT INTO fintoc_bank_balances
    (user_id,account_id,currency,available,current,bank_updated_at,queried_at)
    VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (user_id,account_id) DO UPDATE SET currency=EXCLUDED.currency,
      available=EXCLUDED.available,current=EXCLUDED.current,
      bank_updated_at=EXCLUDED.bank_updated_at,queried_at=EXCLUDED.queried_at
    WHERE fintoc_bank_balances.queried_at <= EXCLUDED.queried_at
      AND (fintoc_bank_balances.bank_updated_at IS NULL
        OR (EXCLUDED.bank_updated_at IS NOT NULL AND fintoc_bank_balances.bank_updated_at <= EXCLUDED.bank_updated_at))`,
  [config.userId, config.accountId, snapshot.currency, snapshot.available, snapshot.current,
    iso(snapshot.bankUpdatedAt), iso(snapshot.queriedAt)]);
  return result.rowCount === 1;
}

function createFintocBankBalanceService({ db, provider, env = process.env, now = () => new Date() }) {
  const pool = db.pool || db;
  function owner(actorId) {
    if (!env.FINTOC_OWNER_USER_ID || actorId !== env.FINTOC_OWNER_USER_ID || !env.FINTOC_ACCOUNT_ID) {
      throw failure(403, 'FORBIDDEN', 'El saldo bancario solo está disponible para su titular configurado.');
    }
    return { userId: env.FINTOC_OWNER_USER_ID, accountId: env.FINTOC_ACCOUNT_ID };
  }
  async function getBankBalance(actorId) {
    const config = owner(actorId);
    try {
      const row = (await pool.query(`SELECT currency,available::text,current::text,bank_updated_at,queried_at
        FROM fintoc_bank_balances WHERE user_id=$1 AND account_id=$2`, [config.userId, config.accountId])).rows[0];
      if (!row) return { provider: 'fintoc', currency: 'CLP', available: null, current: null,
        bankUpdatedAt: null, queriedAt: null, freshness: 'unknown', state: 'unavailable' };
      const bankUpdatedAt = iso(row.bank_updated_at), queriedAt = iso(row.queried_at);
      const snapshot = { currency: row.currency, available: String(row.available), current: String(row.current), bankUpdatedAt, queriedAt };
      if (!validSnapshot(snapshot)) throw failure(502, 'INVALID_RESPONSE', 'El saldo bancario guardado no pudo validarse.');
      const age = bankUpdatedAt ? new Date(now()).getTime() - Date.parse(bankUpdatedAt) : null;
      const freshness = age === null || age < -300000 ? 'unknown' : age > 86400000 ? 'stale' : 'current';
      return { provider: 'fintoc', ...snapshot, freshness, state: 'available' };
    } catch (error) {
      if (error instanceof FintocBankBalanceError) throw error;
      throw failure(500, 'STORAGE_ERROR', 'No se pudo consultar el saldo bancario.');
    }
  }
  async function refreshBalance(actorId) {
    const config = owner(actorId);
    let snapshot;
    try { snapshot = await provider.readBalance(actorId); }
    catch (error) {
      const known = typeof error?.code === 'string' && /^FINTOC_[A-Z_]{1,64}$/.test(error.code)
        && [400, 401, 403, 429, 500, 502, 503, 504].includes(error.status);
      throw new FintocBankBalanceError(known ? error.status : 502, known ? error.code : 'FINTOC_BALANCE_PROVIDER_ERROR', 'No se pudo completar la consulta del saldo bancario.');
    }
    try { await withCheckingWriteTransaction(pool, config.userId, client => storeBankBalance(client, config, snapshot)); }
    catch (error) {
      if (error instanceof FintocBankBalanceError) throw error;
      throw failure(500, 'STORAGE_ERROR', 'No se pudo guardar el saldo bancario.');
    }
    return getBankBalance(actorId);
  }
  return { getBankBalance, refreshBalance };
}

let singleton;
function defaultService() {
  if (!singleton) singleton = createFintocBankBalanceService({ db: require('../config/database'), provider: require('./fintocReadOnlyService'), env: process.env });
  return singleton;
}
module.exports = { createFintocBankBalanceService, storeBankBalance, isValidBankBalanceSnapshot: validSnapshot, FintocBankBalanceError,
  getBankBalance: actorId => defaultService().getBankBalance(actorId),
  refreshBalance: actorId => defaultService().refreshBalance(actorId) };
