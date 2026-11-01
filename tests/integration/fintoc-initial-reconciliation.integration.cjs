/** Explicit initial reconciliation against disposable PostgreSQL. Never loads .env, credentials or a provider. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const { Client, Pool } = require('pg');

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ACCOUNT = 'acc_fictitious_reconciliation';
const BASELINE = '2026-11-01T03:00:00.000Z';
const PORT = 55442;
const directory = fs.mkdtempSync('/private/tmp/finanzas-fintoc-reconcile-pg-');
const data = path.join(directory, 'data');
const socket = path.join(directory, 'socket');
fs.mkdirSync(socket);
function command(binary, args) {
  const result = spawnSync(binary, args, { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } });
  if (result.status !== 0) throw new Error(`${binary} failed: ${result.stderr || result.error}`);
}

async function main() {
  let started = false, client, pool;
  try {
    command('/opt/homebrew/bin/initdb', ['-D', data, '-A', 'trust', '--no-locale', '-U', 'fintoc_reconcile_test']);
    command('/opt/homebrew/bin/pg_ctl', ['-D', data, '-l', path.join(directory, 'postgres.log'), '-o', `-p ${PORT} -h 127.0.0.1 -k ${socket}`, '-w', 'start']);
    started = true;
    client = new Client({ host: socket, port: PORT, user: 'fintoc_reconcile_test', database: 'postgres' });
    await client.connect();
    await client.query('CREATE DATABASE finanzas_fintoc_reconcile_test');
    await client.end(); client = null;
    pool = new Pool({ host: socket, port: PORT, user: 'fintoc_reconcile_test', database: 'finanzas_fintoc_reconcile_test', max: 8 });
    assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name, 'finanzas_fintoc_reconcile_test');
    assert.ok(socket.startsWith('/private/tmp/finanzas-fintoc-reconcile-pg-'));
    await pool.query(`
      CREATE TABLE users(id uuid PRIMARY KEY,email text);
      CREATE TABLE categories(id integer PRIMARY KEY,user_id uuid,name text,created_at timestamptz DEFAULT now());
      CREATE TABLE checking_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),year integer NOT NULL,month integer NOT NULL,fecha date NOT NULL,descripcion varchar(60) NOT NULL,tipo varchar(10) NOT NULL,amount numeric(14,2) NOT NULL,category_id integer REFERENCES categories(id),notas varchar(140),created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE TABLE checking_balances(user_id uuid,year integer,month integer,initial_balance numeric(14,2),known_balance numeric(14,2),balance_date date,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),PRIMARY KEY(user_id,year,month));
      CREATE TABLE transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,fecha date,descripcion text,monto numeric(14,2),category_id integer,notas text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE TABLE intl_unbilled(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,fecha date,descripcion text,amount_clp numeric(14,2),category_id integer,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE TABLE installment_plans(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,description text,category_id integer,created_at timestamptz DEFAULT now());
      CREATE TABLE installment_occurrences(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,amount numeric(14,2),category_id integer,created_at timestamptz DEFAULT now());
      CREATE TABLE projected_templates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,description text,category_id integer,created_at timestamptz DEFAULT now());
      CREATE TABLE projected_occurrences(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,amount numeric(14,2),category_id integer,created_at timestamptz DEFAULT now());
    `);
    await pool.query('INSERT INTO users VALUES($1,$2),($3,$4)', [OWNER, 'owner@example.invalid', OTHER, 'other@example.invalid']);
    await pool.query("INSERT INTO categories VALUES(1,$1,'Categoría original','2025-01-01T00:00:00Z')", [OWNER]);
    await pool.query("INSERT INTO checking_balances VALUES($1,2026,10,0,777777,'2026-10-31','2025-01-01T00:00:00Z','2026-01-01T00:00:00Z')", [OWNER]);
    const originalIds = [];
    async function checkingRow(owner, date, description, amount) {
      const id = crypto.randomUUID(); originalIds.push(id);
      await pool.query('INSERT INTO checking_transactions(id,user_id,year,month,fecha,descripcion,tipo,amount,category_id,notas,created_at,updated_at) VALUES($1,$2,2026,10,$3,$4,$5,$6,1,$7,$8,$9)', [id,owner,date,description,'cargo',amount,'Nota original inmutable','2025-01-01T00:00:00Z','2026-01-01T00:00:00Z']);
      return id;
    }
    const exactId = await checkingRow(OWNER, '2026-10-05', 'Factura existente', '1001');
    await checkingRow(OWNER, '2026-10-08', 'Cartola con texto distinto', '2002');
    await checkingRow(OWNER, '2026-10-10', 'Grupo repetido', '3003');
    const prefix = 'X'.repeat(60);
    await checkingRow(OWNER, '2026-10-12', prefix, '5555');
    await checkingRow(OTHER, '2026-10-16', 'Faltante seguro', '7007');
    await pool.query("INSERT INTO transactions(user_id,fecha,descripcion,monto,category_id,notas) VALUES($1,'2026-10-20','Comercio compartido',9009,1,'Nota TC intacta')", [OWNER]);
    await pool.query("INSERT INTO intl_unbilled(user_id,fecha,descripcion,amount_clp,category_id) VALUES($1,'2026-10-22','Tienda internacional',10010,1)", [OWNER]);
    for (const name of ['installment_plans','projected_templates']) await pool.query(`INSERT INTO ${name}(user_id,description,category_id) VALUES($1,'Ficticio protegido',1)`, [OWNER]);
    for (const name of ['installment_occurrences','projected_occurrences']) await pool.query(`INSERT INTO ${name}(user_id,amount,category_id) VALUES($1,123,1)`, [OWNER]);
    await pool.query(fs.readFileSync(path.join(__dirname,'../../backend/migrations/031_create_fintoc_daily_sync.sql'),'utf8'));
    await pool.query(`INSERT INTO fintoc_sync_state(user_id,account_id,cutover_date,last_success_at,bank_updated_at,coverage_since,coverage_until,created_at,updated_at) VALUES($1,$2,'2026-11-01',$3,'2026-11-01T02:00:00Z','2026-09-01','2026-11-01',$3,$3)`, [OWNER,ACCOUNT,BASELINE]);
    async function movement(id, date, amount, description, overrides = {}) {
      const item = {externalId:id,date,amount:String(amount),description,type:'cargo',status:'confirmed',pending:false,...overrides};
      const hash = crypto.createHash('sha256').update(JSON.stringify([item.date,item.description,item.type,String(BigInt(item.amount)*100n),item.status,item.pending])).digest('hex');
      await pool.query(`INSERT INTO fintoc_external_movements(user_id,account_id,external_id,fecha,descripcion,tipo,amount,status,pending,provider_hash,first_snapshot,disposition,reason,first_seen_at,last_seen_at,updated_at,had_financial_reference,financial_snapshot)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,'needs_review',$12,$13,$13,$13,$14,$15::jsonb)`, [OWNER,ACCOUNT,id,date,description,item.type,item.amount,item.status,item.pending,hash,JSON.stringify(item),overrides.reason || 'initial_unmatched',overrides.first_seen_at || BASELINE,Boolean(overrides.had_financial_reference),overrides.financial_snapshot ? JSON.stringify(overrides.financial_snapshot):null]);
    }
    await movement('mov_exact','2026-10-05',1001,'  FACTURA existente  ');
    await movement('mov_ambiguous','2026-10-09',2002,'Otro texto del banco');
    await movement('mov_group_a','2026-10-10',3003,'Grupo repetido');
    await movement('mov_group_b','2026-10-10',3003,'Grupo repetido');
    await movement('mov_truncated_a','2026-10-12',5555,prefix+' A');
    await movement('mov_truncated_b','2026-10-12',5555,prefix+' B');
    await movement('mov_legit_a','2026-10-15',6006,'Dos movimientos legítimos');
    await movement('mov_legit_b','2026-10-15',6006,'Dos movimientos legítimos');
    await movement('mov_missing','2026-10-16',7007,'Faltante seguro');
    await movement('mov_deleted','2026-10-18',18008,'Metadata corregida tras borrado',{reason:'financial_record_removed',had_financial_reference:true,financial_snapshot:{date:'2026-10-17',description:'Referencia borrada',type:'cargo',amount:'8008'}});
    await movement('mov_reissued','2026-10-17',8008,'Referencia borrada');
    await movement('mov_changed','2026-10-19',9999,'Corrección del proveedor',{reason:'provider_changed'});
    await movement('mov_changed_reissue','2026-10-19',9999,'Nueva identidad de corrección');
    await movement('mov_card','2026-10-21',9009,'COMERCIO COMPARTIDO');
    await movement('mov_abono','2026-10-21',9009,'Comercio compartido',{type:'abono'});
    await movement('mov_intl','2026-10-23',10010,'Tienda internacional');
    await movement('mov_future','2026-11-02',11011,'Fecha futura');
    await movement('mov_huge','2026-10-24','1000000000000','Importe demasiado grande');
    await movement('mov_processing','2026-10-25',12012,'Por confirmar',{status:'processing',pending:true});
    await movement('mov_later_observation','2026-10-26',13013,'No pertenece a carga inicial',{first_seen_at:'2026-11-01T03:30:00.000Z'});
    const untouchedTables = ['categories','transactions','intl_unbilled','checking_balances','installment_plans','installment_occurrences','projected_templates','projected_occurrences'];
    const protectedSnapshot = async () => JSON.stringify({ checking:(await pool.query('SELECT * FROM checking_transactions WHERE id=ANY($1::uuid[]) ORDER BY id',[originalIds])).rows,
      other:await Promise.all(untouchedTables.map(async table => [table,(await pool.query(`SELECT * FROM ${table} ORDER BY 1`)).rows])) });
    const integrationSnapshot = async () => JSON.stringify({state:(await pool.query('SELECT * FROM fintoc_sync_state ORDER BY user_id,account_id')).rows,movements:(await pool.query('SELECT * FROM fintoc_external_movements ORDER BY external_id')).rows,runs:(await pool.query('SELECT * FROM fintoc_sync_runs ORDER BY id')).rows,checking:(await pool.query('SELECT * FROM checking_transactions ORDER BY id')).rows});
    const stateSnapshot = async () => JSON.stringify((await pool.query('SELECT * FROM fintoc_sync_state ORDER BY user_id,account_id')).rows);
    const before = await protectedSnapshot(), stateBefore = await stateSnapshot(), previewBefore = await integrationSnapshot();
    let now = new Date('2026-11-01T03:45:00.000Z');
    const env = {FINTOC_ENABLED:'true',FINTOC_PERSONAL_FREE_ACCESS_CONFIRMED:'true',FINTOC_DAILY_SYNC_ENABLED:'true',FINTOC_MODE:'live',FINTOC_OWNER_USER_ID:OWNER,FINTOC_ACCOUNT_ID:ACCOUNT};
    const { createFintocInitialReconciliationService } = require('../../backend/services/fintocInitialReconciliationService');
    const service = createFintocInitialReconciliationService({db:{pool},env,now:()=>new Date(now)});
    await assert.rejects(()=>service.preview(OTHER), error=>error.code==='FINTOC_RECONCILIATION_FORBIDDEN');
    const plan = await service.preview(OWNER);
    assert.equal(await integrationSnapshot(),previewBefore,'Preview cannot write metadata or financial rows');
    assert.equal((await service.preview(OWNER)).digest,plan.digest,'Preview hash must be deterministic');
    assert.equal(plan.summary.insert,4); assert.equal(plan.summary.link,1);
    const find = id => plan.actions.find(item=>item.externalId===id);
    assert.equal(find('mov_exact').decision,'link'); assert.equal(find('mov_exact').checkingTransactionId,exactId);
    for(const id of ['mov_ambiguous','mov_group_a','mov_group_b','mov_truncated_a','mov_truncated_b','mov_reissued','mov_changed_reissue','mov_card','mov_intl','mov_future','mov_huge','mov_processing']) assert.equal(find(id).decision,'hold',id);
    assert.equal(find('mov_later_observation'),undefined);
    console.log('PASS read-only deterministic preview, ownership, exact links, ambiguity, truncation, tombstones, cards and future guards');
    const result=await service.apply(OWNER,{digest:plan.digest});
    assert.equal(result.status,'success');assert.equal(result.inserted,4);assert.equal(result.linked,1);
    assert.equal(await protectedSnapshot(),before);assert.equal(await stateSnapshot(),stateBefore);
    const added=(await pool.query('SELECT * FROM checking_transactions WHERE NOT(id=ANY($1::uuid[]))',[originalIds])).rows;
    assert.equal(added.length,4); assert.ok(added.every(row=>row.category_id===null&&row.notas===null&&row.year===2026&&row.month===10));
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM checking_transactions WHERE user_id=$1 AND descripcion='Dos movimientos legítimos'",[OWNER])).rows[0].n,2);
    const mapped=(await pool.query("SELECT external_id,disposition,checking_transaction_id,had_financial_reference,created_checking,financial_snapshot FROM fintoc_external_movements WHERE disposition IN ('inserted','linked')")).rows;
    assert.equal(mapped.length,5);assert.ok(mapped.every(row=>row.checking_transaction_id&&row.had_financial_reference&&row.financial_snapshot));
    assert.equal((await pool.query("SELECT reason FROM fintoc_external_movements WHERE external_id='mov_future'")).rows[0].reason,'future_date');
    assert.equal((await pool.query("SELECT disposition FROM fintoc_external_movements WHERE external_id='mov_later_observation'")).rows[0].disposition,'needs_review');
    assert.equal((await service.preview(OWNER)).summary.insert,0);
    await assert.rejects(()=>service.apply(OWNER,{digest:plan.digest}),error=>error.code==='FINTOC_RECONCILIATION_STALE_PLAN');
    console.log('PASS only missing rows inserted, multiplicity preserved, all original financial fields/categories and freshness unchanged, repeat cannot duplicate');

    await movement('mov_rollback','2026-10-27',14014,'Rollback de mapping');
    const rollbackPlan=await service.preview(OWNER), rollbackSnapshot=await integrationSnapshot();
    await pool.query(`CREATE FUNCTION fail_reconcile_mapping() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.external_id='mov_rollback' THEN RAISE EXCEPTION 'fictitious mapping failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_reconcile_mapping BEFORE UPDATE ON fintoc_external_movements FOR EACH ROW EXECUTE FUNCTION fail_reconcile_mapping();`);
    await assert.rejects(()=>service.apply(OWNER,{digest:rollbackPlan.digest}),error=>error.code==='FINTOC_RECONCILIATION_STORAGE_ERROR');
    assert.equal(await integrationSnapshot(),rollbackSnapshot,'Metadata failure after INSERT must roll back the financial row and whole batch');
    await pool.query('DROP TRIGGER fail_reconcile_mapping ON fintoc_external_movements;DROP FUNCTION fail_reconcile_mapping();');
    await pool.query("UPDATE fintoc_external_movements SET reason='provider_changed' WHERE external_id='mov_rollback'");
    console.log('PASS metadata update failure after financial INSERT rolls back everything');

    await movement('mov_integrity','2026-10-28',15015,'Prueba de inmutabilidad');
    const integrityPlan=await service.preview(OWNER), integritySnapshot=await integrationSnapshot();
    await pool.query(`CREATE FUNCTION unexpected_reconcile_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.descripcion='Prueba de inmutabilidad' THEN UPDATE checking_transactions SET notas='Unexpected fixture mutation' WHERE id='${exactId}'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER unexpected_reconcile_mutation AFTER INSERT ON checking_transactions FOR EACH ROW EXECUTE FUNCTION unexpected_reconcile_mutation();`);
    await assert.rejects(()=>service.apply(OWNER,{digest:integrityPlan.digest}),error=>error.code==='FINTOC_RECONCILIATION_INTEGRITY');
    assert.equal(await integrationSnapshot(),integritySnapshot);assert.equal(await protectedSnapshot(),before);
    await pool.query('DROP TRIGGER unexpected_reconcile_mutation ON checking_transactions;DROP FUNCTION unexpected_reconcile_mutation();');
    await pool.query("UPDATE fintoc_external_movements SET reason='provider_changed' WHERE external_id='mov_integrity'");
    console.log('PASS unexpected modification to an original row is detected before commit and rolled back');

    await movement('mov_csv_race','2026-10-29',16016,'Carrera ficticia con cartola');
    const racePlan=await service.preview(OWNER);
    const Checking=require('../../backend/models/Checking');const checking=new Checking({pool,query:pool.query.bind(pool)});
    const race=await Promise.allSettled([service.apply(OWNER,{digest:racePlan.digest}),checking.bulkImport(OWNER,[{fecha:'2026-10-29',descripcion:'Carrera ficticia con cartola',amount:16016,tipo:'cargo'}])]);
    assert.ok(race[0].status==='fulfilled'||race[0].reason.code==='FINTOC_RECONCILIATION_STALE_PLAN');assert.equal(race[1].status,'fulfilled');
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM checking_transactions WHERE user_id=$1 AND fecha='2026-10-29' AND amount=16016",[OWNER])).rows[0].n,1);
    const afterRace=await service.preview(OWNER);if(afterRace.summary.link)await service.apply(OWNER,{digest:afterRace.digest});
    await movement('mov_two_applies','2026-10-30',17017,'Dos applies ficticios');
    const concurrentPlan=await service.preview(OWNER);
    const second=createFintocInitialReconciliationService({db:pool,env,now:()=>new Date(now)});
    const runs=await Promise.allSettled([service.apply(OWNER,{digest:concurrentPlan.digest}),second.apply(OWNER,{digest:concurrentPlan.digest})]);
    assert.equal(runs.filter(item=>item.status==='fulfilled').length,1);
    assert.equal(runs.filter(item=>item.status==='rejected'&&item.reason.code==='FINTOC_RECONCILIATION_STALE_PLAN').length,1);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM checking_transactions WHERE user_id=$1 AND fecha='2026-10-30' AND amount=17017",[OWNER])).rows[0].n,1);
    assert.equal(await protectedSnapshot(),before);assert.equal(await stateSnapshot(),stateBefore);
    console.log('PASS cartola shared lock and simultaneous applies cannot duplicate; original nine-table financial snapshots retained');
    const dayPlan=await service.preview(OWNER);now=new Date('2026-11-02T03:45:00.000Z');
    await assert.rejects(()=>service.apply(OWNER,{digest:dayPlan.digest}),error=>error.code==='FINTOC_RECONCILIATION_STALE_PLAN');
    assert.ok(!require.cache[require.resolve('../../backend/config/database')]);
    console.log('Integration complete: disposable PostgreSQL, fictitious data, no configured database, credentials or API.');
  }finally{
    if(client)await client.end().catch(()=>{});
    if(pool)await pool.end().catch(()=>{});
    if(started)command('/opt/homebrew/bin/pg_ctl',['-D',data,'-m','fast','-w','stop']);
    fs.rmSync(directory,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
