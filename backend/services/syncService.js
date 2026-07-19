const axios = require('axios');
const db = require('../config/database');

/**
 * Servicio de sincronización de emails vía N8N (Epic 13).
 *
 * `runSync` extrae la llamada al webhook que antes vivía embebida en el
 * endpoint POST /sync-emails, para que la comparta tanto el disparo manual
 * (botón) como el programado (scheduler). NUNCA lanza: cualquier fallo
 * (N8N caído, timeout, error de parseo) se captura, se registra en
 * `sync_runs` y se retorna como `{imported: 0, skipped: 0, error}` — así
 * el scheduler puede seguir con el siguiente usuario sin abortar (Req 13.4).
 */

/** Parsea la respuesta de N8N (puede venir como objeto, array, o {json}). */
function parseN8nResult(data) {
  let result = data || {};
  if (Array.isArray(result)) {
    for (const item of result.flat(2)) {
      if (item && (item.imported !== undefined || item.success !== undefined)) {
        result = item;
        break;
      }
      if (item && item.json && (item.json.imported !== undefined || item.json.success !== undefined)) {
        result = item.json;
        break;
      }
    }
  }
  if (result.json && typeof result.json === 'object') {
    result = result.json;
  }
  return result;
}

async function logSyncRun(userId, trigger, { imported, skipped, error }) {
  try {
    await db.query(
      `INSERT INTO sync_runs (user_id, trigger, imported, skipped, error)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, trigger, imported, skipped, error || null]
    );
  } catch (logError) {
    // La bitácora es best-effort: no debe hacer fallar la sincronización.
    console.error('Error registrando sync_run:', logError.message);
  }
}

/**
 * Ejecuta la sincronización de emails para un usuario.
 * @param {string} userId
 * @param {'manual'|'scheduled'} trigger
 * @returns {Promise<{imported:number, skipped:number, errors:Array, error:?string}>}
 */
async function runSync(userId, trigger) {
  const startTime = Date.now();

  try {
    const userCheck = await db.query('SELECT id, nombre FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      const result = { imported: 0, skipped: 0, errors: [], error: 'Usuario no encontrado' };
      await logSyncRun(userId, trigger, result);
      return result;
    }

    const n8nUrl = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/sync-bank-emails';
    const n8nResponse = await axios.post(
      n8nUrl,
      { userId, timestamp: new Date().toISOString(), userName: userCheck.rows[0].nombre },
      { timeout: 60000, headers: { 'Content-Type': 'application/json' } }
    );

    const parsed = parseN8nResult(n8nResponse.data);
    const result = {
      imported: parsed.imported || 0,
      skipped: parsed.skipped || 0,
      errors: parsed.errors || [],
      error: null,
    };

    const duration = Date.now() - startTime;
    console.log(
      `📊 [sync:${trigger}] usuario ${userId}: ${result.imported} importadas, ${result.skipped} omitidas en ${duration}ms`
    );

    await logSyncRun(userId, trigger, result);
    return result;
  } catch (error) {
    const result = { imported: 0, skipped: 0, errors: [], error: error.message };
    console.error(`❌ [sync:${trigger}] error para usuario ${userId}:`, error.message);
    await logSyncRun(userId, trigger, result);
    return result;
  }
}

module.exports = { runSync, parseN8nResult };
