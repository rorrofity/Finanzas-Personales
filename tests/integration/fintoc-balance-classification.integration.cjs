/** Isolated FBA/FHC verification: disposable PostgreSQL and fictitious data only. */
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),crypto=require('crypto');
const {spawnSync}=require('child_process');
const {Pool,Client}=require('pg');
const {createFintocHistoryClassificationService}=require('../../backend/services/fintocHistoryClassificationService');
const {createFintocBankBalanceService,storeBankBalance}=require('../../backend/services/fintocBankBalanceService');
const OWNER='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222',ACCOUNT='acc_fictitious';
const directory=fs.mkdtempSync('/private/tmp/finanzas-balance-category-pg-'),data=path.join(directory,'data'),socket=path.join(directory,'socket'),PORT=55443;
fs.mkdirSync(socket);
function command(binary,args){const r=spawnSync(binary,args,{encoding:'utf8',env:{...process.env,LC_ALL:'C'}});if(r.status!==0)throw Error(`${binary} failed: ${r.stderr||r.error}`)}
async function main(){let started=false,pool,client;try{
command('/opt/homebrew/bin/initdb',['-D',data,'-A','trust','--no-locale','-U','balance_category_test']);
command('/opt/homebrew/bin/pg_ctl',['-D',data,'-l',path.join(directory,'postgres.log'),'-o',`-p ${PORT} -h 127.0.0.1 -k ${socket}`,'-w','start']);started=true;
client=new Client({host:socket,port:PORT,user:'balance_category_test',database:'postgres'});await client.connect();await client.query('CREATE DATABASE finanzas_balance_category_test');await client.end();client=null;
pool=new Pool({host:socket,port:PORT,user:'balance_category_test',database:'finanzas_balance_category_test',max:8});assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name,'finanzas_balance_category_test');
await pool.query(`CREATE TABLE users(id uuid PRIMARY KEY,email text);
CREATE TABLE categories(id integer PRIMARY KEY,user_id uuid,name text,created_at timestamptz DEFAULT now());
CREATE TABLE checking_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id),year int,month int,fecha date,descripcion varchar(60),tipo text,amount numeric(14,2),category_id integer REFERENCES categories(id),notas text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE checking_balances(user_id uuid,year int,month int,initial_balance numeric(14,2),known_balance numeric(14,2),balance_date date,updated_at timestamptz DEFAULT now(),PRIMARY KEY(user_id,year,month));
CREATE TABLE transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,fecha date,descripcion text,monto numeric(14,2),category_id integer);
CREATE TABLE intl_unbilled(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,fecha date,descripcion text,amount_clp numeric(14,2),category_id integer);
CREATE TABLE installment_plans(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,category_id integer);
CREATE TABLE installment_occurrences(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,category_id integer);
CREATE TABLE projected_templates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,category_id integer);
CREATE TABLE projected_occurrences(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,category_id integer);`);
await pool.query('INSERT INTO users VALUES($1,$2),($3,$4)',[OWNER,'owner@example.invalid',OTHER,'other@example.invalid']);
await pool.query("INSERT INTO categories(id,user_id,name) VALUES(1,$1,'Servicios ficticios'),(2,$1,'Otra categoría'),(3,$1,'Sin categorizar'),(4,$2,'Privada ajena'),(5,NULL,'Global ficticia')",[OWNER,OTHER]);
await pool.query("INSERT INTO checking_balances VALUES($1,2026,7,100,200,'2026-07-15',now())",[OWNER]);
for(const table of ['transactions','intl_unbilled','installment_plans','installment_occurrences','projected_templates','projected_occurrences'])await pool.query(`INSERT INTO ${table}(user_id,category_id) VALUES($1,1)`,[OWNER]);
await pool.query(fs.readFileSync(path.join(__dirname,'../../backend/migrations/031_create_fintoc_daily_sync.sql'),'utf8'));
const migration=fs.readdirSync(path.join(__dirname,'../../backend/migrations')).find(n=>/^032_.*bank.*balance.*\.sql$/.test(n));assert.ok(migration);
await pool.query(fs.readFileSync(path.join(__dirname,'../../backend/migrations',migration),'utf8'));await pool.query(fs.readFileSync(path.join(__dirname,'../../backend/migrations',migration),'utf8'));
await pool.query("INSERT INTO fintoc_sync_state(user_id,account_id,cutover_date,last_success_at,bank_updated_at,coverage_since,coverage_until)VALUES($1,$2,'2026-11-01','2026-11-01T02:00Z','2026-11-01T01:00Z','2026-09-01','2026-11-01')",[OWNER,ACCOUNT]);
async function checking(description,category,type='cargo',owner=OWNER){const id=crypto.randomUUID();await pool.query("INSERT INTO checking_transactions(id,user_id,year,month,fecha,descripcion,tipo,amount,category_id,notas,created_at,updated_at)VALUES($1,$2,2026,10,'2026-10-10',$3,$4,12345,$5,'Nota intacta','2025-01-01T00:00:00.123456Z','2026-01-01T00:00:00.654321Z')",[id,owner,description,type,category]);return id}
async function mapping(id,n,account=ACCOUNT,owner=OWNER){await pool.query("INSERT INTO fintoc_external_movements(user_id,account_id,external_id,fecha,descripcion,tipo,amount,status,pending,provider_hash,first_snapshot,financial_snapshot,disposition,checking_transaction_id,had_financial_reference,created_checking)SELECT $1,$2,$3,fecha,descripcion,tipo,amount,'confirmed',false,'fixture','{}','{}','inserted',id,true,true FROM checking_transactions WHERE id=$4",[owner,account,'mov_fixture_'+n,id])}
await checking('Factura ÁGUA',1);await checking('Conflicto',1);await checking('Conflicto',2);await checking('Traspaso 1234',2);await checking('Sueldo ficticio',1,'abono');await checking('Sin resolver',3);await checking('Privado',4,'cargo',OTHER);await checking('Global',5);
const inferred=await checking('Aprendido de importación',2);await mapping(inferred,'training','acc_other');
const targets={exact:await checking('  FACTURA agua ',null),conflict:await checking('Conflicto',null),identity:await checking('Traspaso 1235',null),type:await checking('Sueldo ficticio',null),pseudo:await checking('Sin resolver',null),inferred:await checking('Aprendido de importación',null),global:await checking('Global',null),unknown:await checking('Comercio nuevo',null)};
for(const [name,id]of Object.entries(targets))await mapping(id,name);
const already=await checking('Factura agua',2);await mapping(already,'already');
const manualNull=await checking('Factura agua',null),otherTarget=await checking('Factura agua',null,'cargo',OTHER);await mapping(otherTarget,'other',ACCOUNT,OTHER);
const tables=['categories','transactions','intl_unbilled','checking_transactions','checking_balances','installment_plans','installment_occurrences','projected_templates','projected_occurrences'];
async function snapshot(){const value={};for(const t of tables)value[t]=(await pool.query(`SELECT row_to_json(t)::text AS raw FROM ${t} t ORDER BY row_to_json(t)::text`)).rows.map(r=>r.raw);return value}
async function state(){return(await pool.query('SELECT row_to_json(s)::text AS raw FROM fintoc_sync_state s ORDER BY user_id,account_id')).rows}
const original=await snapshot(),originalState=await state();const env={FINTOC_OWNER_USER_ID:OWNER,FINTOC_ACCOUNT_ID:ACCOUNT};let now='2026-11-01T12:00:00Z';
const classify=createFintocHistoryClassificationService({db:pool,env,now:()=>new Date(now)});
const preview=await classify.preview(OWNER);assert.equal(preview.summary.classify,2);assert.equal(preview.summary.leave,6);assert.deepEqual(await snapshot(),original);assert.deepEqual(await state(),originalState);
await assert.rejects(()=>classify.preview(OTHER));assert.equal((await classify.preview(OWNER)).digest,preview.digest);
const applied=await classify.apply(OWNER,{digest:preview.digest});assert.equal(applied.classified,2);
const after=await snapshot();for(const table of tables.filter(n=>n!=='checking_transactions'))assert.deepEqual(after[table],original[table]);
const oldRows=new Map(original.checking_transactions.map(raw=>{const v=JSON.parse(raw);return[v.id,v]}));for(const raw of after.checking_transactions){const row=JSON.parse(raw),before=oldRows.get(row.id);assert.ok(before);if([targets.exact,targets.global].includes(row.id)){assert.equal(row.category_id,row.id===targets.exact?1:5);delete row.category_id;delete row.updated_at;const copy={...before};delete copy.category_id;delete copy.updated_at;assert.deepEqual(row,copy)}else assert.deepEqual(row,before)}
assert.deepEqual(await state(),originalState);assert.equal((await classify.preview(OWNER)).summary.classify,0);await assert.rejects(()=>classify.apply(OWNER,{digest:preview.digest}));
assert.equal((await pool.query('SELECT category_id FROM checking_transactions WHERE id=ANY($1::uuid[])',[ [already,manualNull,otherTarget] ])).rows.filter(r=>r.category_id===null).length,2);
console.log('PASS classification evidence, type/counterparty isolation, contradictions, global categories and original fields/state preserved');
// A human decision between preview/apply must never be overwritten.
const staleTarget=await checking('Factura agua',null);await mapping(staleTarget,'stale');const stalePlan=await classify.preview(OWNER);await pool.query('UPDATE checking_transactions SET category_id=2 WHERE id=$1',[staleTarget]);await assert.rejects(()=>classify.apply(OWNER,{digest:stalePlan.digest}));assert.equal((await pool.query('SELECT category_id FROM checking_transactions WHERE id=$1',[staleTarget])).rows[0].category_id,2);
const rollbackTarget=await checking('Factura agua',null);await mapping(rollbackTarget,'rollback');const rollbackPlan=await classify.preview(OWNER),beforeFailure=await snapshot();
await pool.query(`CREATE FUNCTION block_category()RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.id='${rollbackTarget}' THEN RAISE EXCEPTION 'fixture rollback';END IF;RETURN NEW;END $$;CREATE TRIGGER block_category BEFORE UPDATE ON checking_transactions FOR EACH ROW EXECUTE FUNCTION block_category();`);
await assert.rejects(()=>classify.apply(OWNER,{digest:rollbackPlan.digest}));assert.deepEqual(await snapshot(),beforeFailure);await pool.query('DROP TRIGGER block_category ON checking_transactions;DROP FUNCTION block_category();');
console.log('PASS stale classification plan and transactional rollback protect human edits');
let calls=0;const provider={assertOwner:id=>assert.equal(id,OWNER),getStatus:()=>({state:'ready',mode:'live'}),readBalance:async()=>{calls++;return{currency:'CLP',available:'1234567',current:'-100',bankUpdatedAt:'2026-11-01T11:00:00Z',queriedAt:now}}};
const balance=createFintocBankBalanceService({db:pool,provider,env,now:()=>new Date(now)});const beforeBalance=await snapshot();
assert.equal((await balance.getBankBalance(OWNER)).state,'unavailable');assert.equal(calls,0);await balance.refreshBalance(OWNER);const first=await balance.getBankBalance(OWNER);assert.equal(first.available,'1234567');assert.equal(first.current,'-100');assert.equal(calls,1);assert.deepEqual(await snapshot(),beforeBalance);assert.deepEqual(await state(),originalState);
await storeBankBalance(pool,{userId:OWNER,accountId:ACCOUNT},{currency:'CLP',available:'9',current:'9',bankUpdatedAt:'2026-11-01T10:00:00Z',queriedAt:'2026-11-01T13:00:00Z'});assert.equal((await balance.getBankBalance(OWNER)).available,'1234567');
await storeBankBalance(pool,{userId:OWNER,accountId:ACCOUNT},{currency:'CLP',available:'8',current:'8',bankUpdatedAt:'2026-11-01T11:00:00Z',queriedAt:'2026-11-01T10:00:00Z'});assert.equal((await balance.getBankBalance(OWNER)).available,'1234567');
await assert.rejects(()=>balance.getBankBalance(OTHER));now='2026-11-03T12:00:00Z';assert.equal((await balance.getBankBalance(OWNER)).freshness,'stale');assert.equal(calls,1);
console.log('PASS exact available/current bank snapshot, no credit-line arithmetic, monotonic writes, freshness and zero financial changes');
const {createFintocDailySyncService}=require('../../backend/services/fintocDailySyncService');
const dailyEnv={FINTOC_ENABLED:'true',FINTOC_PERSONAL_FREE_ACCESS_CONFIRMED:'true',FINTOC_DAILY_SYNC_ENABLED:'true',FINTOC_MODE:'live',FINTOC_OWNER_USER_ID:OTHER,FINTOC_ACCOUNT_ID:ACCOUNT};
let failLast=false;
const dailyProvider={assertOwner:id=>assert.equal(id,OTHER),getStatus:()=>({state:'ready',mode:'live'}),readSnapshot:async(actor,period)=>{
assert.equal(actor,OTHER);if(failLast&&period.month==='11')throw Object.assign(Error('fixture incomplete'),{code:'FINTOC_INCOMPLETE'});
return{provider:'fintoc',mode:'live',period:{year:Number(period.year),month:Number(period.month)},items:[],total:0,coverage:{complete:true},bankUpdatedAt:'2026-11-01T13:00:00Z',bankBalance:{currency:'CLP',available:'987654',current:'987000',bankUpdatedAt:'2026-11-01T13:00:00Z',queriedAt:'2026-11-01T14:00:00Z'}};
}};
const daily=createFintocDailySyncService({db:pool,provider:dailyProvider,env:dailyEnv,now:()=>new Date('2026-11-01T14:00:00Z')});
const beforeDaily=await snapshot();assert.equal((await daily.run({trigger:'initial'})).status,'success');
assert.equal((await pool.query('SELECT available::text FROM fintoc_bank_balances WHERE user_id=$1 AND account_id=$2',[OTHER,ACCOUNT])).rows[0].available,'987654');assert.deepEqual(await snapshot(),beforeDaily);
const bankBeforeFailure=(await pool.query('SELECT row_to_json(b)::text AS raw FROM fintoc_bank_balances b ORDER BY user_id,account_id')).rows;
failLast=true;assert.equal((await daily.run({trigger:'scheduled'})).status,'error');assert.deepEqual((await pool.query('SELECT row_to_json(b)::text AS raw FROM fintoc_bank_balances b ORDER BY user_id,account_id')).rows,bankBeforeFailure);assert.deepEqual(await snapshot(),beforeDaily);
console.log('PASS complete daily transaction captures bank balance; incomplete provider batch preserves the prior snapshot and financial rows');
assert.ok(!require.cache[require.resolve('../../backend/config/database')]);console.log('Integration complete: disposable PostgreSQL and fictitious provider only; no real database, API or credentials.');
}finally{if(client)await client.end().catch(()=>{});if(pool)await pool.end().catch(()=>{});if(started)command('/opt/homebrew/bin/pg_ctl',['-D',data,'-m','fast','-w','stop']);fs.rmSync(directory,{recursive:true,force:true})}}
main().catch(e=>{console.error(e);process.exitCode=1});
