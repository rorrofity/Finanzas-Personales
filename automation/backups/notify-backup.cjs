'use strict';

const path = require('path');

const emptyResult = (reason) => ({ delivered: false, subscriptions: 0, deliveredCount: 0, failedCount: 0, reason });
function validEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return false;
  if (Object.keys(event).some(key => !['type', 'usedPercent'].includes(key))) return false;
  if (!['disk-high', 'backup-failed'].includes(event.type)) return false;
  if (event.type === 'disk-high' && !Object.prototype.hasOwnProperty.call(event, 'usedPercent')) return false;
  return event.usedPercent === undefined || (Number.isInteger(event.usedPercent) && event.usedPercent >= 0 && event.usedPercent <= 100);
}

/** Operational alerts only. Reads subscriptions, never modifies or deletes them. */
async function notifyEvent(event, dependencies = {}) {
  if (!validEvent(event)) return emptyResult('invalid-event');
  const env = dependencies.env || process.env;
  const owner = env.CARD_STATEMENTS_OWNER_USER_ID || env.FINTOC_OWNER_USER_ID;
  if (!owner || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return emptyResult('not-configured');
  let pool;
  let client;
  let subscriptions;
  try {
    const Pool = dependencies.Pool || require('pg').Pool;
    pool = new Pool({
      host: env.DB_HOST || 'localhost', port: env.DB_PORT || '5432',
      database: env.DB_NAME || 'finanzas_personales', user: env.DB_USER, password: env.DB_PASSWORD,
      max: 1, connectionTimeoutMillis: 5000, idleTimeoutMillis: 1000,
      statement_timeout: 5000, options: '-c default_transaction_read_only=on',
    });
    pool.on('error', () => {}); // Never log a connection string or database error detail.
    client = await pool.connect();
    await client.query('BEGIN TRANSACTION READ ONLY');
    subscriptions = (await client.query('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1', [owner])).rows;
    await client.query('COMMIT');
  } catch (_) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return emptyResult('database-unavailable');
  } finally {
    if (client) client.release();
    if (pool) await pool.end().catch(() => {});
  }
  if (!subscriptions.length) return emptyResult('no-subscriptions');

  const result = { delivered: false, subscriptions: subscriptions.length, deliveredCount: 0, failedCount: 0 };
  try {
    const webpush = dependencies.webpush || require('web-push');
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    const body = JSON.stringify({
      title: 'Finanzas Personales',
      body: event.type === 'disk-high'
        ? `El disco del servidor está al ${event.usedPercent} %. Revisa el espacio disponible y los respaldos.`
        : 'El respaldo automático no pudo completarse. Revisa el estado de los respaldos del servidor.',
      url: '/settings',
    });
    await Promise.all(subscriptions.map(async sub => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, { timeout: 15000, TTL: 3600 });
        result.deliveredCount += 1;
      } catch (_) {
        result.failedCount += 1;
      }
    }));
    result.delivered = result.deliveredCount > 0;
    if (!result.delivered) result.reason = 'delivery-failed';
  } catch (_) {
    result.failedCount = subscriptions.length;
    result.reason = 'delivery-unavailable';
  }
  return result;
}

async function main() {
  try {
    let input = '';
    for await (const chunk of process.stdin) {
      input += chunk;
      if (Buffer.byteLength(input) > 4096) throw new Error('INVALID_EVENT');
    }
    const event = JSON.parse(input);
    if (!validEvent(event)) throw new Error('INVALID_EVENT');
    const loaded = require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
    if (loaded.error) throw new Error('PRIVATE_CONFIGURATION_UNAVAILABLE');
    const result = await notifyEvent(event);
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (_) {
    process.stdout.write(JSON.stringify(emptyResult('notification-unavailable')) + '\n');
    process.exitCode = 1;
  }
}
if (require.main === module) main();
module.exports = { notifyEvent };
