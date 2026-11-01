const { createHash } = require('crypto');
const { withCheckingWriteTransaction } = require('./withCheckingWriteTransaction');
const { storeBankBalance, isValidBankBalanceSnapshot } = require('./fintocBankBalanceService');

const STATUSES = new Set(['confirmed', 'processing', 'reversed', 'manually_reversed']);
const STICKY = new Set(['provider_changed', 'provider_reversed', 'provider_missing', 'financial_record_removed']);
const PROVIDER_CODES = new Set(['FINTOC_NOT_READY', 'FINTOC_AUTH_FAILED', 'FINTOC_PAYMENT_REQUIRED', 'FINTOC_RATE_LIMITED', 'FINTOC_TIMEOUT', 'FINTOC_INVALID_RESPONSE', 'FINTOC_INCOMPLETE', 'FINTOC_RECONNECT_REQUIRED', 'FINTOC_CONNECTION_UNAVAILABLE', 'FINTOC_UPSTREAM_ERROR']);

class FintocDailySyncError extends Error {
  constructor(status, code, message) { super(message); this.name = 'FintocDailySyncError'; this.status = status; this.code = code; }
}
const fail = (status, code, message) => new FintocDailySyncError(status, code, message);
const invalidSnapshot = () => fail(502, 'FINTOC_DAILY_INVALID_SNAPSHOT', 'La lectura bancaria no entregó un lote completo y válido.');
const day = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
const iso = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null;
const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
const confirmed = item => item.status === 'confirmed' && item.pending === false;
const normalizedDescription = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 60);
const numericKey = value => {
  const match = String(value).match(/^(\d+)(?:\.(\d{1,2}))?$/);
  return match ? (BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0'))).toString() : null;
};
const exactKey = item => `${item.date}|${item.type}|${numericKey(item.amount)}|${normalizedDescription(item.description)}`;
const fromStored = row => ({ externalId: row.external_id, date: day(row.fecha), description: row.descripcion, type: row.tipo, amount: String(row.amount), status: row.status, pending: row.pending });
const fromLegacy = row => ({ date: day(row.fecha), description: row.descripcion, type: row.tipo, amount: String(row.amount) });
const fingerprint = item => createHash('sha256').update(JSON.stringify([item.date, item.description, item.type, numericKey(item.amount), item.status, item.pending])).digest('hex');
const broadMatch = (item, row) => item.type === row.tipo && numericKey(item.amount) === numericKey(row.amount)
  && Math.abs(Date.parse(`${item.date}T00:00:00Z`) - Date.parse(`${day(row.fecha)}T00:00:00Z`)) <= 3 * 86400000;

/** Pure planning: existing financial objects are never mutated. */
function planReconciliation({ items, existing, legacy, cutoverDate, today, baseline, coverage }) {
  const current = new Map(items.map(item => [item.externalId, item]));
  const previous = new Map(existing.map(row => [row.external_id, row]));
  const local = new Map(legacy.map(row => [String(row.id), row]));
  const financialSnapshot = row => row.financial_snapshot || (row.checking_transaction_id && local.has(String(row.checking_transaction_id))
    ? fromLegacy(local.get(String(row.checking_transaction_id))) : fromStored(row));
  // Deleted mapped expenses remain reconciliation evidence even when their FK
  // has become null. Preserve their financial signature across provider edits.
  const tombstones = existing.filter(row => row.had_financial_reference
    && (!row.checking_transaction_id || !local.has(String(row.checking_transaction_id))))
    .map(row => { const value = financialSnapshot(row); return { fecha: value.date, descripcion: value.description, tipo: value.type, amount: value.amount }; });
  const referenced = new Set(existing.filter(row => row.checking_transaction_id).map(row => String(row.checking_transaction_id)));
  const ignored = new Set();
  const actions = [];
  const unresolved = [];
  const missing = existing.filter(row => !current.has(row.external_id) && day(row.fecha) >= coverage.since && day(row.fecha) <= coverage.until);
  for (const row of existing) {
    const item = current.get(row.external_id);
    if (item && row.checking_transaction_id && local.has(String(row.checking_transaction_id)) && confirmed(item)
      && fingerprint(item) === (row.provider_hash || fingerprint(fromStored(row))) && !STICKY.has(row.reason)) ignored.add(String(row.checking_transaction_id));
  }
  const action = (item, row, patch) => ({ item, previous: row || null, checkingTransactionId: row?.checking_transaction_id || null,
    hadFinancialReference: Boolean(row?.had_financial_reference || row?.checking_transaction_id), createdChecking: Boolean(row?.created_checking),
    financialSnapshot: row?.had_financial_reference || row?.checking_transaction_id ? financialSnapshot(row) : null,
    candidateCount: 0, insertFinancial: false, ...patch });
  for (const item of items) {
    const row = previous.get(item.externalId);
    const promotedPending = Boolean(row && !row.had_financial_reference && !row.checking_transaction_id
      && row.disposition === 'observed' && !confirmed(fromStored(row)) && confirmed(item));
    if (row?.had_financial_reference && (!row.checking_transaction_id || !local.has(String(row.checking_transaction_id)))) {
      actions.push(action(item, row, { disposition: 'needs_review', reason: 'financial_record_removed' }));
    } else if (row && !promotedPending && fingerprint(item) !== (row.provider_hash || fingerprint(fromStored(row)))) {
      actions.push(action(item, row, { disposition: 'needs_review', reason: ['reversed', 'manually_reversed'].includes(item.status) ? 'provider_reversed' : 'provider_changed' }));
    } else if (row && STICKY.has(row.reason)) {
      actions.push(action(item, row, { disposition: 'needs_review', reason: row.reason }));
    } else if (row?.checking_transaction_id) {
      actions.push(action(item, row, { disposition: row.disposition, reason: null }));
    } else if (!confirmed(item)) {
      actions.push(action(item, row, { disposition: 'observed', reason: 'not_confirmed' }));
    } else {
      unresolved.push(action(item, row, { promotedPending }));
    }
  }
  const groups = new Map();
  unresolved.forEach(entry => { const key = exactKey(entry.item); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(entry); });
  const claimed = new Set();
  const waiting = [];
  for (const [key, group] of groups) {
    const free = legacy.filter(row => !referenced.has(String(row.id)) && !claimed.has(String(row.id)) && exactKey(fromLegacy(row)) === key);
    const blocked = legacy.filter(row => referenced.has(String(row.id)) && !ignored.has(String(row.id)) && broadMatch(group[0].item, row))
      .concat(tombstones.filter(row => broadMatch(group[0].item, row)));
    if (group.length === 1 && free.length === 1 && blocked.length === 0) {
      const entry = group[0];
      claimed.add(String(free[0].id)); ignored.add(String(free[0].id));
      actions.push({ ...entry, disposition: 'linked', reason: null, checkingTransactionId: String(free[0].id), hadFinancialReference: true, financialSnapshot: fromLegacy(free[0]), candidateCount: 1 });
    } else waiting.push({ group, free });
  }
  for (const { group, free } of waiting) {
    const candidates = legacy.filter(row => !ignored.has(String(row.id)) && !claimed.has(String(row.id)) && broadMatch(group[0].item, row))
      .concat(tombstones.filter(row => broadMatch(group[0].item, row)));
    for (const entry of group) {
      const item = entry.item;
      let reason;
      if (free.length || candidates.length) reason = 'ambiguous_match';
      else if (entry.previous && !entry.promotedPending) reason = entry.previous.reason || 'ambiguous_match';
      else if (group.some(other => other.previous && !other.promotedPending)) reason = 'ambiguous_match';
      else if (baseline) reason = 'initial_unmatched';
      else if (item.date <= cutoverDate) reason = 'before_cutover';
      else if (item.date > today) reason = 'future_date';
      else if (BigInt(item.amount) > 999999999999n) reason = 'amount_out_of_range';
      if (reason) actions.push({ ...entry, disposition: 'needs_review', reason, candidateCount: candidates.length });
      else actions.push({ ...entry, disposition: 'inserted', reason: null, insertFinancial: true, createdChecking: true, hadFinancialReference: true });
    }
  }
  return { actions, missing };
}

function santiagoDay(date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date).reduce((result, part) => { result[part.type] = part.value; return result; }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function selectedMonths(today) {
  const [year, month] = today.split('-').map(Number);
  return [-2, -1, 0].map(shift => { const date = new Date(Date.UTC(year, month - 1 + shift, 1)); return { year: String(date.getUTCFullYear()), month: String(date.getUTCMonth() + 1) }; });
}
function validateSnapshots(snapshots, months) {
  const ids = new Set(); const items = []; const dates = [];
  snapshots.forEach((snapshot, index) => {
    const period = months[index];
    if (snapshot?.provider !== 'fintoc' || snapshot.mode !== 'live' || snapshot.coverage?.complete !== true || !Array.isArray(snapshot.items)
      || snapshot.items.length > 3000 || snapshot.total !== snapshot.items.length || snapshot.period?.year !== Number(period.year) || snapshot.period?.month !== Number(period.month)) throw invalidSnapshot();
    if (snapshot.bankUpdatedAt === null) dates.push(null);
    else { const value = iso(snapshot.bankUpdatedAt); if (!value) throw invalidSnapshot(); dates.push(value); }
    for (const item of snapshot.items) {
      if (!item || typeof item.externalId !== 'string' || !/^mov_[A-Za-z0-9_-]+$/.test(item.externalId) || ids.has(item.externalId)
        || !validDay(item.date) || !item.date.startsWith(`${period.year}-${period.month.padStart(2, '0')}-`)
        || typeof item.description !== 'string' || !item.description.trim() || item.description.length > 2000
        || !['cargo', 'abono'].includes(item.type) || typeof item.amount !== 'string' || !/^[1-9]\d*$/.test(item.amount)
        || !Number.isSafeInteger(Number(item.amount)) || !STATUSES.has(item.status) || typeof item.pending !== 'boolean') throw invalidSnapshot();
      ids.add(item.externalId);
      items.push({ externalId: item.externalId, date: item.date, description: item.description, type: item.type,
        amount: item.amount, status: item.status, pending: item.pending });
    }
  });
  const bankBalance = snapshots.map(snapshot => snapshot.bankBalance).filter(isValidBankBalanceSnapshot).reduce((latest, candidate) => {
    if (!latest) return candidate;
    const oldBank = latest.bankUpdatedAt ? Date.parse(latest.bankUpdatedAt) : -Infinity;
    const newBank = candidate.bankUpdatedAt ? Date.parse(candidate.bankUpdatedAt) : -Infinity;
    return newBank > oldBank || (newBank === oldBank && Date.parse(candidate.queriedAt) > Date.parse(latest.queriedAt)) ? candidate : latest;
  }, null);
  return { items, bankUpdatedAt: dates.some(value => value === null) ? null : dates.sort()[0], bankBalance };
}

const STATE_SELECT = `SELECT cutover_date::text, last_success_at, bank_updated_at, coverage_since::text, coverage_until::text, last_error_code FROM fintoc_sync_state WHERE user_id=$1 AND account_id=$2`;
const EXTERNAL_SELECT = `SELECT external_id, fecha::text, descripcion, tipo, amount::text, status, pending, provider_hash, disposition, reason, checking_transaction_id, had_financial_reference, created_checking, financial_snapshot FROM fintoc_external_movements WHERE user_id=$1 AND account_id=$2`;
const STORE_MOVEMENT = `INSERT INTO fintoc_external_movements
  (user_id,account_id,external_id,fecha,descripcion,tipo,amount,status,pending,provider_hash,disposition,reason,candidate_count,checking_transaction_id,had_financial_reference,created_checking,first_snapshot,last_seen_at,financial_snapshot)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19::jsonb)
  ON CONFLICT (user_id,account_id,external_id) DO UPDATE SET fecha=EXCLUDED.fecha, descripcion=EXCLUDED.descripcion,
  tipo=EXCLUDED.tipo, amount=EXCLUDED.amount, status=EXCLUDED.status, pending=EXCLUDED.pending, provider_hash=EXCLUDED.provider_hash,
  disposition=EXCLUDED.disposition, reason=EXCLUDED.reason, candidate_count=EXCLUDED.candidate_count,
  checking_transaction_id=EXCLUDED.checking_transaction_id, had_financial_reference=EXCLUDED.had_financial_reference,
  created_checking=EXCLUDED.created_checking, financial_snapshot=COALESCE(fintoc_external_movements.financial_snapshot,EXCLUDED.financial_snapshot),
  last_seen_at=EXCLUDED.last_seen_at, updated_at=EXCLUDED.last_seen_at`;

function createFintocDailySyncService({ db, provider, env = process.env, now = () => new Date() }) {
  const pool = db.pool || db;
  const query = (sql, params) => pool.query(sql, params);
  function owner(actorId) {
    if (!env.FINTOC_OWNER_USER_ID || actorId !== env.FINTOC_OWNER_USER_ID) throw fail(403, 'FINTOC_DAILY_FORBIDDEN', 'Esta conexión solo está disponible para su titular.');
    try { provider.assertOwner(actorId); }
    catch (_) { throw fail(403, 'FINTOC_DAILY_FORBIDDEN', 'Esta conexión solo está disponible para su titular.'); }
    return { userId: env.FINTOC_OWNER_USER_ID, accountId: env.FINTOC_ACCOUNT_ID };
  }
  function enabled() {
    if (env.FINTOC_ENABLED !== 'true' || env.FINTOC_PERSONAL_FREE_ACCESS_CONFIRMED !== 'true' || env.FINTOC_DAILY_SYNC_ENABLED !== 'true'
      || !env.FINTOC_OWNER_USER_ID || !env.FINTOC_ACCOUNT_ID) return false;
    const status = provider.getStatus(env.FINTOC_OWNER_USER_ID);
    return status.state === 'ready' && status.mode === 'live';
  }
  async function recordError(config, trigger, coverage, at, code) {
    try {
      await query(`INSERT INTO fintoc_sync_runs (user_id,account_id,trigger,status,coverage_since,coverage_until,error_code,started_at,finished_at)
        SELECT $1,$2,$3,'error',$4,$5,$6,$7,$7 WHERE NOT EXISTS
        (SELECT 1 FROM fintoc_sync_state WHERE user_id=$1 AND account_id=$2 AND last_success_at > $7)`, [config.userId, config.accountId, trigger, coverage.since, coverage.until, code, at]);
      await query(`UPDATE fintoc_sync_state SET last_error_code=$3, updated_at=$4 WHERE user_id=$1 AND account_id=$2 AND (last_success_at IS NULL OR last_success_at <= $4)`, [config.userId, config.accountId, code, at]);
    } catch (_) { /* No raw errors or credentials leave this boundary. */ }
  }
  async function run({ trigger = 'scheduled' } = {}) {
    if (!['initial', 'manual', 'scheduled'].includes(trigger)) throw fail(400, 'FINTOC_DAILY_INVALID_TRIGGER', 'Tipo de ejecución inválido.');
    let active;
    try { active = enabled(); }
    catch (_) { return { status: 'error', initialized: false, inserted: 0, linked: 0, review: 0, errorCode: 'FINTOC_NOT_READY' }; }
    if (!active) return { status: 'disabled', initialized: false, inserted: 0, linked: 0, review: 0, errorCode: null };
    const config = owner(env.FINTOC_OWNER_USER_ID);
    const date = new Date(now()); const today = santiagoDay(date); const at = date.toISOString(); const months = selectedMonths(today);
    const coverage = { since: `${months[0].year}-${months[0].month.padStart(2, '0')}-01`, until: today, complete: true };
    let phase = 'provider';
    try {
      const snapshots = [];
      for (const selected of months) snapshots.push(await provider.readSnapshot(config.userId, selected));
      const snapshot = validateSnapshots(snapshots, months);
      phase = 'storage';
      return await withCheckingWriteTransaction(pool, config.userId, async client => {
        const state = (await client.query(`${STATE_SELECT} FOR UPDATE`, [config.userId, config.accountId])).rows[0];
        if (state?.last_success_at && Date.parse(state.last_success_at) > Date.parse(at)) {
          return { status: 'superseded', initialized: true, inserted: 0, linked: 0, review: 0, errorCode: null };
        }
        const baseline = !state;
        const cutoverDate = baseline ? today : day(state.cutover_date);
        const existing = (await client.query(EXTERNAL_SELECT, [config.userId, config.accountId])).rows;
        const legacy = (await client.query(`SELECT id, fecha::text, descripcion, tipo, amount::text FROM checking_transactions WHERE user_id=$1`, [config.userId])).rows;
        const result = planReconciliation({ items: snapshot.items, existing, legacy, cutoverDate, today, baseline, coverage });
        let inserted = 0; let linked = 0;
        if (baseline) await client.query(`INSERT INTO fintoc_sync_state (user_id,account_id,cutover_date) VALUES ($1,$2,$3)`, [config.userId, config.accountId, cutoverDate]);
        for (const action of result.actions) {
          const item = action.item;
          if (action.insertFinancial) {
            const added = await client.query(`INSERT INTO checking_transactions (user_id,year,month,fecha,descripcion,tipo,amount,category_id,notas)
              VALUES ($1,$2,$3,$4,$5,$6,$7,NULL, NULL) RETURNING id`, [config.userId, Number(item.date.slice(0, 4)), Number(item.date.slice(5, 7)), item.date, item.description.slice(0, 60), item.type, item.amount]);
            action.checkingTransactionId = String(added.rows[0].id); inserted += 1;
            action.financialSnapshot = { date: item.date, description: item.description.slice(0, 60), type: item.type, amount: item.amount };
          } else if (action.disposition === 'linked' && (!action.previous || action.previous.checking_transaction_id !== action.checkingTransactionId)) linked += 1;
          await client.query(STORE_MOVEMENT, [config.userId, config.accountId, item.externalId, item.date, item.description, item.type, item.amount,
            item.status, item.pending, fingerprint(item), action.disposition, action.reason, action.candidateCount, action.checkingTransactionId,
            action.hadFinancialReference, action.createdChecking, JSON.stringify(item), at, action.financialSnapshot ? JSON.stringify(action.financialSnapshot) : null]);
        }
        for (const row of result.missing) await client.query(`UPDATE fintoc_external_movements SET disposition='needs_review',reason='provider_missing',candidate_count=0,updated_at=$4 WHERE user_id=$1 AND account_id=$2 AND external_id=$3`, [config.userId, config.accountId, row.external_id, at]);
        const review = result.actions.filter(action => action.disposition === 'needs_review').length + result.missing.length;
        if (snapshot.bankBalance) await storeBankBalance(client, config, snapshot.bankBalance);
        await client.query(`UPDATE fintoc_sync_state SET last_success_at=$3,bank_updated_at=$4,coverage_since=$5,coverage_until=$6,last_error_code=NULL,updated_at=$3 WHERE user_id=$1 AND account_id=$2`, [config.userId, config.accountId, at, snapshot.bankUpdatedAt, coverage.since, coverage.until]);
        await client.query(`INSERT INTO fintoc_sync_runs (user_id,account_id,trigger,status,inserted,linked,review,coverage_since,coverage_until,bank_updated_at,started_at,finished_at)
          VALUES ($1,$2,$3,'success',$4,$5,$6,$7,$8,$9,$10,$10)`, [config.userId, config.accountId, trigger, inserted, linked, review, coverage.since, coverage.until, snapshot.bankUpdatedAt, at]);
        return { status: 'success', initialized: true, inserted, linked, review, coverage, bankUpdatedAt: snapshot.bankUpdatedAt, errorCode: null };
      });
    } catch (failure) {
      const code = failure instanceof FintocDailySyncError ? failure.code : PROVIDER_CODES.has(failure?.code) ? failure.code : phase === 'storage' ? 'FINTOC_DAILY_STORAGE_ERROR' : 'FINTOC_DAILY_PROVIDER_ERROR';
      await recordError(config, trigger, coverage, at, code);
      return { status: 'error', initialized: false, inserted: 0, linked: 0, review: 0, coverage: { ...coverage, complete: false }, errorCode: code };
    }
  }
  async function getDailyStatus(actorId) {
    const config = owner(actorId);
    try {
      const state = (await query(STATE_SELECT, [config.userId, config.accountId])).rows[0] || null;
      const counts = (await query(`SELECT COUNT(*) FILTER (WHERE disposition='needs_review')::integer AS pending_review_count, COUNT(*) FILTER (WHERE created_checking)::integer AS imported_total FROM fintoc_external_movements WHERE user_id=$1 AND account_id=$2`, [config.userId, config.accountId])).rows[0] || {};
      const last = (await query(`SELECT trigger,status,inserted,linked,review,error_code FROM fintoc_sync_runs WHERE user_id=$1 AND account_id=$2 ORDER BY started_at DESC,id DESC LIMIT 1`, [config.userId, config.accountId])).rows[0] || null;
      const bankUpdatedAt = iso(state?.bank_updated_at);
      const age = bankUpdatedAt ? new Date(now()).getTime() - Date.parse(bankUpdatedAt) : null;
      const bankFreshness = age === null || age < -300000 ? 'unknown' : age > 86400000 ? 'stale' : 'current';
      const active = enabled(); const pendingReviewCount = Number(counts.pending_review_count || 0);
      const lastErrorCode = state?.last_error_code || last?.error_code || null;
      const resultState = !active ? 'disabled' : lastErrorCode ? 'error' : !state ? 'not_initialized' : pendingReviewCount ? 'needs_review' : bankFreshness !== 'current' ? 'stale' : 'current';
      return { provider: 'fintoc', enabled: active, schedule: '07:00', timezone: 'America/Santiago', state: resultState, initialized: Boolean(state),
        cutoverDate: state ? day(state.cutover_date) : null, lastSuccessAt: iso(state?.last_success_at), bankUpdatedAt, bankFreshness,
        coverage: { since: state?.coverage_since ? day(state.coverage_since) : null, until: state?.coverage_until ? day(state.coverage_until) : null, complete: Boolean(state?.last_success_at) },
        pendingReviewCount, importedTotal: Number(counts.imported_total || 0),
        lastRun: last ? { trigger: last.trigger, status: last.status, inserted: Number(last.inserted), linked: Number(last.linked), review: Number(last.review) } : null, lastErrorCode };
    } catch (failure) {
      if (failure instanceof FintocDailySyncError) throw failure;
      throw fail(500, 'FINTOC_DAILY_STORAGE_ERROR', 'No se pudo consultar el estado de la sincronización.');
    }
  }
  async function getReview(actorId, input = {}) {
    const config = owner(actorId);
    const values = {};
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['limit', 'offset'].includes(key))) throw fail(400, 'FINTOC_DAILY_INVALID_QUERY', 'Parámetros de revisión inválidos.');
    for (const [name, fallback] of [['limit', 20], ['offset', 0]]) {
      if (input[name] !== undefined && (typeof input[name] !== 'string' || !/^(0|[1-9]\d*)$/.test(input[name]))) throw fail(400, 'FINTOC_DAILY_INVALID_QUERY', 'Paginación inválida.');
      values[name] = input[name] === undefined ? fallback : Number(input[name]);
      if (!Number.isSafeInteger(values[name]) || values[name] < (name === 'limit' ? 1 : 0) || (name === 'limit' && values[name] > 100)) throw fail(400, 'FINTOC_DAILY_INVALID_QUERY', 'Paginación inválida.');
    }
    try {
      const total = (await query(`SELECT COUNT(*)::integer AS total FROM fintoc_external_movements WHERE user_id=$1 AND account_id=$2 AND disposition='needs_review'`, [config.userId, config.accountId])).rows[0]?.total || 0;
      const items = (await query(`SELECT external_id AS "externalId",fecha::text AS date,descripcion AS description,tipo AS type,amount::text AS amount,status,reason,candidate_count AS "candidateCount" FROM fintoc_external_movements WHERE user_id=$1 AND account_id=$2 AND disposition='needs_review' ORDER BY fecha DESC,external_id LIMIT $3 OFFSET $4`, [config.userId, config.accountId, values.limit, values.offset])).rows;
      return { items, total: Number(total), ...values };
    } catch (_) { throw fail(500, 'FINTOC_DAILY_STORAGE_ERROR', 'No se pudieron consultar los movimientos pendientes.'); }
  }
  return { run, getDailyStatus, getReview };
}

let singleton;
const defaultService = () => {
  if (!singleton) singleton = createFintocDailySyncService({ db: require('../config/database'), provider: require('./fintocReadOnlyService'), env: process.env });
  return singleton;
};
module.exports = { createFintocDailySyncService, FintocDailySyncError, planReconciliation,
  run: input => defaultService().run(input), getDailyStatus: actorId => defaultService().getDailyStatus(actorId), getReview: (actorId, query) => defaultService().getReview(actorId, query) };
