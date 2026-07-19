// @ts-check
const { test, expect } = require('@playwright/test');
const { OWNER, PARTNER, ensureUser, authHeaders, spaceHeaders } = require('./helpers/users');
const db = require('./helpers/db');

/**
 * Epic 13 Fase 3 — Reqs 13.8, 13.11, 13.12:
 * /api/push/vapid-public-key, /subscribe, /unsubscribe.
 */

const TEST_ENDPOINT = 'https://fcm.googleapis.com/fcm/send/e2e-test-endpoint-1';

let owner;
let partner;

test.beforeAll(async ({ request }) => {
  owner = await ensureUser(request, OWNER);
  partner = await ensureUser(request, PARTNER);
  await db.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [TEST_ENDPOINT]);
});

test.afterAll(async () => {
  await db.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [TEST_ENDPOINT]);
});

test.describe.serial('Push subscriptions (Epic 13)', () => {
  test('3.T2 GET /push/vapid-public-key retorna solo la clave pública', async ({ request }) => {
    const res = await request.get('/api/push/vapid-public-key', { headers: authHeaders(owner.token) });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.publicKey).toBe('string');
    expect(body.publicKey.length).toBeGreaterThan(10);
    // Nunca debe filtrar la privada
    expect(JSON.stringify(body)).not.toMatch(/private/i);
  });

  test('3.T1a POST /push/subscribe guarda la suscripción del usuario', async ({ request }) => {
    const res = await request.post('/api/push/subscribe', {
      headers: authHeaders(owner.token),
      data: {
        endpoint: TEST_ENDPOINT,
        keys: { p256dh: 'p256dh-fake', auth: 'auth-fake' },
      },
    });
    expect(res.status(), await res.text()).toBeLessThan(300);

    const row = await db.query(`SELECT user_id FROM push_subscriptions WHERE endpoint = $1`, [TEST_ENDPOINT]);
    expect(row.rows[0].user_id).toBe(owner.user.id);
  });

  test('3.T1b re-suscribir el mismo endpoint es idempotente (no duplica filas)', async ({ request }) => {
    const res = await request.post('/api/push/subscribe', {
      headers: authHeaders(owner.token),
      data: { endpoint: TEST_ENDPOINT, keys: { p256dh: 'p256dh-fake-2', auth: 'auth-fake-2' } },
    });
    expect(res.status()).toBeLessThan(300);

    const rows = await db.query(`SELECT id FROM push_subscriptions WHERE endpoint = $1`, [TEST_ENDPOINT]);
    expect(rows.rows.length).toBe(1);
  });

  test('las suscripciones son por persona, no por espacio: otro usuario no puede desuscribir un endpoint ajeno', async ({ request }) => {
    // Las push no usan X-Space-Owner: pertenecen a quien sostiene el
    // dispositivo, sin importar qué espacio esté viendo. `partner` intenta
    // borrar el endpoint de `owner` con su propia identidad → no lo posee.
    const res = await request.post('/api/push/unsubscribe', {
      headers: authHeaders(partner.token),
      data: { endpoint: TEST_ENDPOINT },
    });
    expect(res.status()).toBe(404);
    const rows = await db.query(`SELECT id FROM push_subscriptions WHERE endpoint = $1`, [TEST_ENDPOINT]);
    expect(rows.rows.length).toBe(1);
  });

  test('3.T1c POST /push/unsubscribe elimina la suscripción del dueño', async ({ request }) => {
    const res = await request.post('/api/push/unsubscribe', {
      headers: authHeaders(owner.token),
      data: { endpoint: TEST_ENDPOINT },
    });
    expect(res.status()).toBeLessThan(300);

    const rows = await db.query(`SELECT id FROM push_subscriptions WHERE endpoint = $1`, [TEST_ENDPOINT]);
    expect(rows.rows.length).toBe(0);
  });
});
