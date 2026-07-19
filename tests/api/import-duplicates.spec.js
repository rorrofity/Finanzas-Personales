// @ts-check
const { test, expect } = require('@playwright/test');
const XLSX = require('xlsx');
const { OWNER, ensureUser, authHeaders } = require('./helpers/users');
const db = require('./helpers/db');

/**
 * Bug producción: importar una cartola con muchos movimientos carga solo
 * parcialmente y muestra "Error al importar el archivo".
 *
 * Causa raíz (3 defectos encadenados):
 *  1. El catch de duplicado en Transaction.importFromCSV referencia `fechaStr`
 *     (fuera de scope) → ReferenceError que ABORTA toda la importación.
 *  2. El pre-check de duplicados compara monto parseado (4499) contra el de
 *     la BD (4499.00) → no detecta duplicados de re-importación.
 *  3. El índice único ux_transactions_user_fecha_desc_monto bloquea duplicados
 *     internos legítimos (2 compras idénticas el mismo día).
 *
 * Esta cartola de prueba reproduce el caso: filas únicas + 2 duplicados
 * internos genuinos. Debe cargar la TOTALIDAD sin abortar.
 */

const PFX = 'E2E-IMP';
let owner;

/** Construye un .xls con el formato "Saldo y Mov No Facturado" del Banco de Chile. */
function buildStatementXls(rows) {
  // aoa: col A=0, B=1(fecha), C=2, E=4(descripción), H=7(cuotas), K=10(monto)
  const aoa = [
    [],
    [null, 'Movimientos Nacionales'],
    [null, 'Fecha', 'Tipo de Tarjeta', null, 'Descripción', null, null, 'Cuotas', null, null, 'Monto ($)'],
  ];
  for (const r of rows) {
    const row = new Array(11).fill(null);
    row[1] = r.fecha;         // B
    row[2] = 'Titular****3076';
    row[4] = r.descripcion;   // E
    row[7] = '01/01';         // H cuotas
    row[10] = r.monto;        // K monto
    aoa.push(row);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Saldo y Mov No Facturado');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xls' });
}

const FILE_ROWS = [
  { fecha: '05/08/2026', descripcion: `${PFX} JUMBO`, monto: '95,907' },
  { fecha: '05/08/2026', descripcion: `${PFX} COPEC`, monto: '64,416' },
  { fecha: '04/08/2026', descripcion: `${PFX} NETFLIX`, monto: '9,990' },
  { fecha: '03/08/2026', descripcion: `${PFX} FLIXBUS`, monto: '4,499' },
  { fecha: '03/08/2026', descripcion: `${PFX} FLIXBUS`, monto: '4,499' }, // duplicado interno genuino
  { fecha: '02/08/2026', descripcion: `${PFX} UNIMARC`, monto: '47,997' },
  { fecha: '01/08/2026', descripcion: `${PFX} PEDIDOSYA`, monto: '6,700' },
  { fecha: '01/08/2026', descripcion: `${PFX} PEDIDOSYA`, monto: '6,700' }, // duplicado interno genuino
  { fecha: '01/08/2026', descripcion: `${PFX} PAGO PAP CUENTA CORRIENTE`, monto: '-50,000' }, // pago (negativo)
];

const uploadStatement = (request, token, buffer) =>
  request.post('/api/transactions/import', {
    // Sin Content-Type manual: Playwright arma el multipart boundary
    headers: { Authorization: `Bearer ${token}` },
    multipart: {
      file: { name: 'Saldo_y_Mov_No_Facturado.xls', mimeType: 'application/vnd.ms-excel', buffer },
      provider: 'banco_chile',
      network: 'visa',
      periodYear: '2026',
      periodMonth: '8',
    },
  });

async function countImported(userId) {
  const res = await db.query(
    `SELECT COUNT(*)::int AS n FROM transactions WHERE user_id = $1 AND descripcion LIKE $2`,
    [userId, `${PFX}%`]
  );
  return res.rows[0].n;
}

test.beforeAll(async ({ request }) => {
  owner = await ensureUser(request, OWNER);
  await db.query(`DELETE FROM transactions WHERE descripcion LIKE $1`, [`${PFX}%`]);
});

test.afterAll(async () => {
  await db.query(`DELETE FROM transactions WHERE descripcion LIKE $1`, [`${PFX}%`]);
});

test.describe.serial('Importación con duplicados (bug carga parcial)', () => {
  test('carga la TOTALIDAD del archivo sin abortar (incluye duplicados internos)', async ({ request }) => {
    const res = await uploadStatement(request, owner.token, buildStatementXls(FILE_ROWS));
    expect(res.status(), await res.text()).toBeLessThan(400);

    // 9 filas en el archivo (7 gastos únicos + 2 duplicados genuinos + ... )
    // Se esperan las 9 insertadas (los duplicados internos son compras reales).
    expect(await countImported(owner.user.id)).toBe(FILE_ROWS.length);
  });

  test('re-importar el mismo archivo es idempotente (todo se omite, sin error)', async ({ request }) => {
    const res = await uploadStatement(request, owner.token, buildStatementXls(FILE_ROWS));
    expect(res.status(), await res.text()).toBeLessThan(400);
    // No se duplica nada: sigue habiendo exactamente FILE_ROWS.length
    expect(await countImported(owner.user.id)).toBe(FILE_ROWS.length);
  });
});
