const db = require('../config/database');

/**
 * Modelo de suscripciones Web Push (Epic 13).
 * Una fila = un dispositivo/navegador suscrito para un usuario.
 */

/** Crea o actualiza la suscripción (idempotente por endpoint único). */
async function upsert(userId, { endpoint, p256dh, auth, userAgent }) {
  const result = await db.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       user_agent = EXCLUDED.user_agent
     RETURNING id`,
    [userId, endpoint, p256dh, auth, userAgent || null]
  );
  return result.rows[0];
}

async function listByUser(userId) {
  const result = await db.query(
    `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
    [userId]
  );
  return result.rows;
}

async function deleteByEndpoint(endpoint) {
  await db.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
}

/** Borra solo si pertenece al usuario (evita que uno borre la sub de otro). */
async function deleteByEndpointForUser(userId, endpoint) {
  const result = await db.query(
    `DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2 RETURNING id`,
    [endpoint, userId]
  );
  return result.rows[0] || null;
}

module.exports = { upsert, listByUser, deleteByEndpoint, deleteByEndpointForUser };
