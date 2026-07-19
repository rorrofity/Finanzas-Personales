// @ts-check
const { test, expect } = require('@playwright/test');
const { OWNER, PARTNER, THIRD, ensureUser, authHeaders, spaceHeaders } = require('./helpers/users');
const db = require('./helpers/db');

/**
 * Epic 12 Fase 0 — Req 12.1: GET /api/dashboard/overview
 * Un solo endpoint agrega K1–K7 para el período (año/mes calendario,
 * consistente con getMonthlyHistory). Funciona en espacio compartido.
 */

const PFX = 'E2E-OVW';
let owner;
let partner;
let third;
let catIds = {};

test.beforeAll(async ({ request }) => {
  owner = await ensureUser(request, OWNER);
  partner = await ensureUser(request, PARTNER);
  third = await ensureUser(request, THIRD);
  await db.cleanSpaceMemberships([OWNER.email, PARTNER.email, THIRD.email]);
  await db.query(`DELETE FROM transactions WHERE descripcion LIKE $1`, [`${PFX}%`]);
  await db.query(`DELETE FROM categories WHERE name LIKE 'OVW-%' AND user_id = $1`, [owner.user.id]);

  // Categorías del dueño
  for (const name of ['OVW-Cat1', 'OVW-Cat2']) {
    const r = await db.query(
      `INSERT INTO categories (user_id, name) VALUES ($1, $2) RETURNING id`,
      [owner.user.id, name]
    );
    catIds[name] = r.rows[0].id;
  }

  // Agosto 2026: 100.000 (Cat1) + 50.000 (Cat2) · Julio 2026: 100.000 (Cat1)
  const seed = [
    ['2026-08-05', 100000, catIds['OVW-Cat1']],
    ['2026-08-10', 50000, catIds['OVW-Cat2']],
    ['2026-07-05', 100000, catIds['OVW-Cat1']],
  ];
  for (const [fecha, monto, cat] of seed) {
    await db.query(
      `INSERT INTO transactions (user_id, fecha, descripcion, monto, tipo, category_id)
       VALUES ($1, $2, $3, $4, 'gasto', $5)`,
      [owner.user.id, fecha, `${PFX} ${fecha}`, monto, cat]
    );
  }

  // Membresía del partner (solo lectura basta para overview)
  await request.post('/api/space/members', {
    headers: authHeaders(owner.token),
    data: { email: PARTNER.email, canEdit: false, canDelete: false },
  });
});

test.afterAll(async () => {
  await db.query(`DELETE FROM transactions WHERE descripcion LIKE $1`, [`${PFX}%`]);
  await db.query(`DELETE FROM categories WHERE name LIKE 'OVW-%' AND user_id = $1`, [owner.user.id]);
  await db.cleanSpaceMemberships([OWNER.email, PARTNER.email, THIRD.email]);
});

test.describe.serial('Overview del Dashboard (Req 12.1)', () => {
  test('0.T1 shape completo K1–K7 con datos del período', async ({ request }) => {
    const res = await request.get('/api/dashboard/overview?year=2026&month=8', {
      headers: authHeaders(owner.token),
    });
    expect(res.status()).toBe(200);
    const o = await res.json();

    expect(o.period).toEqual({ year: 2026, month: 8 });
    // K2: gasto total del período
    expect(o.gastos.value).toBe(150000);
    // K1: balance = ingresos (0) - gastos
    expect(o.balance.value).toBe(-150000);
    expect(o.ingresos.value).toBe(0);
    // K3: sin ingresos → null (no división por cero)
    expect(o.tasaAhorro).toBeNull();
    // K4: existe (null si el período no es el mes en curso)
    expect(o).toHaveProperty('burnRate');
    // K5: compromisos del período siguiente con desglose
    expect(typeof o.compromisos.total).toBe('number');
    expect(o.compromisos).toHaveProperty('tcNoFacturado');
    expect(o.compromisos).toHaveProperty('cuotas');
    expect(o.compromisos).toHaveProperty('proyectados');
    // K6
    expect(typeof o.disponibleHoy).toBe('number');
    // K7: top categorías con pct y orden desc
    expect(o.topCategorias.length).toBeGreaterThanOrEqual(2);
    expect(o.topCategorias[0].name).toBe('OVW-Cat1');
    expect(o.topCategorias[0].total).toBe(100000);
    expect(o.topCategorias[0].pct).toBeCloseTo(0.667, 2);
    expect(o.topCategorias[1].name).toBe('OVW-Cat2');
  });

  test('0.T2 deltas vs período anterior; divisor 0 → null', async ({ request }) => {
    // Agosto vs julio: 150.000 vs 100.000 → +50%
    const aug = await (
      await request.get('/api/dashboard/overview?year=2026&month=8', {
        headers: authHeaders(owner.token),
      })
    ).json();
    expect(aug.gastos.deltaPct).toBeCloseTo(50, 1);

    // Julio vs junio (0) → delta null
    const jul = await (
      await request.get('/api/dashboard/overview?year=2026&month=7', {
        headers: authHeaders(owner.token),
      })
    ).json();
    expect(jul.gastos.value).toBe(100000);
    expect(jul.gastos.deltaPct).toBeNull();
  });

  test('0.T3 espacio compartido: miembro 200 con datos del dueño; extraño 403', async ({ request }) => {
    const asMember = await request.get('/api/dashboard/overview?year=2026&month=8', {
      headers: spaceHeaders(partner.token, owner.user.id),
    });
    expect(asMember.status()).toBe(200);
    const o = await asMember.json();
    expect(o.gastos.value).toBe(150000);

    const asStranger = await request.get('/api/dashboard/overview?year=2026&month=8', {
      headers: spaceHeaders(third.token, owner.user.id),
    });
    expect(asStranger.status()).toBe(403);
  });
});
