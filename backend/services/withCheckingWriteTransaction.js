/** Serialize all checking append decisions for the same owner on one client. */
async function withCheckingWriteTransaction(db, userId, callback) {
  if (typeof userId !== 'string' || !userId.trim()) throw new TypeError('A checking owner is required');
  const pool = db.pool || db;
  const client = await pool.connect();
  let begun = false;
  try {
    await client.query('BEGIN');
    begun = true;
    await client.query("SELECT pg_advisory_xact_lock(hashtext('checking-write'), hashtext($1))", [userId]);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (failure) {
    if (begun) {
      try { await client.query('ROLLBACK'); } catch (_) { /* Preserve the original failure. */ }
    }
    throw failure;
  } finally {
    client.release();
  }
}

module.exports = { withCheckingWriteTransaction };
