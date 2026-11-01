/** Append-only synchronization against an isolated disposable PostgreSQL cluster. No .env or real API. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const { Client, Pool } = require('pg');

const PORT = 55441;
const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const directory = fs.mkdtempSync('/private/tmp/finanzas-fintoc-pg-');
const data = path.join(directory, 'data');
const socket = path.join(directory, 'socket');
fs.mkdirSync(socket);
const command = (binary, args) => {
  const result = spawnSync(binary, args, { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } });
  if (result.status !== 0) throw new Error(`${binary} failed: ${result.stderr || result.error}`);
};
const migration = path.join(__dirname, '../../backend/migrations/031_create_fintoc_daily_sync.sql');
const createService = () => require('../../backend/services/fintocDailySyncService').createFintocDailySyncService;

async function main() {
  let started = false, client, pool;
  try {
    command('/opt/homebrew/bin/initdb', ['-D', data, '-A', 'trust', '--no-locale', '-U', 'fintoc_test']);
    command('/opt/homebrew/bin/pg_ctl', ['-D', data, '-l', path.join(directory, 'postgres.log'), '-o', `-p ${PORT} -h 127.0.0.1 -k ${socket}`, '-w', 'start']);
    started = true;
    client = new Client({ host: socket, port: PORT, user: 'fintoc_test', database: 'postgres' });
    await client.connect();
    await client.query('CREATE DATABASE finanzas_fintoc_test');
    await client.end();
    client = null;
    pool = new Pool({ host: socket, port: PORT, user: 'fintoc_test', database: 'finanzas_fintoc_test', max: 6 });
    const identity = await pool.query('SELECT current_database() AS name');
    assert.equal(identity.rows[0].name, 'finanzas_fintoc_test');
    assert.ok(socket.startsWith('/private/tmp/finanzas-fintoc-pg-'));
    await pool.query(`
      CREATE TABLE users (id uuid PRIMARY KEY, email text UNIQUE);
      CREATE TABLE categories (id integer PRIMARY KEY, user_id uuid, name text, tipo text);
      CREATE TABLE checking_transactions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
        year integer NOT NULL, month integer NOT NULL, fecha date NOT NULL,
        descripcion varchar(60) NOT NULL, tipo varchar(10) NOT NULL,
        amount numeric(14,2) NOT NULL, category_id integer REFERENCES categories(id), notas varchar(140),
        created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
      );
      CREATE TABLE checking_balances (
        user_id uuid REFERENCES users(id), year integer, month integer, initial_balance numeric(14,2),
        known_balance numeric(14,2), balance_date date, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
        PRIMARY KEY(user_id,year,month)
      );
    `);
    await pool.query('INSERT INTO users VALUES($1,$2),($3,$4)', [OWNER, 'owner@example.invalid', OTHER, 'other@example.invalid']);
    await pool.query('INSERT INTO categories VALUES(1,$1,$2,$3),(2,$1,$4,$3)', [OWNER, 'Categoría original', 'gasto', 'Otra categoría']);
    const originalIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    for (const [id, owner, date, description, amount, category] of [
      [originalIds[0], OWNER, '2026-10-15', 'Factura reconocida', '10000.00', 1],
      [originalIds[1], OWNER, '2026-10-30', 'Cartola con descripción distinta', '30000.00', 2],
      [originalIds[2], OTHER, '2026-10-15', 'Factura reconocida', '10000.00', 1],
    ]) await pool.query('INSERT INTO checking_transactions(id,user_id,year,month,fecha,descripcion,tipo,amount,category_id,notas,created_at,updated_at) VALUES($1,$2,2026,10,$3,$4,$5,$6,$7,$8,$9,$10)',
      [id, owner, date, description, 'cargo', amount, category, 'Nota original inmutable', '2025-01-01T00:00:00Z', '2026-01-01T00:00:00Z']);
    await pool.query('INSERT INTO checking_balances(user_id,year,month,initial_balance,known_balance,balance_date) VALUES($1,2026,10,0,200000,$2)', [OWNER, '2026-10-30']);
    const originalSnapshot = async () => JSON.stringify({
      rows: (await pool.query('SELECT * FROM checking_transactions WHERE id=ANY($1::uuid[]) ORDER BY id', [originalIds])).rows,
      categories: (await pool.query('SELECT * FROM categories ORDER BY id')).rows,
      balances: (await pool.query('SELECT * FROM checking_balances ORDER BY user_id,year,month')).rows,
    });
    const before = await originalSnapshot();
    // The real migration must neither rewrite original rows nor require a backfill.
    await pool.query(fs.readFileSync(migration, 'utf8'));
    await pool.query(fs.readFileSync(migration, 'utf8'));
    assert.equal(await originalSnapshot(), before);

    let now = new Date('2026-10-31T21:00:00.000Z');
    let bankUpdatedAt = '2026-10-31T20:00:00.000Z';
    let failProvider = false;
    const row = (id, date, amount, description, overrides = {}) => ({
      externalId: id, date, description, type: 'cargo', amount: String(amount), status: 'confirmed', pending: false, ...overrides,
    });
    let movements = [
      row('mov_legacy', '2026-10-15', 10000, 'Factura reconocida'),
      row('mov_ambiguous', '2026-10-30', 30000, 'Descripción bancaria distinta'),
      row('mov_history', '2026-10-29', 4000, 'Movimiento inicial sin coincidencia'),
      row('mov_initial_a', '2026-10-28', 7000, 'Inicial idéntico'),
      row('mov_initial_b', '2026-10-28', 7000, 'Inicial idéntico'),
    ];
    const env = {
      FINTOC_ENABLED: 'true', FINTOC_PERSONAL_FREE_ACCESS_CONFIRMED: 'true', FINTOC_DAILY_SYNC_ENABLED: 'true',
      FINTOC_MODE: 'live', FINTOC_OWNER_USER_ID: OWNER, FINTOC_ACCOUNT_ID: 'acc_fixture',
      FINTOC_SECRET_KEY: 'sk_live_fictitious', FINTOC_LINK_TOKEN: 'link_fixture_token_fictitious',
    };
    const provider = {
      assertOwner: actor => { if (actor !== OWNER) { const error = new Error('Forbidden fixture'); error.status = 403; error.code = 'FINTOC_FORBIDDEN'; throw error; } },
      getStatus: () => ({ provider: 'fintoc', state: 'ready', mode: 'live', readOnly: true, writesEnabled: false }),
      readSnapshot: async (actor, query) => {
        assert.equal(actor, OWNER);
        if (failProvider) { const error = new Error('Fictitious unavailable provider'); error.code = 'FINTOC_INCOMPLETE'; error.status = 502; throw error; }
        const year = Number(query.year), month = Number(query.month);
        const since = `${year}-${String(month).padStart(2, '0')}-01`;
        const until = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
        const items = movements.filter(item => item.date >= since && item.date <= until).map(item => ({ ...item }));
        return { provider: 'fintoc', mode: 'live', readOnly: true, imported: false,
          period: { year, month, since, until }, account: { name: 'Cuenta ficticia', currency: 'CLP', numberLast4: '1234' },
          queriedAt: now.toISOString(), bankUpdatedAt, items, total: items.length, coverage: { complete: true, excludedNonConfirmed: 0 } };
      },
    };
    const db = { pool, query: pool.query.bind(pool) };
    const service = createService()({ db, provider, env, now: () => new Date(now) });
    let result = await service.run({ trigger: 'initial' });
    assert.equal(result.status, 'success');
    assert.equal(result.inserted, 0, 'A baseline must not import financial history');
    assert.equal(await originalSnapshot(), before);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM checking_transactions')).rows[0].n, 3);
    let status = await service.getDailyStatus(OWNER);
    assert.equal(status.initialized, true);
    assert.equal(String(status.cutoverDate).slice(0, 10), '2026-10-31');
    assert.equal(status.pendingReviewCount, 4);
    assert.equal((await service.getReview(OWNER, { limit: '2', offset: '0' })).items.length, 2);
    await service.run({ trigger: 'manual' });
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM checking_transactions')).rows[0].n, 3);
    console.log('PASS additive/idempotent migration, baseline reconciliation, protected categories/notes/balances and repeat');

    now = new Date('2026-11-01T15:00:00.000Z');
    bankUpdatedAt = '2026-11-01T14:00:00.000Z';
    movements.push(row('mov_future_a', '2026-11-01', 12345, 'Dos cargos legítimos'), row('mov_future_b', '2026-11-01', 12345, 'Dos cargos legítimos'));
    movements.push(row('mov_pending', '2026-11-01', 2500, 'Pendiente ficticio', { status: 'processing', pending: true }));
    result = await service.run({ trigger: 'scheduled' });
    assert.equal(result.status, 'success');
    assert.equal(result.inserted, 2, 'Two distinct bank IDs with identical values are two real movements');
    let added = (await pool.query('SELECT * FROM checking_transactions WHERE user_id=$1 AND fecha=$2', [OWNER, '2026-11-01'])).rows;
    assert.equal(added.length, 2);
    assert.ok(added.every(item => item.category_id === null && item.notas === null && item.year === 2026 && item.month === 11));
    assert.equal((await service.run({ trigger: 'scheduled' })).inserted, 0);
    assert.equal(await originalSnapshot(), before);
    console.log('PASS new-only insertion, external-ID idempotence, same-value multiplicity and pending exclusion');

    movements.find(item => item.externalId === 'mov_future_a').amount = '12400';
    movements = movements.filter(item => item.externalId !== 'mov_future_b');
    movements.push(row('mov_reissued', '2026-11-01', 12345, 'Dos cargos legítimos'));
    movements.push(row('mov_late', '2026-10-30', 9000, 'Llegada tardía ficticia'));
    result = await service.run({ trigger: 'scheduled' });
    assert.equal(result.inserted, 0, 'Correction, missing/reissued identity and late history must not create financial duplicates');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM checking_transactions WHERE user_id=$1 AND fecha=$2', [OWNER, '2026-11-01'])).rows[0].n, 2);
    const currentAdded = (await pool.query('SELECT amount::text FROM checking_transactions WHERE user_id=$1 AND fecha=$2 ORDER BY id', [OWNER, '2026-11-01'])).rows;
    assert.ok(currentAdded.every(item => item.amount === '12345.00'));
    assert.equal(await originalSnapshot(), before);
    console.log('PASS provider corrections, missing/reissued IDs and late history are isolated from recorded expenses');

    const pending = movements.find(item => item.externalId === 'mov_pending');
    pending.status = 'confirmed';
    pending.pending = false;
    result = await service.run({ trigger: 'scheduled' });
    assert.equal(result.inserted, 1, 'A previously pending new ID must import once when it settles after the cutover');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM checking_transactions WHERE user_id=$1 AND fecha=$2 AND amount=$3', [OWNER, '2026-11-01', '2500'])).rows[0].n, 1);
    assert.equal((await service.run({ trigger: 'scheduled' })).inserted, 0);
    assert.equal(await originalSnapshot(), before);
    console.log('PASS pending-to-confirmed transition inserts only the newly settled movement exactly once');

    now = new Date('2026-11-02T15:00:00.000Z');
    bankUpdatedAt = '2026-11-02T14:00:00.000Z';
    movements.push(row('mov_huge', '2026-11-02', '1000000000000', 'Fuera del rango financiero'));
    movements.push(row('mov_normal', '2026-11-02', 777, 'Novedad inequívoca'));
    result = await service.run({ trigger: 'scheduled' });
    assert.equal(result.status, 'success');
    assert.equal(result.inserted, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM checking_transactions WHERE user_id=$1 AND fecha=$2', [OWNER, '2026-11-02'])).rows[0].n, 1);
    assert.ok((await service.getReview(OWNER, { limit: '100', offset: '0' })).items.some(item => item.reason === 'amount_out_of_range'));
    const successAt = (await service.getDailyStatus(OWNER)).lastSuccessAt;
    failProvider = true;
    result = await service.run({ trigger: 'scheduled' });
    assert.equal(result.status, 'error');
    assert.equal((await service.getDailyStatus(OWNER)).lastSuccessAt, successAt);
    failProvider = false;
    assert.equal(await originalSnapshot(), before);
    console.log('PASS NUMERIC bounds and incomplete-provider failure without partial financial changes or false success');

    now = new Date('2026-11-03T15:00:00.000Z');
    movements.push(row('mov_fail', '2026-11-03', 666, 'Rollback atómico ficticio'));
    await pool.query(`CREATE FUNCTION fail_fintoc_mapping() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.external_id='mov_fail' THEN RAISE EXCEPTION 'fixture rollback'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_fintoc_mapping BEFORE INSERT ON fintoc_external_movements FOR EACH ROW EXECUTE FUNCTION fail_fintoc_mapping();`);
    result = await service.run({ trigger: 'scheduled' });
    assert.equal(result.status, 'error');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM checking_transactions WHERE user_id=$1 AND fecha=$2', [OWNER, '2026-11-03'])).rows[0].n, 0);
    await pool.query('DROP TRIGGER fail_fintoc_mapping ON fintoc_external_movements; DROP FUNCTION fail_fintoc_mapping();');
    movements = movements.filter(item => item.externalId !== 'mov_fail');
    assert.equal(await originalSnapshot(), before);
    console.log('PASS transactional rollback between financial insertion and external identity mapping');

    const Checking = require('../../backend/models/Checking');
    const checking = new Checking(db);
    now = new Date('2026-11-04T15:00:00.000Z');
    const race = row('mov_race', '2026-11-04', 8888, 'Carrera con cartola ficticia');
    movements.push(race);
    await Promise.all([
      service.run({ trigger: 'scheduled' }),
      checking.bulkImport(OWNER, [{ fecha: race.date, descripcion: race.description, amount: race.amount, tipo: race.type }]),
    ]);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM checking_transactions WHERE user_id=$1 AND fecha=$2 AND amount=$3', [OWNER, race.date, race.amount])).rows[0].n, 1);
    const secondService = createService()({ db, provider, env, now: () => new Date(now) });
    movements.push(row('mov_concurrent', '2026-11-04', 4321, 'Dos ejecuciones simultáneas'));
    await Promise.all([service.run({ trigger: 'manual' }), secondService.run({ trigger: 'scheduled' })]);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM checking_transactions WHERE user_id=$1 AND fecha=$2 AND amount=$3', [OWNER, '2026-11-04', '4321'])).rows[0].n, 1);
    assert.equal(await originalSnapshot(), before);
    console.log('PASS CSV/shared lock, concurrent runs and byte-for-byte preservation of every original financial field');

    await pool.query('DELETE FROM checking_transactions WHERE id IN (SELECT checking_transaction_id FROM fintoc_external_movements WHERE user_id=$1 AND account_id=$2 AND external_id=$3)', [OWNER, 'acc_fixture', 'mov_concurrent']);
    movements = movements.filter(item => item.externalId !== 'mov_concurrent');
    movements.push(row('mov_deleted_reissue', '2026-11-04', 4321, 'Dos ejecuciones simultáneas'));
    result = await service.run({ trigger: 'scheduled' });
    assert.equal(result.inserted, 0, 'A reissued ID must not recreate a bank expense intentionally deleted by its owner');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM checking_transactions WHERE user_id=$1 AND fecha=$2 AND amount=$3', [OWNER, '2026-11-04', '4321'])).rows[0].n, 0);
    assert.equal(await originalSnapshot(), before);
    console.log('PASS deleted financial references remain protected when the bank reissues an identical movement under another ID');

    const makeSnapshot = (query, rows, capturedAt, refreshedAt) => {
      const year = Number(query.year), month = Number(query.month);
      const since = `${year}-${String(month).padStart(2, '0')}-01`;
      const until = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
      const items = rows.filter(item => item.date >= since && item.date <= until).map(item => ({ ...item }));
      return { provider: 'fintoc', mode: 'live', readOnly: true, imported: false,
        period: { year, month, since, until }, account: { name: 'Cuenta ficticia', currency: 'CLP', numberLast4: '1234' },
        queriedAt: capturedAt, bankUpdatedAt: refreshedAt, items, total: items.length,
        coverage: { complete: true, excludedNonConfirmed: 0 } };
    };
    const delayedRun = (capturedAt, rows, reject = false) => {
      let release, entered;
      const gate = new Promise(resolve => { release = resolve; });
      const started = new Promise(resolve => { entered = resolve; });
      let first = true;
      const delayedProvider = { ...provider, readSnapshot: async (actor, query) => {
        assert.equal(actor, OWNER);
        if (first) { first = false; entered(); await gate; }
        if (reject) { const failure = new Error('Delayed fictitious timeout'); failure.code = 'FINTOC_TIMEOUT'; throw failure; }
        return makeSnapshot(query, rows, capturedAt, capturedAt);
      } };
      const delayed = createService()({ db, provider: delayedProvider, env, now: () => new Date(capturedAt) });
      return { promise: delayed.run({ trigger: 'scheduled' }), started, release: () => release() };
    };
    const olderRows = movements.map(item => ({ ...item }));
    olderRows.push(row('mov_old_snapshot_only', '2026-11-05', 3456, 'Lote antiguo que llega tarde'));
    const delayed = delayedRun('2026-11-05T15:00:00.000Z', olderRows);
    await delayed.started;
    now = new Date('2026-11-05T16:00:00.000Z');
    bankUpdatedAt = '2026-11-05T15:30:00.000Z';
    movements.push(row('mov_latest_snapshot', '2026-11-05', 5432, 'Última lectura completa'));
    assert.equal((await service.run({ trigger: 'scheduled' })).status, 'success');
    const latestStatus = await service.getDailyStatus(OWNER);
    delayed.release();
    const superseded = await delayed.promise;
    assert.ok(superseded.status === 'superseded' || superseded.superseded === true);
    assert.equal((await service.getDailyStatus(OWNER)).lastSuccessAt, latestStatus.lastSuccessAt);
    assert.equal((await service.getDailyStatus(OWNER)).bankUpdatedAt, latestStatus.bankUpdatedAt);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM checking_transactions WHERE user_id=$1 AND fecha=$2 AND amount=$3', [OWNER, '2026-11-05', '3456'])).rows[0].n, 0);
    assert.equal((await pool.query('SELECT reason FROM fintoc_external_movements WHERE user_id=$1 AND account_id=$2 AND external_id=$3', [OWNER, 'acc_fixture', 'mov_latest_snapshot'])).rows[0].reason, null);
    assert.equal(await originalSnapshot(), before);
    console.log('PASS older snapshots arriving after a newer commit cannot regress freshness, create rows or mark new IDs missing');

    const delayedError = delayedRun('2026-11-06T15:00:00.000Z', movements.map(item => ({ ...item })), true);
    await delayedError.started;
    now = new Date('2026-11-06T16:00:00.000Z');
    bankUpdatedAt = '2026-11-06T15:30:00.000Z';
    assert.equal((await service.run({ trigger: 'scheduled' })).status, 'success');
    delayedError.release();
    assert.equal((await delayedError.promise).status, 'error');
    const afterDelayedError = await service.getDailyStatus(OWNER);
    assert.equal(afterDelayedError.lastErrorCode, null);
    assert.equal(afterDelayedError.lastRun.status, 'success');
    assert.equal(await originalSnapshot(), before);
    console.log('PASS a delayed failed request cannot overwrite the successful state of a newer run');
    assert.ok(!require.cache[require.resolve('../../backend/config/database')], 'Integration must never load the configured database/.env module');
    console.log('Integration complete: disposable PostgreSQL and fictitious provider only; no real API, credentials or existing database.');
  } finally {
    if (client) await client.end().catch(() => {});
    if (pool) await pool.end().catch(() => {});
    if (started) command('/opt/homebrew/bin/pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
