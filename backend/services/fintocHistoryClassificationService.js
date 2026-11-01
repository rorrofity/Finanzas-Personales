const { createHash } = require('crypto');
const { withCheckingWriteTransaction } = require('./withCheckingWriteTransaction');

class FintocHistoryClassificationError extends Error {
  constructor(status, code, message) { super(message); this.name = 'FintocHistoryClassificationError'; this.status = status; this.code = code; }
}
const failure = (status, suffix, message) => new FintocHistoryClassificationError(status, `FINTOC_CLASSIFICATION_${suffix}`, message);
const normalize = value => typeof value === 'string'
  ? value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() : '';
const PLACEHOLDERS = new Set(['sin categorizar', 'sin categoria', 'sin clasificar', 'sin clasificacion', 'uncategorized']);
const validCategoryId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;

/** Exact complete descriptions retain names, account/reference digits and type. */
function planHistoryClassification({ targets, history, categories }) {
  const actions = [];
  const targetIds = new Set(targets.map(row => String(row.id)));
  const availableCategories = new Map(categories.filter(category => validCategoryId(category.id)
    && normalize(category.name) && !PLACEHOLDERS.has(normalize(category.name))).map(category => [Number(category.id), category]));
  for (const target of targets) {
    if (target.category_id !== null && target.category_id !== undefined) continue;
    const checkingId = String(target.id);
    const description = normalize(target.descripcion);
    const leave = (reason, support = 0) => actions.push({ checkingId, decision: 'leave', categoryId: null, reason, support });
    if (!description || !['cargo', 'abono'].includes(target.tipo)) { leave('invalid_description'); continue; }
    // Checking stores at most 60 characters. Do not infer a beneficiary from
    // that prefix when the complete bank description carries another identity.
    if (Object.hasOwn(target, 'source_description') && normalize(target.source_description) !== description) {
      leave('source_description_mismatch'); continue;
    }
    const seen = new Set();
    const examples = history.filter(row => {
      const category = availableCategories.get(Number(row.category_id));
      if (!category || row.created_checking === true || targetIds.has(String(row.id)) || seen.has(String(row.id))) return false;
      if (target.user_id !== undefined && (row.user_id !== target.user_id
        || (category.user_id !== null && category.user_id !== target.user_id))) return false;
      if (row.tipo !== target.tipo || normalize(row.descripcion) !== description) return false;
      seen.add(String(row.id));
      return true;
    });
    const categoryIds = new Set(examples.map(row => Number(row.category_id)));
    if (categoryIds.size === 0) leave('no_history');
    else if (categoryIds.size !== 1) leave('history_conflict', examples.length);
    else actions.push({ checkingId, decision: 'classify', categoryId: [...categoryIds][0], reason: 'history_unanimous', support: examples.length });
  }
  actions.sort((left, right) => left.checkingId.localeCompare(right.checkingId));
  return { actions, summary: actions.reduce((summary, action) => { summary[action.decision] += 1; return summary; }, { classify: 0, leave: 0 }) };
}

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const serialize = value => JSON.stringify(canonical(value));
const sorted = (rows, key) => [...rows].sort((left, right) => String(key(left)).localeCompare(String(key(right))));
const fullSnapshot = row => row.immutable_snapshot || serialize(row);
function protectedSnapshot(row) {
  if (row.protected_snapshot) return row.protected_snapshot;
  const { category_id, updated_at, immutable_snapshot, protected_snapshot, ...protectedFields } = row;
  return serialize(protectedFields);
}
const CHECKING_SELECT = `SELECT t.*,t.fecha::text AS fecha,row_to_json(t)::text AS immutable_snapshot,
  (to_jsonb(t)-'category_id'-'updated_at')::text AS protected_snapshot
  FROM checking_transactions t WHERE t.user_id=$1 ORDER BY t.id`;

function createFintocHistoryClassificationService({ db, env = process.env, now = () => new Date() }) {
  const pool = db.pool || db;
  function configuration(actorId) {
    if (!env.FINTOC_OWNER_USER_ID || actorId !== env.FINTOC_OWNER_USER_ID || !env.FINTOC_ACCOUNT_ID) {
      throw failure(403, 'FORBIDDEN', 'La clasificación solo está disponible para el titular configurado.');
    }
    return { userId: env.FINTOC_OWNER_USER_ID, accountId: env.FINTOC_ACCOUNT_ID };
  }
  async function load(client, config, forUpdate) {
    const lock = forUpdate ? ' FOR UPDATE' : '';
    const checking = (await client.query(CHECKING_SELECT + lock, [config.userId])).rows;
    // Load every account's mapping so inferred classifications never become
    // manual training examples merely because they belong to another account.
    const mappings = (await client.query(`SELECT e.*,row_to_json(e)::text AS immutable_snapshot
      FROM fintoc_external_movements e WHERE e.user_id=$1 ORDER BY e.account_id,e.external_id${lock}`, [config.userId])).rows;
    const categories = (await client.query(`SELECT c.*,row_to_json(c)::text AS immutable_snapshot
      FROM categories c WHERE c.user_id=$1 OR c.user_id IS NULL ORDER BY c.id${lock}`, [config.userId])).rows;
    return { checking, mappings, categories };
  }
  function build(snapshot, config) {
    const importedIds = new Set(snapshot.mappings.filter(row => row.created_checking === true && row.checking_transaction_id)
      .map(row => String(row.checking_transaction_id)));
    const targetIds = new Set(snapshot.mappings.filter(row => row.account_id === config.accountId
      && row.created_checking === true && row.checking_transaction_id).map(row => String(row.checking_transaction_id)));
    const sourceById = new Map(snapshot.mappings.filter(row => row.account_id === config.accountId && row.created_checking === true
      && row.checking_transaction_id).map(row => [String(row.checking_transaction_id), row]));
    const targets = snapshot.checking.filter(row => targetIds.has(String(row.id)) && row.category_id === null)
      .map(row => ({ ...row, source_description: sourceById.get(String(row.id))?.descripcion }));
    const history = snapshot.checking.filter(row => !importedIds.has(String(row.id)));
    const planning = planHistoryClassification({ targets, history, categories: snapshot.categories });
    const input = { version: 1, config,
      checking: sorted(snapshot.checking, row => row.id),
      mappings: sorted(snapshot.mappings, row => `${row.account_id}:${row.external_id}`),
      categories: sorted(snapshot.categories, row => row.id) };
    const digest = createHash('sha256').update(serialize(input)).digest('hex');
    return { version: 1, digest, ...planning };
  }
  async function execute(actorId, input, applying) {
    const config = configuration(actorId);
    if (applying && (!input || typeof input.digest !== 'string' || !/^[a-f0-9]{64}$/.test(input.digest))) {
      throw failure(400, 'INVALID_PLAN', 'Se requiere un plan de clasificación revisado previamente.');
    }
    try {
      return await withCheckingWriteTransaction(pool, config.userId, async client => {
        const snapshot = await load(client, config, applying);
        const plan = build(snapshot, config);
        if (!applying) return plan;
        if (input.digest !== plan.digest) throw failure(409, 'STALE_PLAN', 'El historial cambió. Genera y revisa otro plan de clasificación.');
        const at = new Date(now()).toISOString();
        const selected = new Map(plan.actions.filter(action => action.decision === 'classify').map(action => [action.checkingId, action]));
        for (const action of selected.values()) {
          const changed = await client.query(`UPDATE checking_transactions SET category_id=$3,updated_at=$4
            WHERE user_id=$1 AND id=$2 AND category_id IS NULL RETURNING id`, [config.userId, action.checkingId, action.categoryId, at]);
          if (changed.rowCount !== 1) throw failure(500, 'INTEGRITY', 'Una categoría protegida cambió y la operación fue revertida.');
        }
        const after = (await client.query(CHECKING_SELECT + ' FOR UPDATE', [config.userId])).rows;
        const afterById = new Map(after.map(row => [String(row.id), row]));
        if (after.length !== snapshot.checking.length) throw failure(500, 'INTEGRITY', 'La operación alteró movimientos protegidos y fue revertida.');
        for (const original of snapshot.checking) {
          const id = String(original.id), current = afterById.get(id), action = selected.get(id);
          if (!current || (action ? Number(current.category_id) !== action.categoryId || protectedSnapshot(original) !== protectedSnapshot(current)
            : fullSnapshot(original) !== fullSnapshot(current))) {
            throw failure(500, 'INTEGRITY', 'La operación alteró campos protegidos y fue revertida.');
          }
        }
        return { ...plan, status: 'success', classified: plan.summary.classify, left: plan.summary.leave };
      });
    } catch (error) {
      if (error instanceof FintocHistoryClassificationError) throw error;
      throw failure(500, 'STORAGE_ERROR', 'No se pudo completar la clasificación.');
    }
  }
  return { preview: actorId => execute(actorId, null, false), apply: (actorId, input) => execute(actorId, input, true) };
}

module.exports = { planHistoryClassification, createFintocHistoryClassificationService, FintocHistoryClassificationError };
