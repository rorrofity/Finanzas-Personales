const { randomUUID } = require('crypto');

const SOURCES = Object.freeze({
  tc_nacional: { table: 'transactions', foreignKey: 'transaction_id', amount: 'monto', type: 'gasto' },
  tc_internacional: { table: 'intl_unbilled', foreignKey: 'intl_unbilled_id', amount: 'amount_clp', type: 'gasto' },
  cuenta_corriente: { table: 'checking_transactions', foreignKey: 'checking_transaction_id', amount: 'amount', type: 'cargo' },
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function failure(status, code) { return Object.assign(new Error(code), { status, code }); }
function invalid() { return failure(400, 'EXPENSE_SPLIT_INVALID'); }

/** Parse a decimal string directly; never add or compare binary floating point money. */
function toMinor(value) {
  const match = typeof value === 'string' && /^(0|[1-9]\d{0,11})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw invalid();
  const amount = BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0'));
  if (amount <= 0n) throw invalid();
  return amount;
}
function fromMinor(value) {
  if (typeof value !== 'bigint' || value < 0n) throw invalid();
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
}
function identity(owner, source, id) {
  if (typeof owner !== 'string' || !UUID.test(owner) || typeof id !== 'string' || !UUID.test(id)
      || !Object.prototype.hasOwnProperty.call(SOURCES, source)) throw invalid();
  return SOURCES[source];
}
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function strictKeys(value, allowed) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key)) || allowed.some(key => !Object.prototype.hasOwnProperty.call(value, key))) throw invalid();
}
function version(value, allowAbsent) {
  if (allowAbsent && value === 0) return 0;
  if (typeof value !== 'string' || !UUID.test(value)) throw invalid();
  return value.toLowerCase();
}
function putBody(body) {
  strictKeys(body, ['expectedVersion', 'parts']);
  const expectedVersion = version(body.expectedVersion, true);
  if (!Array.isArray(body.parts) || body.parts.length < 2 || body.parts.length > 50) throw invalid();
  const parts = body.parts.map(part => {
    strictKeys(part, ['amount_clp', 'category_id']);
    const minor = toMinor(part.amount_clp);
    if (part.category_id !== null && (!Number.isInteger(part.category_id) || part.category_id < 1 || part.category_id > 2147483647)) throw invalid();
    return { amount_clp: fromMinor(minor), category_id: part.category_id, minor };
  });
  return { expectedVersion, parts };
}
function parentTotal(row, owner, source) {
  if (!row || row.user_id !== owner) throw failure(404, 'EXPENSE_SPLIT_NOT_FOUND');
  let amount;
  try { amount = toMinor(row.amount_clp); } catch (_) { throw failure(400, 'EXPENSE_SPLIT_INELIGIBLE'); }
  if (row.tipo !== SOURCES[source].type || (source === 'cuenta_corriente' && /pago.*tarjeta|pago tc|cargo por pago tc/i.test(row.descripcion || ''))) {
    throw failure(400, 'EXPENSE_SPLIT_INELIGIBLE');
  }
  return amount;
}
const PARTS_JSON = `COALESCE((SELECT json_agg(json_build_object(
  'amount_clp', p.amount_clp::text, 'category_id', p.category_id, 'category_name', c.name) ORDER BY p.position)
  FROM expense_split_parts p LEFT JOIN categories c ON c.id=p.category_id WHERE p.split_id=s.id), '[]'::json)`;
function splitSelect(foreignKey) {
  return `SELECT s.${foreignKey} AS parent_id, s.version, s.amount_clp::text AS total_clp, ${PARTS_JSON} AS parts
    FROM expense_splits s WHERE s.user_id=$1 AND s.${foreignKey}=ANY($2::uuid[])`;
}
const splitDto = row => row && ({ version: row.version, total_clp: row.total_clp || row.amount_clp, parts: row.parts || [] });

function createExpenseSplitService({ db: injectedDb } = {}) {
  const db = () => injectedDb || require('../config/database');
  async function readParts(query, splitId) {
    const result = await query(`SELECT p.amount_clp::text AS amount_clp,p.category_id,c.name AS category_name
      FROM expense_split_parts p LEFT JOIN categories c ON c.id=p.category_id
      WHERE p.split_id=$1 ORDER BY p.position`, [splitId]);
    return result.rows;
  }
  async function get(owner, source, id) {
    const config = identity(owner, source, id);
    const result = await db().query(`SELECT t.id,t.user_id,t.tipo,t.descripcion,t.${config.amount}::text AS amount_clp,
      (SELECT json_build_object('version',s.version,'total_clp',s.amount_clp::text,'parts',${PARTS_JSON})
        FROM expense_splits s WHERE s.user_id=t.user_id AND s.${config.foreignKey}=t.id) AS split
      FROM ${config.table} t WHERE t.id=$1 AND t.user_id=$2`, [id, owner]);
    const parent = result.rows[0], total = parentTotal(parent, owner, source);
    return { source, id, total_clp: fromMinor(total), currency: 'CLP', split: parent.split || null };
  }
  async function write(owner, source, id, expectedVersion, actor, callback) {
    const config = identity(owner, source, id);
    if (typeof actor !== 'string' || !UUID.test(actor)) throw invalid();
    const database = db(), client = await (database.pool || database).connect();
    let begun = false;
    try {
      await client.query('BEGIN'); begun = true;
      // Preserve the existing checking append/import lock order.
      if (source === 'cuenta_corriente') await client.query("SELECT pg_advisory_xact_lock(hashtext('checking-write'),hashtext($1))", [owner]);
      const locked = await client.query(`SELECT id,user_id,tipo,descripcion,${config.amount}::text AS amount_clp
        FROM ${config.table} WHERE id=$1 AND user_id=$2 FOR UPDATE`, [id, owner]);
      const total = parentTotal(locked.rows[0], owner, source);
      const found = await client.query(`SELECT id,version,amount_clp::text AS amount_clp FROM expense_splits
        WHERE user_id=$1 AND ${config.foreignKey}=$2 FOR UPDATE`, [owner, id]);
      const saved = found.rows[0] || null;
      if ((saved ? saved.version : 0) !== expectedVersion || (saved && toMinor(saved.amount_clp) !== total)) {
        throw failure(409, 'EXPENSE_SPLIT_CONFLICT');
      }
      const split = await callback(client, config, saved, total);
      await client.query('COMMIT');
      return { source, id, total_clp: fromMinor(total), currency: 'CLP', split };
    } catch (error) {
      if (begun) { try { await client.query('ROLLBACK'); } catch (_) { /* Preserve original failure. */ } }
      if (error.code === '23503' && String(error.constraint || '').startsWith('expense_split_parts_category')) throw failure(400, 'EXPENSE_SPLIT_INVALID_CATEGORY');
      if (error.code === '23505') throw failure(409, 'EXPENSE_SPLIT_CONFLICT');
      if (error.code === 'P0001' && error.message === 'EXPENSE_SPLIT_PARENT_LOCKED') throw failure(409, 'EXPENSE_SPLIT_PARENT_LOCKED');
      throw error;
    } finally { client.release(); }
  }
  async function put(owner, source, id, body, actor = owner) {
    identity(owner, source, id);
    const { expectedVersion, parts } = putBody(body);
    return write(owner, source, id, expectedVersion, actor, async (client, config, saved, total) => {
      if (parts.reduce((sum, part) => sum + part.minor, 0n) !== total) throw invalid();
      const ids = [...new Set(parts.map(part => part.category_id).filter(value => value !== null))];
      if (ids.length) {
        const categories = await client.query('SELECT id,name FROM categories WHERE (user_id=$1 OR user_id IS NULL) AND id=ANY($2::int[]) FOR KEY SHARE', [owner, ids]);
        if (categories.rows.length !== ids.length) throw failure(400, 'EXPENSE_SPLIT_INVALID_CATEGORY');
      }
      const nextVersion = randomUUID();
      let header;
      if (saved) {
        header = (await client.query('UPDATE expense_splits SET version=$2,updated_by=$3,updated_at=NOW() WHERE id=$1 RETURNING *', [saved.id, nextVersion, actor])).rows[0];
        await client.query('DELETE FROM expense_split_parts WHERE split_id=$1', [saved.id]);
      } else {
        header = (await client.query(`INSERT INTO expense_splits(user_id,source,${config.foreignKey},amount_clp,version,created_by,updated_by)
          VALUES($1,$2,$3,$4,$5,$6,$6) RETURNING *`, [owner, source, id, fromMinor(total), nextVersion, actor])).rows[0];
      }
      for (let position = 0; position < parts.length; position++) {
        const part = parts[position];
        await client.query('INSERT INTO expense_split_parts(split_id,position,amount_clp,category_id) VALUES($1,$2,$3,$4)', [header.id, position, part.amount_clp, part.category_id]);
      }
      return { version: header.version, total_clp: fromMinor(total), parts: await readParts(client.query.bind(client), header.id) };
    });
  }
  async function remove(owner, source, id, body, actor = owner) {
    identity(owner, source, id);
    strictKeys(body, ['expectedVersion']);
    const expectedVersion = version(body.expectedVersion, false);
    return write(owner, source, id, expectedVersion, actor, async (client, _config, saved) => {
      await client.query('DELETE FROM expense_splits WHERE id=$1', [saved.id]);
      return null;
    });
  }
  async function attachSplits(owner, source, rows) {
    if (!Array.isArray(rows)) throw invalid();
    if (!rows.length) return [];
    const config = identity(owner, source, rows[0].id);
    const ids = [...new Set(rows.map(row => { identity(owner, source, row.id); return row.id; }))];
    const result = await db().query(splitSelect(config.foreignKey), [owner, ids]);
    const byId = new Map(result.rows.map(row => [String(row.parent_id), splitDto(row)]));
    return rows.map(row => ({ ...row, split: byId.get(String(row.id)) || null }));
  }
  return { get, put, remove, attachSplits };
}

module.exports = { createExpenseSplitService, toMinor, fromMinor, SOURCES, ...createExpenseSplitService() };
