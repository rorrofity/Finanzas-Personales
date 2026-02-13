/**
 * Script de comparación: Cartola banco (xls) vs Base de datos
 * 
 * Uso: node backend/scripts/compare-bank-statement.js <archivo.xls>
 * 
 * Compara las transacciones no facturadas del banco con las registradas
 * en la base de datos para el mismo período.
 */

const XLSX = require('xlsx');
const path = require('path');

// --- 1. Parsear archivo del banco ---
function parseBankStatement(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // Detectar info de tarjeta
  let cardInfo = '';
  let cupoDisponible = 0, cupoUtilizado = 0, cupoTotal = 0;
  
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i];
    if (row && row[1] === 'Tipo de Tarjeta:') cardInfo = row[2] || '';
    if (row && row[1] === 'Cupo Disponible') {
      const nextRow = rows[i + 1];
      if (nextRow) {
        cupoDisponible = nextRow[1] || 0;
        cupoUtilizado = nextRow[4] || 0;
        cupoTotal = nextRow[7] || 0;
      }
    }
  }

  // Detectar red (mastercard/visa)
  const network = cardInfo.toLowerCase().includes('mastercard') ? 'mastercard' 
    : cardInfo.toLowerCase().includes('visa') ? 'visa' : 'unknown';

  // Parsear transacciones
  const transactions = [];
  for (let i = 15; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[1] || typeof row[1] !== 'string') continue;
    
    // Formato fecha: DD/MM/YYYY
    const fechaMatch = String(row[1]).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!fechaMatch) continue;

    const day = parseInt(fechaMatch[1]);
    const month = parseInt(fechaMatch[2]);
    const year = parseInt(fechaMatch[3]);
    const fechaISO = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

    const descripcion = (row[4] || '').trim();
    const ciudad = (row[6] || '').trim();
    const monto = row[10] || 0;

    // Determinar tipo
    let tipo = 'gasto';
    if (monto < 0) {
      if (descripcion.toLowerCase().includes('pago') && descripcion.toLowerCase().includes('tef')) {
        tipo = 'pago';
      } else if (descripcion.toLowerCase().includes('cred.compra') || descripcion.toLowerCase().includes('cred.compras')) {
        tipo = 'devolucion';
      } else {
        tipo = 'devolucion';
      }
    }

    transactions.push({
      fecha: fechaISO,
      descripcion,
      ciudad,
      monto: Math.abs(monto),
      montoOriginal: monto,
      tipo
    });
  }

  return { cardInfo, network, cupoDisponible, cupoUtilizado, cupoTotal, transactions };
}

// --- 2. Generar resumen del banco ---
function summarizeBank(bankData) {
  const { transactions } = bankData;
  
  const gastos = transactions.filter(t => t.tipo === 'gasto');
  const pagos = transactions.filter(t => t.tipo === 'pago');
  const devoluciones = transactions.filter(t => t.tipo === 'devolucion');

  const totalGastos = gastos.reduce((s, t) => s + t.monto, 0);
  const totalPagos = pagos.reduce((s, t) => s + t.monto, 0);
  const totalDevoluciones = devoluciones.reduce((s, t) => s + t.monto, 0);

  // Rango de fechas
  const fechas = transactions.map(t => t.fecha).sort();
  const fechaMin = fechas[0];
  const fechaMax = fechas[fechas.length - 1];

  return {
    totalTransacciones: transactions.length,
    gastos: { count: gastos.length, total: totalGastos },
    pagos: { count: pagos.length, total: totalPagos },
    devoluciones: { count: devoluciones.length, total: totalDevoluciones },
    neto: totalGastos - totalPagos - totalDevoluciones,
    fechaMin,
    fechaMax
  };
}

// --- 3. Generar SQL para consultar BD ---
function generateDBQuery(bankData) {
  const fechas = bankData.transactions.map(t => t.fecha).sort();
  const fechaMin = fechas[0];
  const fechaMax = fechas[fechas.length - 1];
  const network = bankData.network;

  // Query para obtener transacciones de la BD en el mismo rango
  return `
-- Resumen por tipo de la BD para ${network} entre ${fechaMin} y ${fechaMax}
SELECT 
  t.tipo,
  COUNT(*) as cantidad,
  SUM(ABS(t.monto)) as total_abs
FROM transactions t
LEFT JOIN imports i ON t.import_id = i.id
WHERE t.fecha >= '${fechaMin}'
  AND t.fecha <= '${fechaMax}'
  AND LOWER(COALESCE(i.network, 'unknown')) = '${network}'
GROUP BY t.tipo
ORDER BY t.tipo;

-- Detalle de transacciones de la BD
SELECT 
  t.fecha,
  t.comercio,
  t.monto,
  t.tipo,
  t.billing_year,
  t.billing_month
FROM transactions t
LEFT JOIN imports i ON t.import_id = i.id
WHERE t.fecha >= '${fechaMin}'
  AND t.fecha <= '${fechaMax}'
  AND LOWER(COALESCE(i.network, 'unknown')) = '${network}'
ORDER BY t.fecha DESC, t.comercio;
`;
}

// --- Main ---
const filePath = process.argv[2] || path.join(__dirname, '../../Saldo_y_Mov_No_Facturado.xls');

console.log('='.repeat(70));
console.log('COMPARACIÓN: Cartola Banco vs Base de Datos');
console.log('='.repeat(70));
console.log(`\nArchivo: ${filePath}\n`);

const bankData = parseBankStatement(filePath);
const summary = summarizeBank(bankData);

console.log(`Tarjeta: ${bankData.cardInfo}`);
console.log(`Red: ${bankData.network.toUpperCase()}`);
console.log(`Cupo disponible: $${bankData.cupoDisponible.toLocaleString('es-CL')}`);
console.log(`Cupo utilizado: $${bankData.cupoUtilizado.toLocaleString('es-CL')}`);
console.log(`Cupo total: $${bankData.cupoTotal.toLocaleString('es-CL')}`);

console.log(`\n--- Resumen Banco ---`);
console.log(`Período: ${summary.fechaMin} a ${summary.fechaMax}`);
console.log(`Total transacciones: ${summary.totalTransacciones}`);
console.log(`  Gastos:       ${summary.gastos.count} txns → $${summary.gastos.total.toLocaleString('es-CL')}`);
console.log(`  Pagos:        ${summary.pagos.count} txns → $${summary.pagos.total.toLocaleString('es-CL')}`);
console.log(`  Devoluciones: ${summary.devoluciones.count} txns → $${summary.devoluciones.total.toLocaleString('es-CL')}`);
console.log(`  Neto (gastos - pagos - devoluciones): $${summary.neto.toLocaleString('es-CL')}`);

// Exportar transacciones del banco como JSON para comparación
const bankJSON = JSON.stringify(bankData.transactions.map(t => ({
  fecha: t.fecha,
  descripcion: t.descripcion,
  monto: t.montoOriginal,
  tipo: t.tipo
})), null, 2);

const outPath = filePath.replace(/\.xls$/i, '_parsed.json');
require('fs').writeFileSync(outPath, bankJSON);
console.log(`\nTransacciones del banco exportadas a: ${outPath}`);

console.log(`\n--- SQL para consultar BD ---`);
console.log(generateDBQuery(bankData));

// Exportar transacciones agrupadas por fecha para comparación fácil
console.log('\n--- Transacciones del Banco por Fecha ---');
const byDate = {};
for (const t of bankData.transactions) {
  if (!byDate[t.fecha]) byDate[t.fecha] = [];
  byDate[t.fecha].push(t);
}
for (const fecha of Object.keys(byDate).sort().reverse()) {
  const txns = byDate[fecha];
  const dayTotal = txns.reduce((s, t) => s + t.montoOriginal, 0);
  console.log(`\n${fecha} (${txns.length} txns, neto: $${dayTotal.toLocaleString('es-CL')})`);
  for (const t of txns) {
    const sign = t.montoOriginal < 0 ? '-' : '+';
    console.log(`  ${sign}$${t.monto.toLocaleString('es-CL')} | ${t.descripcion}`);
  }
}
