const { createHash } = require('crypto');
const { withCheckingWriteTransaction } = require('./withCheckingWriteTransaction');

const SAFE_REASONS = new Set(['initial_unmatched', 'before_cutover', 'ambiguous_match', 'future_date']);
const STICKY_REASONS = new Set(['provider_changed', 'provider_reversed', 'provider_missing', 'financial_record_removed']);
const MAX_AMOUNT = 999999999999n;

class FintocInitialReconciliationError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'FintocInitialReconciliationError';
    this.status = status;
    this.code = code;
  }
}
function failure(status, suffix, message) {
  return new FintocInitialReconciliationError(status, `FINTOC_RECONCILIATION_${suffix}`, message);
}
const safeStorageError = () => failure(500, 'STORAGE_ERROR', 'No se pudo completar la conciliación.');
const text = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const descriptionKey = value => text(value).slice(0, 60);
const day = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
function validDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
function cents(value) {
  const match = String(value).match(/^(\d+)(?:\.(\d{1,2}))?$/);
  return match ? (BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0'))).toString() : null;
}
const fromMovement = row => ({ date: day(row.fecha), description: row.descripcion, type: row.tipo, amount: String(row.amount) });
const fromChecking = row => ({ date: day(row.fecha), description: row.descripcion, type: row.tipo, amount: String(row.amount) });
const exactKey = item => `${item.date}|${item.type}|${cents(item.amount)}|${descriptionKey(item.description)}`;
function broadMatch(left, right) {
  return validDay(left.date) && validDay(right.date) && left.type === right.type && cents(left.amount) !== null
    && cents(left.amount) === cents(right.amount)
    && Math.abs(Date.parse(`${left.date}T00:00:00Z`) - Date.parse(`${right.date}T00:00:00Z`)) <= 3 * 86400000;
}
function santiagoDay(date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date).reduce((result, part) => { result[part.type] = part.value; return result; }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Plan explicit history reconciliation without mutating inputs or financial data. */
function planInitialReconciliation({ movements, checking, otherExpenses = [], baselineCreatedAt, asOfDate }) {
  const actions = [];
  const unresolved = [];
  const referenced = new Set(movements.filter(row => row.checking_transaction_id).map(row => String(row.checking_transaction_id)));
  // Both the original immutable signature and the provider's current fields can
  // identify a reissued/corrected movement. Neither is permission to recreate it.
  const evidence = [];
  for (const row of movements) {
    if (row.had_financial_reference || row.checking_transaction_id || row.created_checking
      || STICKY_REASONS.has(row.reason) || ['reversed', 'manually_reversed'].includes(row.status)) {
      for (const signature of [row.financial_snapshot, row.first_snapshot, fromMovement(row)]) {
        if (signature && validDay(day(signature.date))) evidence.push({ ...signature, date: day(signature.date), externalId: row.external_id });
      }
    }
  }
  const hold = (row, reason, candidateCount = 0) => ({ externalId: row.external_id, decision: 'hold', reason, candidateCount, checkingTransactionId: null });
  for (const row of movements) {
    // Text timestamps supplied by SQL retain PostgreSQL's microseconds; comparing
    // Date objects here would accidentally admit later observations in the same ms.
    if (row.disposition !== 'needs_review' || typeof row.first_seen_at !== 'string'
      || typeof baselineCreatedAt !== 'string' || row.first_seen_at !== baselineCreatedAt) continue;
    if (!SAFE_REASONS.has(row.reason) || row.had_financial_reference || row.checking_transaction_id || row.created_checking) {
      actions.push(hold(row, row.reason || 'ambiguous_match'));
      continue;
    }
    if (row.status !== 'confirmed' || row.pending !== false) {
      actions.push(hold(row, row.reason));
      continue;
    }
    const item = fromMovement(row);
    if (!/^mov_[A-Za-z0-9_-]+$/.test(row.external_id) || !validDay(item.date)
      || typeof item.description !== 'string' || !item.description.trim() || item.description.length > 2000
      || !['cargo', 'abono'].includes(item.type) || !/^[1-9]\d*$/.test(item.amount)) {
      actions.push(hold(row, row.reason));
      continue;
    }
    if (BigInt(item.amount) > MAX_AMOUNT) {
      actions.push(hold(row, 'amount_out_of_range'));
      continue;
    }
    if (item.date > asOfDate) {
      actions.push(hold(row, 'future_date'));
      continue;
    }
    unresolved.push({ row, item });
  }
  const groups = new Map();
  for (const entry of unresolved) {
    const key = exactKey(entry.item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  for (const group of groups.values()) {
    const item = group[0].item;
    const fullDescriptions = new Set(group.map(entry => text(entry.item.description)));
    const localCandidates = checking.filter(row => broadMatch(item, fromChecking(row)));
    const freeExact = localCandidates.filter(row => !referenced.has(String(row.id)) && exactKey(item) === exactKey(fromChecking(row)));
    const metadataCandidates = evidence.filter(signature => group.every(entry => entry.row.external_id !== signature.externalId) && broadMatch(item, signature));
    const cardCandidates = item.type === 'cargo' ? otherExpenses.filter(row => broadMatch(item, { ...row, type: 'cargo', date: day(row.date) })
      && descriptionKey(item.description) === descriptionKey(row.description)) : [];
    // Several immutable/current signatures can describe the same bank ID.
    // Count the source identity once while retaining every blocking signature.
    const metadataCandidateCount = new Set(metadataCandidates.map(row => row.externalId)).size;
    const candidateCount = localCandidates.length + metadataCandidateCount + cardCandidates.length;
    const collision = fullDescriptions.size > 1;
    if (!collision && group.length === 1 && freeExact.length === 1 && localCandidates.length === 1
      && metadataCandidates.length === 0 && cardCandidates.length === 0) {
      actions.push({ externalId: group[0].row.external_id, decision: 'link', reason: null, candidateCount: 1, checkingTransactionId: String(freeExact[0].id) });
    } else if (collision || candidateCount > 0) {
      for (const entry of group) actions.push(hold(entry.row, 'ambiguous_match', candidateCount));
    } else {
      for (const entry of group) actions.push({ externalId: entry.row.external_id, decision: 'insert', reason: null, candidateCount: 0, checkingTransactionId: null });
    }
  }
  actions.sort((left, right) => left.externalId.localeCompare(right.externalId));
  return { actions, summary: actions.reduce((summary, action) => { summary[action.decision] += 1; return summary; }, { insert: 0, link: 0, hold: 0 }) };
}

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const serialize = value => JSON.stringify(canonical(value));
const sorted = (rows, key) => [...rows].sort((left, right) => String(key(left)).localeCompare(String(key(right))));
const immutableChecking = row => row.immutable_snapshot || serialize(row);

const CHECKING_SELECT = `SELECT t.*,t.fecha::text AS fecha,row_to_json(t)::text AS immutable_snapshot
  FROM checking_transactions t WHERE t.user_id=$1 ORDER BY t.id`;

function createFintocInitialReconciliationService({ db, env = process.env, now = () => new Date() }) {
  const pool = db.pool || db;
  function configuration(actorId) {
    if (!env.FINTOC_OWNER_USER_ID || actorId !== env.FINTOC_OWNER_USER_ID || !env.FINTOC_ACCOUNT_ID) {
      throw failure(403, 'FORBIDDEN', 'La conciliación solo está disponible para su titular configurado.');
    }
    return { userId: env.FINTOC_OWNER_USER_ID, accountId: env.FINTOC_ACCOUNT_ID };
  }
  async function load(client, config, forUpdate) {
    const lock = forUpdate ? ' FOR UPDATE' : '';
    const state = (await client.query(`SELECT s.*,s.created_at::text AS baseline_created_at,row_to_json(s)::text AS immutable_snapshot
      FROM fintoc_sync_state s WHERE s.user_id=$1 AND s.account_id=$2${lock}`, [config.userId, config.accountId])).rows[0];
    if (!state) throw failure(409, 'NOT_INITIALIZED', 'Primero debe existir una carga inicial completa.');
    const movements = (await client.query(`SELECT e.*,e.fecha::text AS fecha,e.first_seen_at::text AS first_seen_at,row_to_json(e)::text AS immutable_snapshot
      FROM fintoc_external_movements e WHERE e.user_id=$1 AND e.account_id=$2 ORDER BY e.external_id${lock}`, [config.userId, config.accountId])).rows;
    const checking = (await client.query(CHECKING_SELECT + lock, [config.userId])).rows;
    const otherExpenses = (await client.query(`SELECT 'card' AS source,id::text,fecha::text AS date,descripcion AS description,monto::text AS amount,'cargo' AS type
      FROM transactions WHERE user_id=$1 AND monto>0
      UNION ALL
      SELECT 'international' AS source,id::text,fecha::text AS date,descripcion AS description,amount_clp::text AS amount,'cargo' AS type
      FROM intl_unbilled WHERE user_id=$1 AND amount_clp>0`, [config.userId])).rows;
    return { state, movements, checking, otherExpenses };
  }
  function build(snapshot, config, asOfDate) {
    const planning = planInitialReconciliation({ ...snapshot, baselineCreatedAt: snapshot.state.baseline_created_at, asOfDate });
    const normalized = { config, asOfDate, state: snapshot.state,
      movements: sorted(snapshot.movements, row => row.external_id), checking: sorted(snapshot.checking, row => row.id),
      otherExpenses: sorted(snapshot.otherExpenses, row => `${row.source}:${row.id}`) };
    const digest = createHash('sha256').update(serialize({ version: 1, ...normalized })).digest('hex');
    return { version: 1, asOfDate, digest, ...planning };
  }
  async function execute(actorId, input, applyPlan) {
    const config = configuration(actorId);
    if (applyPlan && (!input || typeof input.digest !== 'string' || !/^[a-f0-9]{64}$/.test(input.digest))) {
      throw failure(400, 'INVALID_PLAN', 'La conciliación requiere un plan válido revisado previamente.');
    }
    try {
      return await withCheckingWriteTransaction(pool, config.userId, async client => {
        const at = new Date(now()).toISOString();
        const asOfDate = santiagoDay(new Date(at));
        const snapshot = await load(client, config, applyPlan);
        const plan = build(snapshot, config, asOfDate);
        if (!applyPlan) return plan;
        if (plan.digest !== input.digest) throw failure(409, 'STALE_PLAN', 'El historial cambió. Genera y revisa un nuevo plan antes de conciliar.');
        const original = new Map(snapshot.checking.map(row => [String(row.id), immutableChecking(row)]));
        const movementById = new Map(snapshot.movements.map(row => [row.external_id, row]));
        const checkingById = new Map(snapshot.checking.map(row => [String(row.id), row]));
        for (const action of plan.actions) {
          const row = movementById.get(action.externalId);
          if (action.decision === 'hold') {
            if (row.reason !== action.reason || Number(row.candidate_count || 0) !== action.candidateCount) {
              await client.query(`UPDATE fintoc_external_movements SET reason=$4,candidate_count=$5,updated_at=$6
                WHERE user_id=$1 AND account_id=$2 AND external_id=$3`, [config.userId, config.accountId, row.external_id, action.reason, action.candidateCount, at]);
            }
            continue;
          }
          let checkingId = action.checkingTransactionId;
          let signature;
          if (action.decision === 'insert') {
            const date = day(row.fecha);
            const description = row.descripcion.trim().slice(0, 60);
            const added = await client.query(`INSERT INTO checking_transactions
              (user_id,year,month,fecha,descripcion,tipo,amount,category_id,notas)
              VALUES($1,$2,$3,$4,$5,$6,$7,NULL,NULL) RETURNING id`,
            [config.userId, Number(date.slice(0, 4)), Number(date.slice(5, 7)), date, description, row.tipo, String(row.amount)]);
            checkingId = String(added.rows[0].id);
            signature = { date, description, type: row.tipo, amount: String(row.amount) };
          } else signature = fromChecking(checkingById.get(checkingId));
          const mapped = await client.query(`UPDATE fintoc_external_movements SET checking_transaction_id=$4,disposition=$5,
            had_financial_reference=true,created_checking=($5='inserted'),reason=NULL,candidate_count=$6,
            financial_snapshot=COALESCE(financial_snapshot,$7::jsonb),updated_at=$8
            WHERE user_id=$1 AND account_id=$2 AND external_id=$3`,
          [config.userId, config.accountId, row.external_id, checkingId, action.decision === 'insert' ? 'inserted' : 'linked', action.candidateCount, JSON.stringify(signature), at]);
          if (mapped.rowCount !== 1) throw failure(500, 'INTEGRITY', 'La conciliación no pudo conservar su referencia bancaria.');
        }
        const after = (await client.query(CHECKING_SELECT + ' FOR UPDATE', [config.userId])).rows;
        const afterById = new Map(after.map(row => [String(row.id), immutableChecking(row)]));
        for (const [id, fingerprint] of original) {
          if (afterById.get(id) !== fingerprint) throw failure(500, 'INTEGRITY', 'La conciliación alteró un registro protegido y fue revertida.');
        }
        if (after.length !== original.size + plan.summary.insert) throw failure(500, 'INTEGRITY', 'La conciliación produjo un conjunto de movimientos inesperado y fue revertida.');
        await client.query(`INSERT INTO fintoc_sync_runs
          (user_id,account_id,trigger,status,inserted,linked,review,coverage_since,coverage_until,bank_updated_at,started_at,finished_at)
          VALUES($1,$2,'manual','success',$3,$4,$5,$6,$7,$8,$9,$9)`,
        [config.userId, config.accountId, plan.summary.insert, plan.summary.link, plan.summary.hold,
          snapshot.state.coverage_since, snapshot.state.coverage_until, snapshot.state.bank_updated_at, at]);
        return { ...plan, status: 'success', inserted: plan.summary.insert, linked: plan.summary.link, held: plan.summary.hold };
      });
    } catch (error) {
      if (error instanceof FintocInitialReconciliationError) throw error;
      throw safeStorageError();
    }
  }
  return { preview: actorId => execute(actorId, null, false), apply: (actorId, input) => execute(actorId, input, true) };
}

module.exports = { planInitialReconciliation, createFintocInitialReconciliationService, FintocInitialReconciliationError };
