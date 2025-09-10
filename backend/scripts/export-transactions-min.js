#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2).reduce((acc, a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  acc[k] = v ?? true;
  return acc;
}, {});

(async () => {
  try {
    const { input, output } = args;
    if (!input) {
      console.error('Uso: node backend/scripts/export-transactions-min.js --input=exports/export_YYYY_MM.json [--output=exports/export_YYYY_MM_min.json]');
      process.exit(1);
    }
    const inPath = path.resolve(input);
    const outPath = path.resolve(output || inPath.replace(/\.json$/, '_min.json'));
    const raw = JSON.parse(fs.readFileSync(inPath, 'utf8'));
    const mapped = raw.map(r => ({
      fecha: (r.fecha || '').slice(0, 10),
      descripcion: r.descripcion,
      monto: Number(r.monto),
      tipo: r.tipo,
      cuotas: r.cuotas ?? null,
      categoria: r.categoria ?? null,
      banco: r.banco ?? null,
      tarjeta: r.tarjeta ?? null
    }));
    fs.writeFileSync(outPath, JSON.stringify(mapped, null, 2), 'utf8');
    console.log(`Escribí ${mapped.length} filas en: ${outPath}`);
    // Totales rápidos
    const totals = mapped.reduce((acc, t) => {
      if (t.tipo === 'gasto') acc.gastos += Math.max(0, t.monto);
      else if (t.tipo === 'pago') acc.pagos += Math.abs(t.monto);
      else if (t.tipo === 'ingreso') acc.ingresos += t.monto;
      else if (t.tipo === 'desestimar') acc.desestimados += 1;
      return acc;
    }, { gastos: 0, pagos: 0, ingresos: 0, desestimados: 0 });
    console.log('Totales (referencia rápida):', totals);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
