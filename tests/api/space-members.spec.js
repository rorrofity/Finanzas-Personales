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
 * Fase 1 — Núcleo ACL (Epic 11): membresías, invitaciones y middleware.
 * Reqs 11.1–11.5, 11.8, 11.10 (admin de miembros solo dueño).
 *
 * La ruta de referencia con resolveSpace en esta fase es /api/transactions;
 * el resto de rutas se adopta en Fase 2.
 */

const TEST_EMAILS = [OWNER.email, PARTNER.email, THIRD.email, 'e2e.pending@test.local'];
const TX_PREFIX = 'E2E-SPACE-F1';

let owner; // {token, user}
let partner;
let third;

test.beforeAll(async ({ request }) => {
  await db.deleteUserByEmail('e2e.pending@test.local');
  owner = await ensureUser(request, OWNER);
  partner = await ensureUser(request, PARTNER);
  third = await ensureUser(request, THIRD);
  await db.cleanSpaceMemberships(TEST_EMAILS);
  await db.cleanTestTransactions(TX_PREFIX);
});

test.afterAll(async () => {
  await db.cleanSpaceMemberships(TEST_EMAILS);
  await db.cleanTestTransactions(TX_PREFIX);
  await db.deleteUserByEmail('e2e.pending@test.local');
  await db.closeDb();
});

test.describe.serial('Fase 1 — Membresías y ACL', () => {
  let membershipId;

  test('1.T1 invitar email existente crea membresía activa y aparece en memberships del miembro', async ({
    request,
  }) => {
    const inv = await request.post('/api/space/members', {
      headers: authHeaders(owner.token),
      data: { email: PARTNER.email, canEdit: true, canDelete: false },
    });
    expect(inv.status()).toBe(201);
    const created = await inv.json();
    expect(created.member.status).toBe('linked');
    expect(created.member.canEdit).toBe(true);
    expect(created.member.canDelete).toBe(false);
    membershipId = created.member.id;

    // El miembro ve el espacio compartido (Req 11.4)
    const res = await request.get('/api/space/memberships', {
      headers: authHeaders(partner.token),
    });
    expect(res.status()).toBe(200);
    const { spaces } = await res.json();
    const own = spaces.find((s) => s.isOwner);
    const shared = spaces.find((s) => !s.isOwner);
    expect(own).toBeTruthy();
    expect(shared).toBeTruthy();
    expect(shared.ownerId).toBe(owner.user.id);
    expect(shared.canEdit).toBe(true);
    expect(shared.canDelete).toBe(false);
  });

  test('1.T2 invitar email sin cuenta queda pending y se vincula al registrarse', async ({
    request,
  }) => {
    const inv = await request.post('/api/space/members', {
      headers: authHeaders(owner.token),
      data: { email: 'e2e.pending@test.local', canEdit: false, canDelete: false },
    });
    expect(inv.status()).toBe(201);
    const created = await inv.json();
    expect(created.member.status).toBe('pending');

    // La persona se registra con ese email → la membresía se vincula (Req 11.2)
    const reg = await request.post('/api/auth/register', {
      data: {
        nombre: 'E2E Pending',
        email: 'e2e.pending@test.local',
        password: 'E2ePending!2026',
      },
    });
    expect(reg.ok()).toBeTruthy();
    const pendingUser = await reg.json();

    const res = await request.get('/api/space/memberships', {
      headers: authHeaders(pendingUser.token),
    });
    const { spaces } = await res.json();
    const shared = spaces.find((s) => !s.isOwner && s.ownerId === owner.user.id);
    expect(shared).toBeTruthy();

    // Limpieza local del caso: revocar esa membresía para no ocupar el cupo
    const members = await (
      await request.get('/api/space/members', { headers: authHeaders(owner.token) })
    ).json();
    const pendingRow = members.members.find(
      (m) => m.invitedEmail === 'e2e.pending@test.local'
    );
    const del = await request.delete(`/api/space/members/${pendingRow.id}`, {
      headers: authHeaders(owner.token),
    });
    expect(del.ok()).toBeTruthy();
  });

  test('1.T3 tercer miembro → 400; duplicado → 409; auto-invitación → 400', async ({
    request,
  }) => {
    // Duplicado (PARTNER ya invitado en 1.T1)
    const dup = await request.post('/api/space/members', {
      headers: authHeaders(owner.token),
      data: { email: PARTNER.email, canEdit: false, canDelete: false },
    });
    expect(dup.status()).toBe(409);

    // Auto-invitación
    const self = await request.post('/api/space/members', {
      headers: authHeaders(owner.token),
      data: { email: OWNER.email, canEdit: false, canDelete: false },
    });
    expect(self.status()).toBe(400);

    // Completar cupo (2) y probar el tercero
    const second = await request.post('/api/space/members', {
      headers: authHeaders(owner.token),
      data: { email: THIRD.email, canEdit: false, canDelete: false },
    });
    expect(second.status()).toBe(201);
    const secondId = (await second.json()).member.id;

    const overflow = await request.post('/api/space/members', {
      headers: authHeaders(owner.token),
      data: { email: 'otro.mas@test.local', canEdit: false, canDelete: false },
    });
    expect(overflow.status()).toBe(400);

    // Liberar el cupo del tercero (THIRD queda sin membresía para 1.T4)
    const del = await request.delete(`/api/space/members/${secondId}`, {
      headers: authHeaders(owner.token),
    });
    expect(del.ok()).toBeTruthy();
  });

  test('1.T4 X-Space-Owner sin membresía → 403; con membresía → 200 con datos del dueño', async ({
    request,
  }) => {
    // Transacción del dueño para verificar visibilidad
    const tx = await request.post('/api/transactions', {
      headers: authHeaders(owner.token),
      data: {
        fecha: '2026-07-10',
        descripcion: `${TX_PREFIX} compra hogar`,
        monto: 12345,
        tipo: 'gasto',
      },
    });
    expect(tx.status()).toBe(201);

    // THIRD no tiene membresía → 403 (Req 11.5)
    const forbidden = await request.get('/api/transactions', {
      headers: spaceHeaders(third.token, owner.user.id),
    });
    expect(forbidden.status()).toBe(403);

    // PARTNER con membresía activa → 200 y ve la transacción del dueño
    const ok = await request.get('/api/transactions', {
      headers: spaceHeaders(partner.token, owner.user.id),
    });
    expect(ok.status()).toBe(200);
    const list = await ok.json();
    const rows = Array.isArray(list) ? list : list.transactions || [];
    expect(rows.some((t) => t.descripcion?.startsWith(TX_PREFIX))).toBe(true);

    // Sin header → espacio propio del PARTNER (no ve datos del dueño)
    const ownSpace = await request.get('/api/transactions', {
      headers: authHeaders(partner.token),
    });
    expect(ownSpace.status()).toBe(200);
    const ownList = await ownSpace.json();
    const ownRows = Array.isArray(ownList) ? ownList : ownList.transactions || [];
    expect(ownRows.some((t) => t.descripcion?.startsWith(TX_PREFIX))).toBe(false);
  });

  test('1.T5 cambiar permisos/activo tiene efecto inmediato (Req 11.8)', async ({
    request,
  }) => {
    // PARTNER tiene canEdit=true (1.T1) → puede crear en el espacio del dueño
    const create = await request.post('/api/transactions', {
      headers: spaceHeaders(partner.token, owner.user.id),
      data: {
        fecha: '2026-07-11',
        descripcion: `${TX_PREFIX} gasto del miembro`,
        monto: 9990,
        tipo: 'gasto',
      },
    });
    expect(create.status()).toBe(201);

    // El dueño quita canEdit → siguiente POST del miembro → 403 (Req 11.6/11.8)
    const offEdit = await request.put(`/api/space/members/${membershipId}`, {
      headers: authHeaders(owner.token),
      data: { canEdit: false },
    });
    expect(offEdit.status()).toBe(200);

    const denied = await request.post('/api/transactions', {
      headers: spaceHeaders(partner.token, owner.user.id),
      data: {
        fecha: '2026-07-11',
        descripcion: `${TX_PREFIX} no deberia entrar`,
        monto: 1000,
        tipo: 'gasto',
      },
    });
    expect(denied.status()).toBe(403);

    // El dueño desactiva la membresía → hasta la lectura → 403
    const off = await request.put(`/api/space/members/${membershipId}`, {
      headers: authHeaders(owner.token),
      data: { isActive: false },
    });
    expect(off.status()).toBe(200);

    const deniedRead = await request.get('/api/transactions', {
      headers: spaceHeaders(partner.token, owner.user.id),
    });
    expect(deniedRead.status()).toBe(403);

    // Reactivar con edición para fases siguientes
    const on = await request.put(`/api/space/members/${membershipId}`, {
      headers: authHeaders(owner.token),
      data: { isActive: true, canEdit: true },
    });
    expect(on.status()).toBe(200);

    const readAgain = await request.get('/api/transactions', {
      headers: spaceHeaders(partner.token, owner.user.id),
    });
    expect(readAgain.status()).toBe(200);
  });

  test('1.T6 administración de miembros: solo el dueño sobre SU espacio', async ({
    request,
  }) => {
    // El miembro no puede modificar/revocar la membresía del espacio del dueño
    const put = await request.put(`/api/space/members/${membershipId}`, {
      headers: authHeaders(partner.token),
      data: { canDelete: true },
    });
    expect([403, 404]).toContain(put.status());

    const del = await request.delete(`/api/space/members/${membershipId}`, {
      headers: authHeaders(partner.token),
    });
    expect([403, 404]).toContain(del.status());

    // Ni siquiera con el header X-Space-Owner (la admin no es delegable)
    const putWithHeader = await request.put(`/api/space/members/${membershipId}`, {
      headers: spaceHeaders(partner.token, owner.user.id),
      data: { canDelete: true },
    });
    expect([403, 404]).toContain(putWithHeader.status());

    // La membresía sigue intacta
    const members = await (
      await request.get('/api/space/members', { headers: authHeaders(owner.token) })
    ).json();
    const row = members.members.find((m) => m.id === membershipId);
    expect(row.canDelete).toBe(false);
    expect(row.isActive).toBe(true);
  });
});
