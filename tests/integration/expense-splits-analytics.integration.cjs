/** ESP-09: real, read-only category SQL against fictitious rows in an isolated Unix-socket cluster. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const { Client } = require('pg');

const OWNER = '11111111-1111-4111-8111-111111111111';
const STRANGER = '22222222-2222-4222-8222-222222222222';
const directory = fs.mkdtempSync('/private/tmp/finanzas-split-analytics-');
const data = path.join(directory, 'data'), socket = path.join(directory, 'socket');
const port = 56000 + process.pid % 1000;
fs.mkdirSync(socket);
function command(binary, args) {
  const result = spawnSync(binary, args, { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } });
  if (result.status !== 0) throw new Error(`${binary}: ${result.stderr || result.stdout || result.error}`);
}

async function main() {
  let started = false, client;
  const reads = [];
  try {
    command('/opt/homebrew/bin/initdb', ['-D', data, '-A', 'trust', '--no-locale', '-U', 'split_analytics_test']);
    command('/opt/homebrew/bin/pg_ctl', ['-D', data, '-l', path.join(directory, 'postgres.log'), '-o', `-p ${port} -h '' -k ${socket}`, '-w', 'start']);
    started = true;
    client = new Client({ host: socket, port, user: 'split_analytics_test', database: 'postgres' });
    await client.connect();
    await client.query('CREATE DATABASE expense_split_analytics_test');
    await client.end();
    client = new Client({ host: socket, port, user: 'split_analytics_test', database: 'expense_split_analytics_test' });
    await client.connect();
    assert.equal((await client.query('SELECT current_database() AS name')).rows[0].name, 'expense_split_analytics_test');
    // Narrow read-side schema: mutation/migration/guard coverage lives in expense-splits.integration.cjs.
    await client.query(`
      CREATE TABLE categories(id int PRIMARY KEY, name text, user_id uuid);
      CREATE TABLE imports(id uuid PRIMARY KEY, provider text, network text, period_year int, period_month int);
      CREATE TABLE transactions(id uuid PRIMARY KEY,user_id uuid,fecha date,descripcion text,category_id int,monto numeric(14,2),tipo text,billing_year int,billing_month int,import_id uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE TABLE intl_unbilled(id uuid PRIMARY KEY,user_id uuid,fecha date,descripcion text,category_id int,amount_clp numeric(14,2),tipo text,period_year int,period_month int,brand text,updated_at timestamptz DEFAULT now());
      CREATE TABLE checking_transactions(id uuid PRIMARY KEY,user_id uuid,fecha date,descripcion text,category_id int,amount numeric(14,2),tipo text,year int,month int);
      CREATE TABLE checking_balances(user_id uuid,year int,month int,known_balance numeric,initial_balance numeric);
      CREATE TABLE fintoc_bank_balances(user_id uuid,account_id text,currency text,available numeric(20,0),current numeric(20,0),bank_updated_at timestamptz,queried_at timestamptz);
      CREATE TABLE projected_templates(id uuid,user_id uuid,nombre text,tipo text,monto numeric,category_id int,notas text,day_of_month int,start_year int,start_month int,repeat_monthly boolean,updated_at timestamptz);
      CREATE TABLE projected_occurrences(id uuid,user_id uuid,template_id uuid,year int,month int,fecha date,nombre text,tipo text,monto numeric,category_id int,notas text,active boolean,updated_at timestamptz);
      CREATE TABLE installment_plans(id uuid,user_id uuid,brand text,updated_at timestamptz DEFAULT now());
      CREATE TABLE installment_occurrences(plan_id uuid,year int,month int,amount numeric,active boolean,updated_at timestamptz DEFAULT now());
      CREATE TABLE expense_splits(id uuid PRIMARY KEY,user_id uuid,source text,transaction_id uuid,intl_unbilled_id uuid,checking_transaction_id uuid,amount_clp numeric(14,2),version uuid);
      CREATE TABLE expense_split_parts(split_id uuid,position smallint,amount_clp numeric(14,2),category_id int,PRIMARY KEY(split_id,position));
    `);
    await client.query('INSERT INTO categories VALUES(1,$1,NULL),(2,$2,$4),(3,$3,NULL),(90,$5,$6)', ['Original', 'Calzado', 'Deporte', OWNER, 'Categoría ajena', STRANGER]);
    process.env.FINTOC_OWNER_USER_ID = OWNER;
    process.env.FINTOC_ACCOUNT_ID = 'fixture-checking-account';
    await client.query("INSERT INTO fintoc_bank_balances VALUES($1,'fixture-checking-account','CLP',555777,555000,NOW(),NOW())", [OWNER]);
    await client.query('INSERT INTO checking_balances VALUES($1,2026,7,999999,123)', [OWNER]);
    const imported = crypto.randomUUID();
    await client.query('INSERT INTO imports VALUES($1,$2,$3,2026,10)', [imported, 'fixture', 'visa']);
    const national = crypto.randomUUID(), unsplit = crypto.randomUUID(), intl = crypto.randomUUID(), checking = crypto.randomUUID();
    await client.query("INSERT INTO transactions VALUES($1,$2,'2026-10-01','Compra dividida',1,180000,'gasto',2026,10,$3,now()),($4,$2,'2026-10-02','Compra original',1,10000,'gasto',2026,10,$3,now())", [national, OWNER, imported, unsplit]);
    await client.query("INSERT INTO intl_unbilled VALUES($1,$2,'2026-10-03','Compra internacional',1,90000,'gasto',2026,10,'mastercard')", [intl, OWNER]);
    await client.query("INSERT INTO checking_transactions VALUES($1,$2,'2026-10-04','Cargo directo',1,60000,'cargo',2026,10),($3,$2,'2026-10-05','PAGO TARJETA DE CREDITO',1,500000,'cargo',2026,10)", [checking, OWNER, crypto.randomUUID()]);
    const split = async (source, id, total, parts) => {
      const fields = { tc_nacional: 'transaction_id', tc_internacional: 'intl_unbilled_id', cuenta_corriente: 'checking_transaction_id' };
      const key = crypto.randomUUID();
      await client.query(`INSERT INTO expense_splits(id,user_id,source,${fields[source]},amount_clp,version) VALUES($1,$2,$3,$4,$5,$6)`, [key, OWNER, source, id, total, crypto.randomUUID()]);
      for (const [position, [amount, category]] of parts.entries()) await client.query('INSERT INTO expense_split_parts VALUES($1,$2,$3,$4)', [key, position, amount, category]);
    };
    await split('tc_nacional', national, '180000', [['60000', 2], ['20000', 2], ['100000', null]]);
    await split('tc_internacional', intl, '90000', [['60000', 2], ['30000', 3]]);
    await split('cuenta_corriente', checking, '60000', [['25000', 2], ['35000', null]]);
    const snapshot = async () => {
      const tables = {};
      for (const table of ['categories', 'transactions', 'intl_unbilled', 'checking_transactions', 'checking_balances', 'fintoc_bank_balances', 'expense_splits', 'expense_split_parts']) tables[table] = (await client.query(`SELECT row_to_json(t)::text AS data FROM ${table} t ORDER BY row_to_json(t)::text`)).rows;
      return crypto.createHash('sha256').update(JSON.stringify(tables)).digest('hex');
    };
    const before = await snapshot();
    await client.query('SET default_transaction_read_only = on');
    const dbPath = require.resolve('../../backend/config/database');
    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: (sql, params) => { assert.match(sql.trim(), /^(SELECT|WITH)\b/i); reads.push(sql); return client.query(sql, params); } } };
    const evolution = require('../../backend/services/expenseEvolutionService');
    const allSources = 'tc_nacional,tc_internacional,cuenta_corriente';
    const query = { endYear: '2026', endMonth: '10', months: '3', sources: allSources };
    const matrix = await evolution.getEvolution(OWNER, query);
    assert.equal(matrix.summary.total, 340000);
    assert.equal(matrix.summary.count, 4, 'Count original purchases once despite several category memberships');
    assert.equal(matrix.categories.find(c => c.id === '1').total, 10000, 'Split original category does not count alongside its parts');
    assert.equal(matrix.categories.find(c => c.id === '2').total, 165000, 'All sources allocate by parts and repeated categories combine');
    assert.equal(matrix.categories.find(c => c.id === '3').total, 30000);
    assert.equal(matrix.categories.find(c => c.id === 'uncategorized').total, 135000, 'Only uncategorized parts are pending');
    assert.equal(matrix.categories.find(c => c.id === '2').values.at(-1).count, 3);
    assert.equal(matrix.months.at(-1).bySource.tc_nacional.count, 2);
    assert.equal(matrix.months.at(-1).bySource.tc_internacional.count, 1);
    assert.equal(matrix.months.at(-1).bySource.cuenta_corriente.count, 1);
    const detail = await evolution.getTransactions(OWNER, { year: '2026', month: '10', categoryId: '2', sources: allSources });
    assert.equal(detail.total, 165000);
    assert.equal(detail.count, 3);
    assert.equal(detail.transactions.find(t => t.id === national).amount, 80000);
    assert.equal(detail.transactions.find(t => t.id === national).originalAmount, 180000);
    assert.equal(detail.transactions.find(t => t.id === national).isSplit, true);
    assert.equal(new Set(detail.transactions.map(t => `${t.source}:${t.id}`)).size, 3);
    const stranger = await evolution.getEvolution(STRANGER, query);
    assert.equal(stranger.summary.total, 0);
    assert.equal(stranger.summary.count, 0);
    const controller = require('../../backend/controllers/dashboardController');
    const call = async (method, query) => {
      const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; } };
      await controller[method]({ user: { id: OWNER }, query }, response);
      assert.equal(response.statusCode, 200, method + ' must succeed');
      return response.data;
    };
    const monthly = await call('getCategoryBreakdown', { periodYear: '2026', periodMonth: '10', mode: 'monthly' });
    assert.equal(monthly.find(c => c.categoria === 'Calzado').total, 165000);
    assert.equal(monthly.find(c => c.categoria === 'Calzado').count, 3);
    const projected = await call('getCategoryBreakdown', { periodYear: '2026', periodMonth: '10', mode: 'projected' });
    assert.equal(projected.find(c => c.categoria === 'Calzado').total, 140000);
    assert.equal(projected.find(c => c.categoria === 'Calzado').count, 2);
    const categoryDetail = await call('getCategoryTransactions', { periodYear: '2026', periodMonth: '10', category: 'Calzado' });
    assert.equal(categoryDetail.total, 165000);
    assert.equal(categoryDetail.count, 3);
    assert.equal(categoryDetail.transactions.find(t => t.id === national).originalAmount, 180000);
    const OriginalDate = global.Date;
    let legacyEvolution;
    try {
      global.Date = class FixedDate extends OriginalDate {
        constructor(...args) { super(...(args.length ? args : ['2026-11-02T12:00:00.000Z'])); }
        static now() { return new OriginalDate('2026-11-02T12:00:00.000Z').getTime(); }
      };
      legacyEvolution = await call('getCategoryEvolution', { months: '3' });
    } finally { global.Date = OriginalDate; }
    assert.equal(legacyEvolution.data.find(m => m.year === 2026 && m.month === 10).Calzado, 165000);
    const overview = await call('getOverview', { year: '2026', month: '10' });
    assert.equal(overview.disponibleHoy, 555777, 'Only the saved bank balance is current; legacy cartola is ignored');
    assert.equal(overview.checking.amount, '555777');
    assert.equal(overview.checking.source, 'fintoc');
    assert.equal(overview.gastos.value, 340000, 'Overall expenditure still uses original financial rows');
    assert.equal(overview.topCategorias.find(c => c.name === 'Calzado').total, 140000);
    const dashboard = await call('getDashboardData', {});
    assert.equal(Number(dashboard.categories.find(c => c.name === 'Calzado').total), 80000);
    const Transaction = require('../../backend/models/Transaction');
    const model = new Transaction(require('../../backend/config/database'));
    const summary = await model.getTransactionsSummary(OWNER, '2026-10-01', '2026-10-31');
    assert.equal(Number(summary.find(c => c.category_name === 'Calzado').total_monto), 80000);
    assert.equal(Number(summary.find(c => c.category_name === 'Calzado').numero_transacciones), 1);
    const breakdown = await model.getCategoryBreakdown(OWNER, 2026, 10);
    assert.equal(Number(breakdown.find(c => c.category_name === 'Calzado').total_monto), 80000);
    assert.equal(await snapshot(), before, 'All financial rows, original categories and saved parts remain unchanged by analytics');
    console.log(JSON.stringify({ pass: true, reads: reads.length, sources: 3, originalPurchases: 4, total: '340000.00', categoryTotal: '165000.00', sameCategoryPartsMerged: true, financialRowsUnchanged: true, noProduction: true }));
  } finally {
    if (client) await client.end().catch(() => {});
    if (started) command('/opt/homebrew/bin/pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
