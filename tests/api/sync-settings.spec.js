// @ts-check
const { test, expect } = require('@playwright/test');
const { OWNER, PARTNER, ensureUser, authHeaders, spaceHeaders } = require('./helpers/users');
const db = require('./helpers/db');

/**
 * Epic 13 Fase 1 — Reqs 13.2, 13.3, 13.5:
 * /api/sync/settings (opt-in a sync programada) y /api/sync/runs (bitácora).
 */

let owner;
let partner;

test.beforeAll(async ({ request }) => {
  owner = await ensureUser(request, OWNER);
  partner = await ensureUser(request, PARTNER);
  await db.cleanSpaceMemberships([OWNER.email, PARTNER.email]);
  await db.query(`UPDATE users SET auto_sync_enabled = false WHERE id = $1`, [owner.user.id]);

  await request.post('/api/space/members', {
    headers: authHeaders(owner.token),
    data: { email: PARTNER.email, canEdit: true, canDelete: true },
  });
});

test.afterAll(async () => {
  await db.cleanSpaceMemberships([OWNER.email, PARTNER.email]);
});

test.describe.serial('Sync settings y bitácora (Epic 13)', () => {
  test('1.T2a GET /sync/settings refleja el estado actual (por defecto desactivado)', async ({ request }) => {
    const res = await request.get('/api/sync/settings', { headers: authHeaders(owner.token) });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.autoSyncEnabled).toBe(false);
  });

  test('1.T2b PUT /sync/settings activa la sincronización programada (dueño)', async ({ request }) => {
    const res = await request.put('/api/sync/settings', {
      headers: authHeaders(owner.token),
      data: { autoSyncEnabled: true },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.autoSyncEnabled).toBe(true);

    const check = await request.get('/api/sync/settings', { headers: authHeaders(owner.token) });
    expect((await check.json()).autoSyncEnabled).toBe(true);
  });

  test('1.T2c PUT /sync/settings sobre el espacio del dueño: miembro → 403', async ({ request }) => {
    const res = await request.put('/api/sync/settings', {
      headers: spaceHeaders(partner.token, owner.user.id),
      data: { autoSyncEnabled: true },
    });
    expect(res.status()).toBe(403);
  });

  test('1.T3 GET /sync/runs lista las últimas ejecuciones del usuario', async ({ request }) => {
    await db.query(
      `INSERT INTO sync_runs (user_id, trigger, imported, skipped, error) VALUES ($1,'manual',3,1,NULL)`,
      [owner.user.id]
    );
    await db.query(
      `INSERT INTO sync_runs (user_id, trigger, imported, skipped, error) VALUES ($1,'scheduled',0,0,'timeout')`,
      [owner.user.id]
    );

    const res = await request.get('/api/sync/runs', { headers: authHeaders(owner.token) });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.runs.length).toBeGreaterThanOrEqual(2);
    expect(body.runs[0]).toHaveProperty('trigger');
    expect(body.runs[0]).toHaveProperty('imported');
    expect(body.runs[0]).toHaveProperty('createdAt');
  });
});
