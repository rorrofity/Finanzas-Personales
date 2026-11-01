/** Real SQL/API integration, exclusively in a temporary PostgreSQL cluster. No .env is loaded. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const { Client } = require('pg');

const PORT = 55439;
const OWNER = '11111111-1111-4111-8111-111111111111';
const MEMBER = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';
const allSources = 'tc_nacional,tc_internacional,cuenta_corriente';
const directory = fs.mkdtempSync('/private/tmp/finanzas-dashboard-pg-');
const data = path.join(directory, 'data');
const socket = path.join(directory, 'socket');
fs.mkdirSync(socket);
const commands = (binary, args) => {
  const result = spawnSync(binary, args, { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } });
  if (result.status !== 0) throw new Error(`${binary} failed: ${result.stderr || result.stdout || result.error}`);
};

async function main() {
  let started = false, client, server;
  const operations = [];
  try {
    commands('/opt/homebrew/bin/initdb', ['-D', data, '-A', 'trust', '--no-locale', '-U', 'dashboard_test']);
    commands('/opt/homebrew/bin/pg_ctl', ['-D', data, '-l', path.join(directory, 'postgres.log'), '-o', `-p ${PORT} -h 127.0.0.1 -k ${socket}`, '-w', 'start']);
    started = true;
    client = new Client({ host: socket, port: PORT, user: 'dashboard_test', database: 'postgres' });
    await client.connect();
    await client.query('CREATE DATABASE finanzas_dashboard_test');
    await client.end();
    client = new Client({ host: socket, port: PORT, user: 'dashboard_test', database: 'finanzas_dashboard_test' });
    await client.connect();
    const identity = await client.query('SELECT current_database() AS name, inet_server_port() AS port');
    assert.equal(identity.rows[0].name, 'finanzas_dashboard_test');
    assert.ok(socket.startsWith('/private/tmp/finanzas-dashboard-pg-'));
    await client.query(`
      CREATE TABLE categories (id integer PRIMARY KEY, name text NOT NULL, user_id uuid);
      CREATE TABLE transactions (id uuid PRIMARY KEY, user_id uuid NOT NULL, fecha date NOT NULL, descripcion text, category_id integer, monto numeric(14,2), tipo text, billing_year integer, billing_month integer);
      CREATE TABLE intl_unbilled (id uuid PRIMARY KEY, user_id uuid NOT NULL, fecha date NOT NULL, descripcion text, category_id integer, amount_clp numeric(14,2), tipo text, period_year integer, period_month integer);
      CREATE TABLE checking_transactions (id uuid PRIMARY KEY, user_id uuid NOT NULL, fecha date NOT NULL, descripcion text, category_id integer, amount numeric(14,2), tipo text, year integer, month integer);
      CREATE TABLE space_members (owner_user_id uuid, member_user_id uuid, status text, is_active boolean, can_edit boolean, can_delete boolean);
    `);
    for (let id = 1; id <= 17; id++) await client.query('INSERT INTO categories VALUES ($1,$2,$3)', [id, id === 1 ? 'Cuentas' : id === 3 ? 'year' : `Categoría ${id}`, id === 2 ? OWNER : null]);
    await client.query('INSERT INTO categories VALUES (90,$1,$2)', ['Nombre privado de otro espacio', STRANGER]);
    const tx = async (category, amount, tipo = 'gasto', year = 2026, month = 10, user = OWNER) => client.query('INSERT INTO transactions VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [crypto.randomUUID(), user, '2026-09-23', 'Fixture transacción', category, amount, tipo, year, month]);
    await tx(1, '100.10'); await tx(1, '0.20'); await tx(2, '80.00', 'gasto', 2026, 9);
    await tx(null, '25.00'); await tx(3, '10.00'); await tx(1, '1000', 'pago');
    await tx(1, '2000', 'desestimar'); await tx(1, '5000', 'ingreso'); await tx(1, '200', 'gasto', null, null);
    await tx(90, '9999999', 'gasto', 2026, 10, STRANGER);
    const intl = async (amount, year = 2026, month = 10) => client.query('INSERT INTO intl_unbilled VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [crypto.randomUUID(), OWNER, '2026-09-23', 'Fixture internacional', 1, amount, 'gasto', year, month]);
    await intl('50.40'); await intl(null); await intl('90', null, null);
    const checking = async (amount, description, tipo = 'cargo') => client.query('INSERT INTO checking_transactions VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [crypto.randomUUID(), OWNER, '2026-09-22', description, 1, amount, tipo, 2026, 10]);
    await checking('25.50', 'Gasto directo fixture'); await checking('9999', 'PAGO TARJETA DE CREDITO'); await checking('10000', 'Ingreso fixture', 'abono');
    await client.query('INSERT INTO space_members VALUES ($1,$2,$3,true,false,false)', [OWNER, MEMBER, 'linked']);
    const snapshot = async () => {
      const all = {};
      for (const name of ['categories', 'transactions', 'intl_unbilled', 'checking_transactions', 'space_members']) {
        all[name] = (await client.query(`SELECT row_to_json(t) AS row FROM ${name} t ORDER BY row_to_json(t)::text`)).rows;
      }
      return crypto.createHash('sha256').update(JSON.stringify(all)).digest('hex');
    };
    const before = await snapshot();
    await client.query('SET default_transaction_read_only = on');
    const dbPath = require.resolve('../../backend/config/database');
    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: async (sql, params) => { assert.match(sql.trim(), /^(SELECT|WITH)\b/i, 'Dashboard SQL must be read only'); operations.push(sql); return client.query(sql, params); } } };
    process.env.JWT_SECRET = 'temporary-dashboard-integration-secret';
    const express = require('express');
    const jwt = require('jsonwebtoken');
    const app = express();
    app.use('/api/dashboard', require('../../backend/routes/dashboardRoutes'));
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    const base = `http://127.0.0.1:${server.address().port}/api/dashboard`;
    const request = async (endpoint, user = OWNER, headers = {}) => {
      const response = await fetch(base + endpoint, { headers: { ...(user ? { Authorization: 'Bearer ' + jwt.sign({ id: user }, process.env.JWT_SECRET) } : {}), ...headers } });
      return { status: response.status, data: await response.json() };
    };
    const query = `/expense-evolution?endYear=2026&endMonth=10&months=6&basis=billing&sources=${allSources}`;
    const own = await request(query);
    assert.equal(own.status, 200, 'The authenticated evolution endpoint must exist');
    assert.deepEqual(own.data.months.map(m => m.key), ['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10']);
    assert.equal(own.data.summary.currentTotal, 211.2, 'Eligible TC + intl + checking sum retains cents and excludes payments/income');
    assert.equal(own.data.summary.previousTotal, 80);
    assert.equal(own.data.summary.total, 291.2);
    assert.equal(own.data.categories.length, 18, 'All 17 accessible categories and uncategorized must remain available');
    assert.ok(!own.data.categories.some(c => c.id === '90'));
    assert.equal(own.data.exclusions.missingPeriodCount, 2);
    assert.equal(own.data.exclusions.missingCLPCount, 1);
    assert.equal(own.data.coverage.consolidation, 'unverified');
    assert.equal(own.data.categories.reduce((sum, c) => sum + c.currentTotal, 0), 211.2);
    assert.equal(own.data.categories.find(c => c.id === '3').name, 'year', 'Category names cannot overwrite month fields');
    console.log('PASS SQL billing periods, source filters, precision, categories, exclusions, monthly reconciliation');

    const detail = await request(`/expense-evolution/transactions?year=2026&month=10&categoryId=1&basis=billing&sources=${allSources}&limit=2&offset=0`);
    assert.equal(detail.status, 200);
    assert.equal(detail.data.total, 176.2);
    assert.equal(detail.data.count, 4);
    assert.equal(detail.data.transactions.length, 2);
    assert.equal(detail.data.hasMore, true);
    assert.ok(detail.data.transactions.every(t => ['2026-09-22','2026-09-23'].includes(t.fecha)), 'Details retain real purchase dates rather than day 1');
    const page2 = await request(`/expense-evolution/transactions?year=2026&month=10&categoryId=1&sources=${allSources}&limit=2&offset=2`);
    assert.equal(page2.data.hasMore, false);
    assert.equal([...detail.data.transactions, ...page2.data.transactions].reduce((sum, t) => sum + t.amount, 0), 176.2);
    const missingCategory = await request('/expense-evolution/transactions?year=2026&month=10&categoryId=90');
    assert.ok([403,404].includes(missingCategory.status));
    assert.ok(!JSON.stringify(missingCategory.data).includes('Nombre privado'));
    console.log('PASS SQL category detail, pagination, source identity and real dates');

    assert.equal((await request(query, null)).status, 401);
    assert.equal((await request(query, STRANGER, { 'X-Space-Owner': OWNER })).status, 403);
    const shared = await request(query, MEMBER, { 'X-Space-Owner': OWNER });
    assert.equal(shared.status, 200);
    assert.equal(shared.data.summary.currentTotal, own.data.summary.currentTotal);
    const other = await request(query, STRANGER);
    assert.equal(other.status, 200);
    assert.equal(other.data.summary.currentTotal, 9999999);
    for (const invalid of ['endYear=2026x&endMonth=10', 'endYear=2026&endMonth=13', 'endYear=2026&endMonth=10&months=7', 'endYear=2026&endMonth=10&sources=transactions', 'endYear=2026&endMonth=10&basis=calendar']) {
      assert.equal((await request('/expense-evolution?' + invalid)).status, 400);
    }
    assert.equal(await snapshot(), before, 'All fixture financial data and category classifications must remain byte-for-byte unchanged');
    console.log(`PASS API auth, shared-space ACL, invalid parameters and immutability (${operations.length} SELECT/WITH queries)`);
    console.log('Integration complete: temporary PostgreSQL cluster only; no .env, production or existing database used.');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (client) await client.end().catch(() => {});
    if (started) commands('/opt/homebrew/bin/pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
