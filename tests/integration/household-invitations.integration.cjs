'use strict';
/** Real HTTP/SQL fixture. Creates and removes its own isolated Unix-socket cluster. */
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),Module=require('module');
const {execFileSync}=require('child_process');
const APP=path.resolve(__dirname,'../..'),{Pool}=require('pg'),express=require('express'),axios=require('axios');
const PG_BIN=process.env.HRO_TEST_PG_BIN||'/opt/homebrew/bin';
let temp,pool,server,started=false,originalLoad=Module._load;
const tempBase=fs.existsSync('/private/tmp')?'/private/tmp':fs.realpathSync(os.tmpdir());
const testEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('PG')&&!key.startsWith('DB_')));
const run=(name,args)=>execFileSync(path.join(PG_BIN,name),args,{cwd:temp,env:testEnv,stdio:['ignore','pipe','pipe'],timeout:90000});
const id=()=>crypto.randomUUID();
function tokenFrom(url){const parsed=new URL(url);assert.equal(parsed.pathname,'/invite');assert.equal(parsed.search,'');return new URLSearchParams(parsed.hash.slice(1)).get('token')}
(async()=>{
  temp=fs.mkdtempSync(path.join(tempBase,'finanzas-hro-'));fs.chmodSync(temp,0o700);
  assert(path.basename(temp).startsWith('finanzas-hro-'));const data=path.join(temp,'data'),socket=path.join(temp,'socket');fs.mkdirSync(socket,{mode:0o700});
  const port=55448,dbName='finanzas_hro_test_'+crypto.randomBytes(5).toString('hex');
  run('initdb',['-D',data,'--auth-local=trust','--auth-host=reject','-U','postgres','--encoding=UTF8','--no-locale']);
  started=true;run('pg_ctl',['-D',data,'-l',path.join(temp,'postgres-private.log'),'-o',`-c listen_addresses='' -c unix_socket_directories='${socket}' -c port=${port}`,'-w','start']);
  run('createdb',['-h',socket,'-p',String(port),'-U','postgres',dbName]);
  pool=new Pool({host:socket,port,database:dbName,user:'postgres',password:'',max:8,connectionTimeoutMillis:5000});
  const settings=(await pool.query("SELECT current_database() AS database,current_setting('listen_addresses') AS listen,current_setting('unix_socket_directories') AS socket")).rows[0];
  assert.equal(settings.database,dbName);assert.equal(settings.listen,'');assert.equal(settings.socket,socket);
  await pool.query(`CREATE TABLE users(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),nombre VARCHAR(100),email VARCHAR(100) UNIQUE,password TEXT,auth_provider TEXT DEFAULT 'local',google_id TEXT UNIQUE,profile_picture TEXT,created_at TIMESTAMPTZ DEFAULT NOW(),ultimo_inicio_sesion TIMESTAMPTZ,auto_sync_enabled BOOLEAN DEFAULT false);
    CREATE TABLE categories(id UUID PRIMARY KEY,user_id UUID REFERENCES users(id),name TEXT);
    CREATE TABLE transactions(id UUID PRIMARY KEY,user_id UUID REFERENCES users(id),category_id UUID REFERENCES categories(id),monto NUMERIC(12,2),notas TEXT);`);
  const owner=id(),partner=id(),other=id(),category=id();
  await pool.query('INSERT INTO users(id,nombre,email,auth_provider) VALUES($1,$2,$3,$4),($5,$6,$7,$4),($8,$9,$10,$4)',[owner,'Fixture Owner','owner@fixture.invalid','local',partner,'Fixture Partner','partner@fixture.invalid',other,'Fixture Other','other@fixture.invalid']);
  await pool.query('INSERT INTO categories VALUES($1,$2,$3)',[category,owner,'Fictitious category']);
  await pool.query('INSERT INTO transactions VALUES($1,$2,$3,$4,$5),($6,$2,NULL,$7,NULL)',[id(),owner,category,'123.45','Preserve fixture notes',id(),'67.89']);
  const financialSnapshot=async()=> (await pool.query("SELECT json_build_object('categories',(SELECT json_agg(t ORDER BY id) FROM categories t),'transactions',(SELECT json_agg(t ORDER BY id) FROM transactions t)) AS value")).rows[0].value;
  const before=await financialSnapshot();
  for(let repeat=0;repeat<2;repeat++)for(const name of ['026_create_space_members.sql','036_secure_household_invitations.sql'])await pool.query(fs.readFileSync(path.join(APP,'backend/migrations',name),'utf8'));
  assert.deepEqual(await financialSnapshot(),before);
  const dbPath=path.join(APP,'backend/config/database.js');
  Module._load=function(request,parent,isMain){let resolved;try{resolved=Module._resolveFilename(request,parent)}catch(_){}if(resolved===dbPath)return{pool,query:(...args)=>pool.query(...args)};return originalLoad.call(this,request,parent,isMain)};
  process.env.GOOGLE_CLIENT_ID='fixture-client.apps.googleusercontent.com';process.env.NODE_ENV='test';process.env.JWT_SECRET='fictitious-isolated-session-secret';process.env.AUTH_SESSION_VERSION='fixture-after-security-fix';process.env.APP_PUBLIC_URL='https://fixture.invalid';
  const auth=require(path.join(APP,'backend/middleware/auth')),permissions=require(path.join(APP,'backend/middleware/requirePermission')),resolveSpace=require(path.join(APP,'backend/middleware/resolveSpace')).resolveSpace;
  const app=express();app.use(express.json());app.use('/api/auth',require(path.join(APP,'backend/routes/authRoutes')));app.use('/api/space',require(path.join(APP,'backend/routes/spaceRoutes')));
  let writeHandlerCalls=0;
  app.get('/api/household',auth.auth,resolveSpace,(req,res)=>res.json({ownerId:req.spaceUserId,canEdit:req.spacePerms.canEdit,canDelete:req.spacePerms.canDelete}));
  app.post('/api/household',auth.auth,resolveSpace,permissions.requireEdit,(_req,res)=>{writeHandlerCalls++;res.status(201).json({ok:true})});
  app.delete('/api/household',auth.auth,resolveSpace,permissions.requireDelete,(_req,res)=>{writeHandlerCalls++;res.json({ok:true})});
  server=await new Promise(resolve=>{const listening=app.listen(0,'127.0.0.1',()=>resolve(listening))});
  const base='http://127.0.0.1:'+server.address().port;
  const jwtOwner=auth.generateToken(owner),jwtPartner=auth.generateToken(partner),jwtOther=auth.generateToken(other);
  const call=(method,url,token,data,sharedOwner)=>axios.request({method,url:base+url,data,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(sharedOwner?{'X-Space-Owner':sharedOwner}:{})},validateStatus:()=>true,timeout:10000});
  const invite=async email=>{const r=await call('post','/api/space/members',jwtOwner,{email});assert.equal(r.status,201);assert.equal(r.data.member.status,'pending');assert.equal(r.data.member.memberUserId,null);assert.equal(r.data.member.canEdit,false);assert.equal(r.data.member.canDelete,false);return r.data};
  const first=await invite(' Partner@Fixture.Invalid '),firstToken=tokenFrom(first.invitationUrl);assert.match(firstToken,/^[A-Za-z0-9_-]{43}$/);
  const stored=(await pool.query('SELECT * FROM space_members WHERE id=$1',[first.member.id])).rows[0];assert.notEqual(stored.invite_token_hash,firstToken);assert.equal(stored.invite_token_hash,crypto.createHash('sha256').update(firstToken).digest('hex'));
  assert.equal((await call('get','/api/household',jwtPartner,null,owner)).status,403);
  assert.equal((await call('post','/api/space/invitations/preview',jwtOther,{token:firstToken})).status,403);
  const preview=await call('post','/api/space/invitations/preview',jwtPartner,{token:firstToken});assert.equal(preview.status,200);assert.equal(preview.data.invitation.invitedEmail,'partner@fixture.invalid');
  const list=await call('get','/api/space/members',jwtOwner);assert(!JSON.stringify(list.data).includes(firstToken));assert(!JSON.stringify(list.data).includes(stored.invite_token_hash));
  const accepted=await Promise.all([call('post','/api/space/invitations/accept',jwtPartner,{token:firstToken}),call('post','/api/space/invitations/accept',jwtPartner,{token:firstToken})]);assert.deepEqual(accepted.map(r=>r.status).sort(),[200,400]);
  const household=await call('get','/api/household',jwtPartner,null,owner);assert.equal(household.status,200);assert.deepEqual(household.data,{ownerId:owner,canEdit:false,canDelete:false});
  for(const method of ['post','delete'])assert.equal((await call(method,'/api/household',jwtPartner,{monto:999},owner)).status,403);
  assert.equal(writeHandlerCalls,0);
  await call('put','/api/space/members/'+first.member.id,jwtOwner,{isActive:false});assert.equal((await call('get','/api/household',jwtPartner,null,owner)).status,403);
  await call('delete','/api/space/members/'+first.member.id,jwtOwner);assert.equal((await call('get','/api/household',jwtPartner,null,owner)).status,403);
  const next=await invite('partner@fixture.invalid'),oldToken=tokenFrom(next.invitationUrl);
  const renewed=await call('post','/api/space/members/'+next.member.id+'/renew-invitation',jwtOwner,{});assert.equal(renewed.status,200);const renewedToken=tokenFrom(renewed.data.invitationUrl);assert.notEqual(oldToken,renewedToken);
  assert.equal((await call('post','/api/space/invitations/preview',jwtPartner,{token:oldToken})).status,400);
  await pool.query("UPDATE space_members SET invite_expires_at=NOW()-INTERVAL '1 second' WHERE id=$1",[next.member.id]);assert.equal((await call('post','/api/space/invitations/accept',jwtPartner,{token:renewedToken})).status,400);
  await call('delete','/api/space/members/'+next.member.id,jwtOwner);
  const pending=await invite('future@fixture.invalid');
  const registered=await call('post','/api/auth/register',null,{nombre:'Fixture Future',email:' Future@Fixture.Invalid ',password:'fixture-only-password'});assert.equal(registered.status,201);
  const unlinked=(await pool.query('SELECT status,member_user_id FROM space_members WHERE id=$1',[pending.member.id])).rows[0];assert.deepEqual(unlinked,{status:'pending',member_user_id:null});
  assert.equal((await call('get','/api/household',registered.data.token,null,owner)).status,403);
  assert.equal((await call('post','/api/space/invitations/accept',registered.data.token,{token:tokenFrom(pending.invitationUrl)})).status,200);
  await call('delete','/api/space/members/'+pending.member.id,jwtOwner);
  const capacity=await Promise.all(['partner@fixture.invalid','other@fixture.invalid','third@fixture.invalid'].map(email=>call('post','/api/space/members',jwtOwner,{email})));assert.deepEqual(capacity.map(r=>r.status).sort(),[201,201,400]);assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM space_members')).rows[0].count,2);
  const malformedGoogle=await call('post','/api/auth/google',null,{credential:{invalid:'object'}});assert.equal(malformedGoogle.status,401);
  assert.deepEqual(await financialSnapshot(),before);
  console.log(JSON.stringify({status:'ok',isolatedUnixSocket:true,tcpDisabled:true,migrationsIdempotent:true,financialFixturesUnchanged:true,existingAndNewAccountsRequirePrivateLink:true,wrongEmailRejected:true,expiredAndRenewedLinksProtected:true,concurrentAcceptanceSingleWinner:true,concurrentInvitationsMaxTwo:true,readOnlyWritesBlockedBeforeHandler:true,revocationImmediate:true,googleMalformedCredentialRejected:true,realUsersCreated:false,productionAccess:false}));
})().catch(error=>{fs.writeFileSync(path.join(tempBase,'hro-integration-error-private.log'),String(error.stack),{mode:0o600});console.error(JSON.stringify({status:'failed',code:'ISOLATED_HOUSEHOLD_INTEGRATION_FAILED'}));process.exitCode=1}).finally(async()=>{
  try{if(server)await new Promise(resolve=>server.close(resolve));if(pool)await pool.end();if(started){run('pg_ctl',['-D',path.join(temp,'data'),'-m','fast','-w','stop']);started=false;}if(temp&&!started)fs.rmSync(temp,{recursive:true,force:true});}
  catch(_){console.error(JSON.stringify({status:'failed',code:'ISOLATED_CLUSTER_CLEANUP_FAILED'}));process.exitCode=1}
  finally{Module._load=originalLoad}
});
