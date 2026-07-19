const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');

/**
 * Servicio de notificaciones Web Push / VAPID (Epic 13, principio PUSH-001).
 * Las claves privadas viven SOLO en variables de entorno del servidor.
 */

let vapidConfigured = false;
function ensureVapid() {
  if (vapidConfigured) return;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
  }
}

/**
 * Envía `payload` a todas las suscripciones del usuario. Nunca lanza: si
 * una suscripción devuelve 404/410 (expirada, Req 13.11) se elimina; otros
 * errores por suscripción se registran y no interrumpen el resto.
 */
async function sendToUser(userId, payload) {
  ensureVapid();
  const subs = await PushSubscription.listByUser(userId);
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await PushSubscription.deleteByEndpoint(sub.endpoint);
        } else {
          console.error(`❌ [push] error enviando a ${sub.endpoint}:`, error.message || error);
        }
      }
    })
  );
}

/** Notificación tras una sincronización con transacciones nuevas (Req 13.9). */
async function notifySync(userId, imported) {
  await sendToUser(userId, {
    title: 'Finanzas Personales',
    body: `Se sincronizaron ${imported} transacción${imported !== 1 ? 'es' : ''} nueva${imported !== 1 ? 's' : ''} — toca para categorizar`,
    url: '/transactions',
  });
}

module.exports = { sendToUser, notifySync };
