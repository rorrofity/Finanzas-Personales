'use strict';
/** An isolated PostgreSQL Unix-socket cluster; never reads .env or production. */
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),Module=require('module');
const {execFileSync}=require('child_process'),{Pool}=require('pg'),express=require('express'),axios=require('axios');
const APP=path.resolve(__dirname,'../..'),PG_BIN=process.env.ESP_TEST_PG_BIN||'/opt/homebrew/bin';
const tempBase=fs.existsSync('/private/tmp')?'/private/tmp':fs.realpathSync(os.tmpdir());
const cleanEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('PG')&&!key.startsWith('DB_')));
let temp,pool,server,started=false;const originalLoad=Module._load;
const run=(name,args)=>execFileSync(path.join(PG_BIN,name),args,{cwd:temp,env:cleanEnv,stdio:['ignore','pipe','pipe'],timeout:90000});
const id=()=>crypto.randomUUID();
(async()=>{
  temp=fs.mkdtempSync(path.join(tempBase,'finanzas-esp-'));fs.chmodSync(temp,0o700);
  const data=path.join(temp,'data'),socket=path.join(temp,'socket');fs.mkdirSync(socket,{mode:0o700});
  const port=55449,database='finanzas_esp_test_'+crypto.randomBytes(5).toString('hex');
  run('initdb',['-D',data,'--auth-local=trust','--auth-host=reject','-U','postgres','--encoding=UTF8','--no-locale']);
  started=true;run('pg_ctl',['-D',data,'-l',path.join(temp,'postgres-private.log'),'-o',`-c listen_addresses='' -c unix_socket_directories='${socket}' -c port=${port}`,'-w','start']);
  run('createdb',['-h',socket,'-p',String(port),'-U','postgres',database]);
  pool=new Pool({host:socket,port,database,user:'postgres',password:'',max:10,connectionTimeoutMillis:5000});
  const settings=(await pool.query("SELECT current_database() AS database,current_setting('listen_addresses') AS listen,current_setting('unix_socket_directories') AS socket")).rows[0];
  assert.equal(settings.database,database);assert.equal(settings.listen,'');assert.equal(settings.socket,socket);
  await pool.query(`CREATE TABLE users(id UUID PRIMARY KEY,nombre TEXT,email TEXT);
    CREATE TABLE categories(id INTEGER PRIMARY KEY,user_id UUID REFERENCES users(id),name TEXT);
    CREATE TABLE transactions(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID NOT NULL REFERENCES users(id),fecha DATE,descripcion TEXT,monto NUMERIC(12,2),tipo TEXT,category_id INTEGER REFERENCES categories(id),metadata JSONB,billing_year INTEGER,billing_month INTEGER,cuotas TEXT,notas TEXT,updated_by UUID,updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE intl_unbilled(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID NOT NULL REFERENCES users(id),fecha DATE,descripcion TEXT,amount_clp NUMERIC(14,2),amount_usd NUMERIC(14,2),exchange_rate NUMERIC(14,4),tipo TEXT,category_id INTEGER REFERENCES categories(id),brand TEXT,period_year INTEGER,period_month INTEGER,notas TEXT,updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE checking_transactions(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID NOT NULL REFERENCES users(id),fecha DATE,descripcion TEXT,amount NUMERIC(14,2),tipo TEXT,category_id INTEGER REFERENCES categories(id),year INTEGER,month INTEGER,notas TEXT,updated_at TIMESTAMPTZ DEFAULT NOW());`);
  const owner=id(),partner=id(),other=id(),national=id(),international=id(),checking=id(),payment=id(),otherParent=id();
  await pool.query('INSERT INTO users VALUES($1,$2,$3),($4,$5,$6),($7,$8,$9)',[owner,'Fixture owner','owner@fixture.invalid',partner,'Fixture partner','partner@fixture.invalid',other,'Fixture other','other@fixture.invalid']);
  await pool.query("INSERT INTO categories VALUES(1,$1,'Fixture original'),(2,NULL,'Fixture global'),(3,$2,'Fixture foreign')",[owner,other]);
  await pool.query(`INSERT INTO transactions(id,user_id,fecha,descripcion,monto,tipo,category_id,metadata,billing_year,billing_month,cuotas,notas) VALUES($1,$2,'2026-10-15','Fixture original national',180000,'gasto',1,'{"email_id":"fixture-message-national","bank_id":"fixture-bank-id","banco":"banco_chile","tipo_tarjeta":"visa","tarjeta_ultimos_4":"1111"}',2026,11,'03/06','Preserve national notes'),($3,$4,'2026-10-16','Foreign fixture',20,'gasto',3,'{}',2026,11,'01','Preserve foreign notes')`,[national,owner,otherParent,other]);
  await pool.query(`INSERT INTO intl_unbilled(id,user_id,fecha,descripcion,amount_clp,amount_usd,exchange_rate,tipo,category_id,brand,period_year,period_month,notas) VALUES($1,$2,'2026-10-15','Fixture international',90123.45,100.25,898.987,'gasto',NULL,'visa',2026,11,'Preserve USD and exchange')`,[international,owner]);
  await pool.query(`INSERT INTO checking_transactions(id,user_id,fecha,descripcion,amount,tipo,category_id,year,month,notas) VALUES($1,$2,'2026-10-15','Fixture checking',80000,'cargo',1,2026,10,'Preserve checking notes'),($3,$2,'2026-10-16','Pago tarjeta credito',180000,'cargo',NULL,2026,10,'Payment remains a payment')`,[checking,owner,payment]);
  const snapshot=async()=>{const out={};for(const table of ['users','categories','transactions','intl_unbilled','checking_transactions'])out[table]=(await pool.query(`SELECT jsonb_agg(to_jsonb(t) ORDER BY id)::text AS value FROM ${table} t`)).rows[0].value;return out;};
  const before=await snapshot();
  for(let repeat=0;repeat<2;repeat++)for(const name of ['026_create_space_members.sql','037_create_expense_splits.sql'])await pool.query(fs.readFileSync(path.join(APP,'backend/migrations',name),'utf8'));
  assert.deepEqual(await snapshot(),before);
  await pool.query("INSERT INTO space_members(owner_user_id,member_user_id,invited_email,status,can_edit,can_delete) VALUES($1,$2,'partner@fixture.invalid','linked',false,false)",[owner,partner]);
  const dbPath=path.join(APP,'backend/config/database.js');
  Module._load=function(request,parent,isMain){let resolved;try{resolved=Module._resolveFilename(request,parent)}catch(_){}if(resolved===dbPath)return{pool,query:(...args)=>pool.query(...args)};return originalLoad.call(this,request,parent,isMain);};
  process.env.NODE_ENV='test';process.env.JWT_SECRET='fictitious-isolated-expense-split-secret';process.env.AUTH_SESSION_VERSION='fixture-only';
  const auth=require(path.join(APP,'backend/middleware/auth')),service=require(path.join(APP,'backend/services/expenseSplitService'));
  const app=express();app.use(express.json());app.use('/api/expense-splits',require(path.join(APP,'backend/routes/expenseSplitRoutes')).createExpenseSplitRouter());
  server=await new Promise(resolve=>{const listening=app.listen(0,'127.0.0.1',()=>resolve(listening));});
  const base='http://127.0.0.1:'+server.address().port,jwtOwner=auth.generateToken(owner),jwtPartner=auth.generateToken(partner),jwtOther=auth.generateToken(other);
  const call=(method,source,parent,token,body,sharedOwner)=>axios.request({method,url:`${base}/api/expense-splits/${source}/${parent}`,data:body,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(sharedOwner?{'X-Space-Owner':sharedOwner}:{})},validateStatus:()=>true,timeout:10000});
  const body=(first,second,expectedVersion=0)=>({expectedVersion,parts:[{amount_clp:first,category_id:2},{amount_clp:second,category_id:null}]});
  assert.equal((await call('get','tc_nacional',national,null)).status,401);
  assert.equal((await call('get','tc_nacional',national,jwtOther)).status,404);
  assert.equal((await call('get','tc_nacional',national,jwtOther,null,owner)).status,403);
  assert.equal((await call('put','tc_nacional',national,jwtPartner,body('100000','80000'),owner)).status,403);
  const initial=await call('get','tc_nacional',national,jwtOwner);assert.equal(initial.status,200);assert.equal(initial.data.split,null);assert.equal(initial.data.total_clp,'180000.00');
  const created=await call('put','tc_nacional',national,jwtOwner,body('100000','80000'));assert.equal(created.status,200);assert.match(created.data.split.version,/^[a-f0-9-]{36}$/);assert.equal(created.data.split.parts[0].category_name,'Fixture global');const v1=created.data.split.version;
  assert.deepEqual(await snapshot(),before);
  const shared=await call('get','tc_nacional',national,jwtPartner,null,owner);assert.equal(shared.status,200);assert.deepEqual(shared.data,created.data);
  assert.equal((await call('delete','tc_nacional',national,jwtPartner,{expectedVersion:v1},owner)).status,403);
  for(const invalid of [body('100000','80000.01',v1),body('100000','79999.99',v1),{...body('100000','80000',v1),ownerId:other},{...body('100000','80000',v1),parts:[{amount_clp:'100000',category_id:3},{amount_clp:'80000',category_id:null}]}])assert.equal((await call('put','tc_nacional',national,jwtOwner,invalid)).status,400);
  assert.equal((await call('put','tc_nacional',national,jwtOwner,body('100000','80000'))).status,409);
  const competing=await Promise.all([call('put','tc_nacional',national,jwtOwner,body('90000','90000',v1)),call('put','tc_nacional',national,jwtOwner,body('70000','110000',v1))]);assert.deepEqual(competing.map(r=>r.status).sort(),[200,409]);
  const v2=competing.find(r=>r.status===200).data.split.version;assert.notEqual(v1,v2);
  for(const [sql,values] of [
    ['UPDATE transactions SET monto=1 WHERE id=$1',[national]],['UPDATE transactions SET category_id=2 WHERE id=$1',[national]],['UPDATE transactions SET metadata=$2 WHERE id=$1',[national,'{}']],['UPDATE transactions SET user_id=$2 WHERE id=$1',[national,other]],
  ])await assert.rejects(pool.query(sql,values),error=>error.code==='P0001'&&error.message==='EXPENSE_SPLIT_PARENT_LOCKED');
  await assert.rejects(pool.query('DELETE FROM categories WHERE id=2'),error=>error.code==='23503');
  const broken=await pool.connect();try{await broken.query('BEGIN');await broken.query('UPDATE expense_split_parts SET amount_clp=1 WHERE split_id=(SELECT id FROM expense_splits WHERE transaction_id=$1) AND position=0',[national]);await assert.rejects(broken.query('COMMIT'));}finally{await broken.query('ROLLBACK');broken.release();}
  assert.deepEqual(await snapshot(),before);
  const intl=await call('put','tc_internacional',international,jwtOwner,body('40000.01','50123.44'));assert.equal(intl.status,200);assert.equal(intl.data.total_clp,'90123.45');
  await assert.rejects(pool.query('UPDATE intl_unbilled SET exchange_rate=1 WHERE id=$1',[international]),error=>error.message==='EXPENSE_SPLIT_PARENT_LOCKED');
  const checkingSplit=await Promise.all([call('put','cuenta_corriente',checking,jwtOwner,body('30000','50000')),call('put','cuenta_corriente',checking,jwtOwner,body('40000','40000'))]);assert.deepEqual(checkingSplit.map(r=>r.status).sort(),[200,409]);
  await assert.rejects(pool.query('UPDATE checking_transactions SET amount=1 WHERE id=$1',[checking]),error=>error.message==='EXPENSE_SPLIT_PARENT_LOCKED');
  assert.equal((await call('put','cuenta_corriente',payment,jwtOwner,body('100000','80000'))).status,400);
  const overlaySnapshot=async()=>({headers:(await pool.query('SELECT jsonb_agg(to_jsonb(s) ORDER BY id)::text AS value FROM expense_splits s')).rows[0].value,parts:(await pool.query('SELECT jsonb_agg(to_jsonb(p) ORDER BY split_id,position)::text AS value FROM expense_split_parts p')).rows[0].value});
  const overlaysBeforeImport=await overlaySnapshot(),db={pool,query:(...args)=>pool.query(...args)},previousLog=console.log;
  let reimported;
  try{
    console.log=()=>{};
    const Transaction=require(path.join(APP,'backend/models/Transaction')),IntlUnbilled=require(path.join(APP,'backend/models/IntlUnbilled')),Checking=require(path.join(APP,'backend/models/Checking'));
    reimported={
      national:await new Transaction(db).importFromCSV(owner,[{fecha:'2026-10-15',descripcion:'Fixture original national',monto:180000,categoria:'Must not overwrite'}]),
      international:await new IntlUnbilled(db).bulkImport(owner,{brand:'visa',exchange_rate:999,periodYear:2026,periodMonth:11,rows:[{fecha:'2026-10-15',descripcion:'Fixture international',amount_usd:100.25,tipo:'gasto',category_id:2}]}),
      checking:await new Checking(db).bulkImport(owner,[{fecha:'2026-10-15',descripcion:'Fixture checking',amount:80000,tipo:'cargo'}]),
    };
  } finally{console.log=previousLog;}
  assert.equal(reimported.national.stats.inserted,0);assert.equal(reimported.national.stats.skipped,1);
  assert.deepEqual(reimported.international,{inserted:0,skipped:1});assert.deepEqual(reimported.checking,{inserted:0,skipped:1});
  assert.deepEqual(await overlaySnapshot(),overlaysBeforeImport);assert.deepEqual(await snapshot(),before);
  // Card statements must use the complete bank parent even when one stored part is uncategorized.
  const {matchStatement}=require(path.join(APP,'backend/services/cardStatements/matcher'));
  const {planSettlement}=require(path.join(APP,'backend/services/cardStatements/settlement'));
  const bankParent=(await pool.query(`SELECT id::text,fecha::text AS date,descripcion AS description,monto::text AS amount,tipo AS type,
    billing_year AS "billingYear",billing_month AS "billingMonth",metadata->>'tipo_tarjeta' AS network,
    metadata->>'tarjeta_ultimos_4' AS "cardLastFour" FROM transactions WHERE user_id=$1 AND id=$2`,[owner,national])).rows[0];
  const source={...bankParent,sourceType:'transaction',currency:'CLP',providerKnown:true};
  const storedParts=(await call('get','tc_nacional',national,jwtOwner)).data.split.parts;assert(storedParts.some(part=>part.category_id===null));
  const bankDocument={version:1,network:'visa',mainCardLastFour:'1111',statementDate:'2026-10-22',period:{since:'2026-09-23',until:'2026-10-22'},dueDate:'2026-11-05',validation:{valid:true,issues:[]},sections:[{
    scope:'national',currency:'CLP',totals:{billedTotal:'180000'},validation:{valid:true,issues:[]},items:[{rowKey:'fixture-split-bank-row',page:1,date:'2026-10-15',description:'Fixture original national',reference:'fixture-bank-id',cardLastFour:'1111',kind:'purchase',currency:'CLP',amount:'180000',operationAmount:'180000',installmentNumber:1,installmentTotal:1}],
  }]};
  const matched=matchStatement(bankDocument,[source]);assert.equal(matched.sections[0].counts.matched,1);assert.equal(matched.sections[0].items[0].finding.sourceId,national);
  const settlementArgs={runId:id(),document:bankDocument,sources:[source],cards:[{last_four:'1111',network:'visa',is_active:true}],asOfDate:'2026-11-02'};
  const settlement=planSettlement(settlementArgs);assert.deepEqual(settlement.summary,{insert:0,link:1,hold:0,informational:0});assert.equal(settlement.actions[0].sourceId,national);assert.equal(settlement.actions[0].sourceType,'transaction');assert.equal(settlement.sections[0].reconciliation.complete,true);
  const repeatSettlement=planSettlement({...settlementArgs,evidence:[{fingerprint:settlement.actions[0].fingerprint,source_type:'transaction',source_id:national,decision:'link'}]});assert.deepEqual(repeatSettlement.summary,{insert:0,link:1,hold:0,informational:0});assert.equal(repeatSettlement.actions[0].reason,'already_recorded');
  assert.deepEqual(await overlaySnapshot(),overlaysBeforeImport);assert.deepEqual(await snapshot(),before);
  await assert.rejects(pool.query('UPDATE expense_split_parts SET split_id=$1 WHERE split_id=(SELECT id FROM expense_splits WHERE transaction_id=$2) AND position=0',[id(),national]),error=>error.code==='23514'&&error.message==='EXPENSE_SPLIT_IMMUTABLE_PART_PARENT');
  const attached=await service.attachSplits(owner,'tc_nacional',[{id:national,category_id:1,monto:'180000.00'}]);assert.equal(attached[0].split.version,v2);assert.equal(attached[0].category_id,1);
  const undone=await call('delete','tc_nacional',national,jwtOwner,{expectedVersion:v2});assert.equal(undone.status,200);assert.equal(undone.data.split,null);
  const recreated=await call('put','tc_nacional',national,jwtOwner,body('100000','80000'));assert.equal(recreated.status,200);assert.notEqual(recreated.data.split.version,v1);assert.notEqual(recreated.data.split.version,v2);
  assert.equal((await call('put','tc_nacional',national,jwtOwner,body('100000','80000',v2))).status,409);
  await pool.query('UPDATE space_members SET can_edit=true WHERE member_user_id=$1',[partner]);
  const memberEdit=await call('put','tc_nacional',national,jwtPartner,body('60000','120000',recreated.data.split.version),owner);assert.equal(memberEdit.status,200);
  assert.equal((await pool.query('SELECT updated_by FROM expense_splits WHERE transaction_id=$1',[national])).rows[0].updated_by,partner);
  assert.deepEqual(await snapshot(),before);
  const temporary=id();await pool.query("INSERT INTO checking_transactions(id,user_id,fecha,descripcion,amount,tipo,category_id,year,month) VALUES($1,$2,'2026-11-01','Cascade fixture',3,'cargo',1,2026,11)",[temporary,owner]);
  const cascade=await call('put','cuenta_corriente',temporary,jwtOwner,body('1','2'));assert.equal(cascade.status,200);await pool.query('DELETE FROM checking_transactions WHERE id=$1',[temporary]);assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM expense_splits WHERE checking_transaction_id=$1',[temporary])).rows[0].count,0);
  assert.deepEqual(await snapshot(),before);
  console.log(JSON.stringify({status:'ok',isolatedUnixSocket:true,tcpDisabled:true,migrationsIdempotent:true,threeSources:true,parentRowsByteIdentical:true,categoriesPreserved:true,threeSourceReimportsPreserveSplits:true,cardStatementMatchesOriginalAndPlansZeroInserts:true,uncategorizedPartNeverMakesBankChargeMissing:true,readOnlyGuarded:true,foreignOwnerAndCategoryRejected:true,concurrentSingleWinner:true,abaPrevented:true,originalBankFieldsGuarded:true,sqlTotalConstraint:true,immutablePartParent:true,undoRestoresLegacyCategory:true,batchAttachment:true,realActorAudited:true,parentDeleteCascades:true,productionAccess:false}));
})().catch(error=>{fs.writeFileSync(path.join(tempBase,'esp-integration-error-private.log'),String(error.stack),{mode:0o600});console.error(JSON.stringify({status:'failed',code:'ISOLATED_EXPENSE_SPLIT_INTEGRATION_FAILED'}));process.exitCode=1;}).finally(async()=>{
  try{if(server)await new Promise(resolve=>server.close(resolve));if(pool)await pool.end();if(started){run('pg_ctl',['-D',path.join(temp,'data'),'-m','fast','-w','stop']);started=false;}if(temp&&!started)fs.rmSync(temp,{recursive:true,force:true});}
  catch(_){console.error(JSON.stringify({status:'failed',code:'ISOLATED_CLUSTER_CLEANUP_FAILED'}));process.exitCode=1;}
  finally{Module._load=originalLoad;}
});
