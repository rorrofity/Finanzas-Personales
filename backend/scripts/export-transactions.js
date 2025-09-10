#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const db = require('../config/database');

// Load env from project root .env if present
dotenv.config({ path: path.join(__dirname, '../../.env') });

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (const a of args) {
    const [k, v] = a.replace(/^--/, '').split('=');
    out[k] = v !== undefined ? v : true;
  }
  return out;
}

async function main() {
  try {
    const { year, month, output } = parseArgs();
    if (!year || !month) {
      console.error('Uso: node backend/scripts/export-transactions.js --year=YYYY --month=M [--output=path.json]');
      process.exit(1);
    }

    const query = `
      SELECT 
        t.id,
        t.user_id,
        t.fecha::date AS fecha,
        t.descripcion,
        t.monto::numeric(12,2) AS monto,
        t.tipo,
        t.cuotas,
        c.name as categoria,
        i.provider as banco,
        i.network as tarjeta,
        i.period_year,
        i.period_month
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN imports i ON t.import_id = i.id
      WHERE i.period_year = $1::int AND i.period_month = $2::int
      ORDER BY t.fecha, t.descripcion, t.monto
    `;

    const { rows } = await db.query(query, [parseInt(year, 10), parseInt(month, 10)]);

    const outputDir = path.join(__dirname, '../../exports');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const outPath = output ? path.resolve(output) : path.join(outputDir, `export_${year}_${String(month).padStart(2, '0')}.json`);

    fs.writeFileSync(outPath, JSON.stringify(rows, null, 2), 'utf8');

    console.log(`Exportadas ${rows.length} transacciones a: ${outPath}`);
    console.log('Vista previa (primeras 3 filas):');
    console.log(JSON.stringify(rows.slice(0, 3), null, 2));

    // End DB pool
    if (db.end) await db.end();
  } catch (err) {
    console.error('Error exportando transacciones:', err);
    process.exit(1);
  }
}

main();
