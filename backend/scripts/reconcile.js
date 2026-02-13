/**
 * Script de conciliación: Compara banco (xls) vs BD (pipe-delimited export)
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// --- Parse bank xls ---
function parseBankXLS(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const txns = [];
  for (let i = 15; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[1] || typeof row[1] !== 'string') continue;
    const m = String(row[1]).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) continue;
    const fecha = `${m[3]}-${m[2]}-${m[1]}`;
    const desc = (row[4] || '').trim();
    const monto = row[10] || 0;
    txns.push({ fecha, descripcion: desc, monto, montoAbs: Math.abs(monto) });
  }
  return txns;
}

// --- Parse DB pipe-delimited ---
function parseDBExport(text) {
  return text.trim().split('\n').filter(l => l.trim()).map(line => {
    const [fecha, descripcion, montoStr, tipo] = line.split('|');
    return { fecha: fecha.trim(), descripcion: descripcion.trim(), monto: parseFloat(montoStr), tipo: tipo.trim() };
  });
}

// --- Normalize description for matching ---
function normalize(s) {
  return s.toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 3) // first 3 words
    .join(' ');
}

// --- Match transactions ---
function reconcile(bankTxns, dbTxns) {
  const matched = [];
  const bankOnly = [];
  const dbOnly = [];
  
  const dbPool = dbTxns.map((t, i) => ({ ...t, idx: i, used: false }));
  
  for (const bt of bankTxns) {
    // Try exact match: same date + same abs amount
    let found = null;
    
    // Pass 1: exact date + exact amount
    for (const dt of dbPool) {
      if (dt.used) continue;
      if (dt.fecha === bt.fecha && Math.abs(dt.monto - bt.montoAbs) < 1) {
        found = dt;
        break;
      }
    }
    
    // Pass 2: date +/- 1 day + exact amount (timezone issues)
    if (!found) {
      const d = new Date(bt.fecha + 'T12:00:00');
      const prev = new Date(d); prev.setDate(prev.getDate() - 1);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      const prevStr = prev.toISOString().slice(0, 10);
      const nextStr = next.toISOString().slice(0, 10);
      
      for (const dt of dbPool) {
        if (dt.used) continue;
        if ((dt.fecha === prevStr || dt.fecha === nextStr) && Math.abs(dt.monto - bt.montoAbs) < 1) {
          found = dt;
          break;
        }
      }
    }
    
    if (found) {
      found.used = true;
      const descMatch = normalize(bt.descripcion) === normalize(found.descripcion);
      matched.push({
        fecha: bt.fecha,
        monto: bt.montoAbs,
        banco_desc: bt.descripcion,
        db_desc: found.descripcion,
        db_fecha: found.fecha,
        dateMatch: bt.fecha === found.fecha,
        descMatch
      });
    } else {
      bankOnly.push(bt);
    }
  }
  
  for (const dt of dbPool) {
    if (!dt.used) dbOnly.push(dt);
  }
  
  return { matched, bankOnly, dbOnly };
}

// --- Format CLP ---
const fmt = n => '$' + Math.abs(n).toLocaleString('es-CL');

// --- Main ---
const bankFile = process.argv[2] || path.join(__dirname, '../../Saldo_y_Mov_No_Facturado.xls');
const dbFile = process.argv[3] || path.join(__dirname, '../../db_transactions.txt');

const bankTxns = parseBankXLS(bankFile);
const dbText = fs.readFileSync(dbFile, 'utf-8');
const dbTxns = parseDBExport(dbText);

console.log('='.repeat(70));
console.log('CONCILIACIÓN BANCO vs BASE DE DATOS');
console.log('='.repeat(70));

// Only compare gastos (positive amounts from bank)
const bankGastos = bankTxns.filter(t => t.monto > 0);
const bankPagos = bankTxns.filter(t => t.monto < 0);
const dbGastos = dbTxns.filter(t => t.tipo === 'gasto');

console.log(`\nBanco: ${bankGastos.length} gastos, ${bankPagos.length} pagos/devoluciones`);
console.log(`BD:    ${dbGastos.length} gastos`);
console.log(`Banco total gastos: ${fmt(bankGastos.reduce((s, t) => s + t.monto, 0))}`);
console.log(`BD total gastos:    ${fmt(dbGastos.reduce((s, t) => s + t.monto, 0))}`);

const result = reconcile(bankGastos, dbGastos);

console.log(`\n--- Resultado ---`);
console.log(`Coincidencias:    ${result.matched.length}`);
console.log(`Solo en Banco:    ${result.bankOnly.length}`);
console.log(`Solo en BD:       ${result.dbOnly.length}`);

// Check date mismatches in matched
const dateMismatches = result.matched.filter(m => !m.dateMatch);
if (dateMismatches.length > 0) {
  console.log(`\n⚠️  Coincidencias con FECHA DISTINTA (${dateMismatches.length}):`);
  for (const m of dateMismatches) {
    console.log(`  ${m.fecha} (banco) vs ${m.db_fecha} (BD) | ${fmt(m.monto)} | ${m.banco_desc.substring(0, 40)}`);
  }
}

// Amount mismatches - check matched with same date but different description
const descMismatches = result.matched.filter(m => !m.descMatch);
if (descMismatches.length > 0) {
  console.log(`\n⚠️  Coincidencias por monto+fecha pero DESCRIPCIÓN DISTINTA (${descMismatches.length}):`);
  for (const m of descMismatches) {
    console.log(`  ${m.fecha} | ${fmt(m.monto)}`);
    console.log(`    Banco: ${m.banco_desc}`);
    console.log(`    BD:    ${m.db_desc}`);
  }
}

if (result.bankOnly.length > 0) {
  const totalBankOnly = result.bankOnly.reduce((s, t) => s + t.monto, 0);
  console.log(`\n❌ SOLO EN BANCO (${result.bankOnly.length} txns, total: ${fmt(totalBankOnly)}):`);
  for (const t of result.bankOnly.sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    console.log(`  ${t.fecha} | ${fmt(t.monto)} | ${t.descripcion}`);
  }
}

if (result.dbOnly.length > 0) {
  const totalDBOnly = result.dbOnly.reduce((s, t) => s + t.monto, 0);
  console.log(`\n❌ SOLO EN BD (${result.dbOnly.length} txns, total: ${fmt(totalDBOnly)}):`);
  for (const t of result.dbOnly.sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    console.log(`  ${t.fecha} | ${fmt(t.monto)} | ${t.descripcion}`);
  }
}

// Pagos/devoluciones del banco
if (bankPagos.length > 0) {
  const totalPagos = bankPagos.reduce((s, t) => s + t.monto, 0);
  console.log(`\n📋 PAGOS/DEVOLUCIONES EN BANCO (no en BD como gastos) (${bankPagos.length} txns, total: ${fmt(totalPagos)}):`);
  for (const t of bankPagos) {
    console.log(`  ${t.fecha} | -${fmt(t.montoAbs)} | ${t.descripcion}`);
  }
}

console.log(`\n--- Resumen de diferencia ---`);
const bankTotal = bankGastos.reduce((s, t) => s + t.monto, 0);
const dbTotal = dbGastos.reduce((s, t) => s + t.monto, 0);
const diff = bankTotal - dbTotal;
console.log(`Diferencia en gastos: ${fmt(diff)} (Banco ${diff > 0 ? '>' : '<'} BD)`);
