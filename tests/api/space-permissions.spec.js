// @ts-check
const { test, expect } = require('@playwright/test');
const {
  OWNER,
  PARTNER,
  THIRD,
  ensureUser,
  authHeaders,
  spaceHeaders,
} = require('./helpers/users');
const db = require('./helpers/db');

/**
 * Fase 2 — Matriz de permisos en TODOS los recursos de datos (Epic 11).
 * Reqs 11.5 (lectura), 11.6 (can_edit), 11.7 (can_delete),
 * 11.9 (sync solo dueño), 11.10 (config solo dueño), 11.11 (auditoría).
 *
 * Flujo serial: membresía parte sin permisos → se van otorgando.
 */

const TEST_EMAILS = [OWNER.email, PARTNER.email, THIRD.email];
const TX_PREFIX = 'E2E-SPACE-F2';

let owner;
let partner;
let third;
let membershipId;

test.beforeAll(async ({ request }) => {
  owner = await ensureUser(request, OWNER);
  partner = await ensureUser(request, PARTNER);
  third = await ensureUser(request, THIRD);
  await db.cleanSpaceMemberships(TEST_EMAILS);
  await db.cleanTestTransactions(TX_PREFIX);

  // Membresía base: solo lectura
  const inv = await request.post('/api/space/members', {
    headers: authHeaders(owner.token),
    data: { email: PARTNER.email, canEdit: false, canDelete: false },
  });
  membershipId = (await inv.json()).member.id;
});

test.afterAll(async () => {
  await db.cleanSpaceMemberships(TEST_EMAILS);
  await db.cleanTestTransactions(TX_PREFIX);
  // No cerrar el pool: es compartido entre archivos de spec del mismo worker.
});

const setPerms = async (request, perms) => {
  const res = await request.put(`/api/space/members/${membershipId}`, {
    headers: authHeaders(owner.token),
    data: perms,
  });
  expect(res.status()).toBe(200);
};

test.describe.serial('Fase 2 — Matriz de permisos por recurso', () => {
  test('2.T3 lectura del espacio compartido: miembro 200, extraño 403', async ({
    request,
  }) => {
    const readEndpoints = [
      '/api/transactions',
      '/api/dashboard/monthly-history',
      '/api/financial-health/summary',
      '/api/billing/periods',
      '/api/cards',
      '/api/categories',
      '/api/installments/plans',
      '/api/intl-unbilled?year=2026&month=7',
      '/api/checking',
      '/api/projected?year=2026&month=7',
      '/api/suspicious/count',
      '/api/sync/sync-status',
    ];

    for (const endpoint of readEndpoints) {
      const asMember = await request.get(endpoint, {
        headers: spaceHeaders(partner.token, owner.user.id),
      });
      expect(asMember.status(), `GET ${endpoint} como miembro`).toBe(200);

      const asStranger = await request.get(endpoint, {
        headers: spaceHeaders(third.token, owner.user.id),
      });
      expect(asStranger.status(), `GET ${endpoint} como extraño`).toBe(403);
    }
  });

  test('2.T4a sin can_edit: toda escritura POST/PUT → 403', async ({ request }) => {
    const writeAttempts = [
      ['post', '/api/transactions', { fecha: '2026-07-12', descripcion: `${TX_PREFIX} x`, monto: 100, tipo: 'gasto' }],
      ['post', '/api/categories', { name: `${TX_PREFIX}-cat` }],
      ['post', '/api/installments/plans', { brand: 'visa', descripcion: `${TX_PREFIX} plan`, amount_per_installment: 1000, installments_total: 3, start_year: 2026, start_month: 8 }],
      ['post', '/api/intl-unbilled', { fecha: '2026-07-12', descripcion: `${TX_PREFIX} intl`, amount_usd: 10 }],
      ['post', '/api/checking', { fecha: '2026-07-12', descripcion: `${TX_PREFIX} chk`, monto: -1000 }],
      ['post', '/api/projected', { descripcion: `${TX_PREFIX} proj`, monto: 1000, tipo: 'gasto', year: 2026, month: 8 }],
      ['put', '/api/checking/balance', { balance: 999999 }],
    ];

    for (const [method, endpoint, data] of writeAttempts) {
      const res = await request[method](endpoint, {
        headers: spaceHeaders(partner.token, owner.user.id),
        data,
      });
      expect(res.status(), `${method.toUpperCase()} ${endpoint} sin can_edit`).toBe(403);
    }
  });

  test('2.T1+2.T2 con can_edit: crea/edita con auditoría; DELETE sigue 403 sin can_delete', async ({
    request,
  }) => {
    await setPerms(request, { canEdit: true });

    // Crear en el espacio del dueño
    const create = await request.post('/api/transactions', {
      headers: spaceHeaders(partner.token, owner.user.id),
      data: { fecha: '2026-07-12', descripcion: `${TX_PREFIX} auditada`, monto: 5000, tipo: 'gasto' },
    });
    expect(create.status()).toBe(201);
    const tx = await create.json();

    // Auditoría (Req 11.11): creada por el MIEMBRO, pertenece al DUEÑO
    const row = await db.query(
      `SELECT user_id, created_by, updated_by FROM transactions WHERE id = $1`,
      [tx.id]
    );
    expect(row.rows[0].user_id).toBe(owner.user.id);
    expect(row.rows[0].created_by).toBe(partner.user.id);

    // Editar → updated_by = miembro
    const upd = await request.put(`/api/transactions/${tx.id}`, {
      headers: spaceHeaders(partner.token, owner.user.id),
      data: { fecha: '2026-07-12', descripcion: `${TX_PREFIX} auditada v2`, monto: 6000, tipo: 'gasto' },
    });
    expect(upd.status()).toBe(200);
    const row2 = await db.query(`SELECT updated_by FROM transactions WHERE id = $1`, [tx.id]);
    expect(row2.rows[0].updated_by).toBe(partner.user.id);

    // El listado expone quién registró (para CreatedByChip, Req 11.12)
    const list = await request.get('/api/transactions', {
      headers: spaceHeaders(partner.token, owner.user.id),
    });
    const rows = await list.json();
    const mine = (Array.isArray(rows) ? rows : rows.transactions || []).find((t) => t.id === tx.id);
    expect(mine.created_by).toBe(partner.user.id);
    expect(mine.created_by_name).toBeTruthy();

    // DELETE sin can_delete → 403 (Req 11.7)
    const del = await request.delete(`/api/transactions/${tx.id}`, {
      headers: spaceHeaders(partner.token, owner.user.id),
    });
    expect(del.status()).toBe(403);

    // Con can_delete → 200
    await setPerms(request, { canDelete: true });
    const del2 = await request.delete(`/api/transactions/${tx.id}`, {
      headers: spaceHeaders(partner.token, owner.user.id),
    });
    expect(del2.status()).toBe(200);
  });

  test('2.T4b deletes de otros recursos respetan can_delete', async ({ request }) => {
    // Crear una categoría con can_edit y borrarla con can_delete
    const cat = await request.post('/api/categories', {
      headers: spaceHeaders(partner.token, owner.user.id),
      data: { name: `${TX_PREFIX}-cat-del` },
    });
    expect(cat.status()).toBe(201);
    const catBody = await cat.json();
    const catId = catBody.id || catBody.category?.id;

    await setPerms(request, { canDelete: false });
    const delDenied = await request.delete(`/api/categories/${catId}`, {
      headers: spaceHeaders(partner.token, owner.user.id),
    });
    expect(delDenied.status()).toBe(403);

    await setPerms(request, { canDelete: true });
    const delOk = await request.delete(`/api/categories/${catId}`, {
      headers: spaceHeaders(partner.token, owner.user.id),
    });
    expect([200, 204]).toContain(delOk.status());
  });

  test('2.T5 sync-emails: miembro → 403; dueño pasa la puerta de autorización', async ({
    request,
  }) => {
    const asMember = await request.post('/api/sync/sync-emails', {
      headers: spaceHeaders(partner.token, owner.user.id),
      data: {},
    });
    expect(asMember.status()).toBe(403);

    // El dueño NO debe recibir 403 (N8N puede no estar corriendo en local:
    // aceptamos cualquier resultado que no sea un rechazo de autorización)
    const asOwner = await request.post('/api/sync/sync-emails', {
      headers: authHeaders(owner.token),
      data: {},
    });
    expect(asOwner.status()).not.toBe(403);
  });

  test('2.T6 config (cards y billing) escritura: miembro → 403 aun con permisos', async ({
    request,
  }) => {
    // El miembro tiene canEdit y canDelete a esta altura — igual debe ser 403 (Req 11.10)
    const cardPost = await request.post('/api/cards', {
      headers: spaceHeaders(partner.token, owner.user.id),
      data: { last_four: '9999', network: 'visa', holder: 'X' },
    });
    expect(cardPost.status()).toBe(403);

    const billingPost = await request.post('/api/billing/periods', {
      headers: spaceHeaders(partner.token, owner.user.id),
      data: { billing_year: 2026, billing_month: 9, start_date: '2026-08-22', end_date: '2026-09-21' },
    });
    expect(billingPost.status()).toBe(403);

    const billingRecalc = await request.post('/api/billing/recalculate/2026/9', {
      headers: spaceHeaders(partner.token, owner.user.id),
      data: {},
    });
    expect(billingRecalc.status()).toBe(403);
  });
});
