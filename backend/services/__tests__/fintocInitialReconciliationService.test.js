const { planInitialReconciliation, createFintocInitialReconciliationService } = require('../fintocInitialReconciliationService');
const BASE = '2026-11-01 03:22:27.123456+00';
const OWNER = 'owner-fixture';
const ACCOUNT = 'acc_fixture';
const movement = (id, patch={}) => ({ external_id:id,fecha:'2026-10-15',descripcion:'Compra ficticia',tipo:'cargo',amount:'12000',status:'confirmed',pending:false,disposition:'needs_review',reason:'initial_unmatched',checking_transaction_id:null,had_financial_reference:false,created_checking:false,first_seen_at:BASE,first_snapshot:{date:'2026-10-15',description:'Compra ficticia',type:'cargo',amount:'12000'},...patch });
const checking = (id, patch={}) => ({ id,fecha:'2026-10-15',descripcion:'Compra ficticia',tipo:'cargo',amount:'12000.00',category_id:7,notas:'Conservar',created_at:'original',updated_at:'original',...patch });
const plan = (patch={}) => planInitialReconciliation({movements:[movement('mov_a')],checking:[],otherExpenses:[],baselineCreatedAt:BASE,asOfDate:'2026-11-01',...patch});

describe('explicit initial reconciliation planner',()=>{
  test('missing confirmed initial observation can insert',()=>expect(plan()).toMatchObject({summary:{insert:1,link:0,hold:0},actions:[{externalId:'mov_a',decision:'insert',reason:null}]}));
  test('unique exact match links metadata and leaves every original field intact',()=>{const rows=[checking('local_a')], before=JSON.stringify(rows);expect(plan({checking:rows})).toMatchObject({summary:{insert:0,link:1},actions:[{decision:'link',checkingTransactionId:'local_a'}]});expect(JSON.stringify(rows)).toBe(before)});
  test('same type/amount within three days blocks insertion despite description differences',()=>expect(plan({checking:[checking('a',{fecha:'2026-10-18',descripcion:'Otra descripción'})]}).actions).toMatchObject([{decision:'hold',reason:'ambiguous_match',candidateCount:1}]));
  test('an exact match alongside another broad candidate remains ambiguous',()=>expect(plan({checking:[checking('a'),checking('b',{fecha:'2026-10-17',descripcion:'Otra'})]}).summary).toMatchObject({insert:0,link:0,hold:1}));
  test('two local exact candidates cannot be assigned arbitrarily',()=>expect(plan({checking:[checking('a'),checking('b')]}).actions).toMatchObject([{decision:'hold',candidateCount:2}]));
  test('two legitimate identical IDs without candidates preserve multiplicity',()=>expect(plan({movements:[movement('mov_a'),movement('mov_b')]}).summary).toEqual({insert:2,link:0,hold:0}));
  test('one existing local row and two identical bank IDs remain ambiguous',()=>expect(plan({movements:[movement('mov_a'),movement('mov_b')],checking:[checking('a')]}).summary).toEqual({insert:0,link:0,hold:2}));
  test('distinct full descriptions colliding after truncation cannot auto-link or insert',()=>{const prefix='a'.repeat(60);expect(plan({movements:[movement('mov_a',{descripcion:prefix+' alpha'}),movement('mov_b',{descripcion:prefix+' beta'})]}).summary).toEqual({insert:0,link:0,hold:2})});
  test('future bank dates remain held even when confirmed',()=>expect(plan({movements:[movement('mov_a',{fecha:'2026-11-02'})]}).actions).toMatchObject([{decision:'hold',reason:'future_date'}]));
  test.each(['2026-02-30','not-a-date'])('invalid date %s cannot import',fecha=>expect(plan({movements:[movement('mov_a',{fecha})]}).summary.insert).toBe(0));
  test.each(['0','-1','1.50','1000000000000'])('invalid/out-of-range amount %s cannot import',amount=>expect(plan({movements:[movement('mov_a',{amount})]}).summary.insert).toBe(0));
  test('maximum Checking CLP amount remains exact',()=>expect(plan({movements:[movement('mov_a',{amount:'999999999999'})]}).summary.insert).toBe(1));
  test.each([{status:'processing',pending:true},{status:'reversed'},{status:'manually_reversed'},{reason:'provider_changed'},{reason:'provider_missing'},{reason:'financial_record_removed'},{had_financial_reference:true},{checking_transaction_id:'previous'},{created_checking:true}])('unsafe initial observation stays held (%o)',patch=>expect(plan({movements:[movement('mov_a',patch)]}).summary.insert).toBe(0));
  test('post-baseline observations and already resolved references are outside the action set',()=>expect(plan({movements:[movement('mov_a',{first_seen_at:'2026-11-01 03:22:27.123457+00'}),movement('mov_b',{disposition:'inserted'})]})).toEqual({actions:[],summary:{insert:0,link:0,hold:0}}));
  test('metadata signatures block deleted reference reissues even after provider edits',()=>{const tomb=movement('mov_original',{disposition:'inserted',had_financial_reference:true,created_checking:true,amount:'13000',financial_snapshot:{date:'2026-10-15',description:'Compra ficticia',type:'cargo',amount:'12000'}});expect(plan({movements:[tomb,movement('mov_reissue')]}).actions).toMatchObject([{externalId:'mov_reissue',decision:'hold',reason:'ambiguous_match'}])});
  test('multiple matching signatures of one bank ID count as one candidate',()=>{const signature={date:'2026-10-15',description:'Compra ficticia',type:'cargo',amount:'12000'};const tomb=movement('mov_original',{disposition:'inserted',had_financial_reference:true,created_checking:true,financial_snapshot:signature,first_snapshot:signature});expect(plan({movements:[tomb,movement('mov_reissue')]}).actions).toMatchObject([{externalId:'mov_reissue',decision:'hold',candidateCount:1}])});
  test('sticky unlinked provider metadata also blocks an identical reissue',()=>expect(plan({movements:[movement('mov_old',{reason:'provider_missing'}),movement('mov_new')]}).actions.find(a=>a.externalId==='mov_new').decision).toBe('hold'));
  test('card candidate only blocks; it is never linked as Checking',()=>expect(plan({otherExpenses:[{source:'card',id:'card_a',date:'2026-10-17',description:'COMPRA   FICTICIA',amount:'12000.00',type:'cargo'}]}).actions).toMatchObject([{decision:'hold',reason:'ambiguous_match',checkingTransactionId:null}]));
  test('a bank credit is not confused with a card purchase',()=>expect(plan({movements:[movement('mov_a',{tipo:'abono'})],otherExpenses:[{source:'card',id:'card_a',date:'2026-10-15',description:'Compra ficticia',amount:'12000',type:'cargo'}]}).summary.insert).toBe(1));
  test('same-value card purchase with a different description is not treated as the bank payment',()=>expect(plan({movements:[movement('mov_a',{descripcion:'Pago tarjeta'})],otherExpenses:[{source:'card',id:'card_a',date:'2026-10-15',description:'Compra ficticia',amount:'12000',type:'cargo'}]}).summary.insert).toBe(1));
});

function setup(options={}){
  const state={user_id:OWNER,account_id:ACCOUNT,created_at:BASE,baseline_created_at:BASE,cutover_date:'2026-11-01',last_success_at:'2026-11-01T03:22:26Z',bank_updated_at:'2026-11-01T02:24:52Z',coverage_since:'2026-09-01',coverage_until:'2026-11-01',...options.state};
  let rows=(options.checking||[]).map(r=>({...r}));
  let observations=(options.movements||[movement('mov_a')]).map(r=>({...r}));
  const calls=[];
  const query=jest.fn(async(sql,params=[])=>{
    calls.push({sql,params});
    if(/FROM fintoc_sync_state/.test(sql))return{rows:options.noState?[]:[{...state}]};
    if(/FROM fintoc_external_movements/.test(sql))return{rows:observations.map(r=>({...r}))};
    if(/FROM checking_transactions/.test(sql))return{rows:rows.map(r=>({...r}))};
    if(/FROM transactions/.test(sql))return{rows:options.otherExpenses||[]};
    if(/INSERT INTO checking_transactions/.test(sql)){
      if(options.failInsert)throw new Error('PRIVATE amount description failure');
      const added=checking('new_'+(rows.length+1),{user_id:params[0],year:params[1],month:params[2],fecha:params[3],descripcion:params[4],tipo:params[5],amount:params[6],category_id:null,notas:null});rows.push(added);return{rows:[{id:added.id}]};
    }
    if(/UPDATE fintoc_external_movements/.test(sql)){
      if(options.failMapping)throw new Error('PRIVATE mapping failure');
      const row=observations.find(r=>r.external_id===params[2]);
      if(/checking_transaction_id=\$4/.test(sql)){Object.assign(row,{checking_transaction_id:params[3],disposition:params[4],had_financial_reference:true,created_checking:params[4]==='inserted',reason:null,financial_snapshot:JSON.parse(params[6])})}
      else if(row)Object.assign(row,{reason:params[3],candidate_count:params[4]});
      if(options.mutateOriginal&&rows[0])rows[0].notas='UNEXPECTED';
      return{rows:[],rowCount:1};
    }
    return{rows:[]};
  });
  const client={query,release:jest.fn()};
  const db={connect:jest.fn().mockResolvedValue(client)};
  const env={FINTOC_OWNER_USER_ID:OWNER,FINTOC_ACCOUNT_ID:ACCOUNT};
  let now='2026-11-01T16:00:00Z';
  const service=createFintocInitialReconciliationService({db,env,now:()=>new Date(now)});
  return{service,db,client,calls,env,state,observations,getRows:()=>rows,setNow:value=>{now=value}};
}

describe('initial reconciliation transaction and plan integrity',()=>{
 test('preview is deterministic and issues no INSERT/UPDATE/DELETE',async()=>{const s=setup();const a=await s.service.preview(OWNER),b=await s.service.preview(OWNER);expect(a).toEqual(b);expect(a.digest).toMatch(/^[a-f0-9]{64}$/);expect(s.calls.some(c=>/^(INSERT|UPDATE|DELETE)/.test(c.sql))).toBe(false);expect(s.calls.some(c=>c.sql.includes('pg_advisory_xact_lock'))).toBe(true)});
 test('wrong owner is forbidden before connecting',async()=>{const s=setup();await expect(s.service.preview('other')).rejects.toMatchObject({code:'FINTOC_RECONCILIATION_FORBIDDEN'});expect(s.db.connect).not.toHaveBeenCalled()});
 test('uninitialized account cannot reconcile',async()=>{const s=setup({noState:true});await expect(s.service.preview(OWNER)).rejects.toMatchObject({code:'FINTOC_RECONCILIATION_NOT_INITIALIZED'});expect(s.calls.some(c=>c.sql==='ROLLBACK')).toBe(true)});
 test('apply inserts with NULL category/notes, maps atomically and leaves state unchanged',async()=>{const s=setup();const plan=await s.service.preview(OWNER), before=JSON.stringify(s.state);const result=await s.service.apply(OWNER,{digest:plan.digest});expect(result).toMatchObject({status:'success',inserted:1,linked:0,held:0});expect(s.getRows()[0]).toMatchObject({category_id:null,notas:null,year:2026,month:10});expect(JSON.stringify(s.state)).toBe(before);expect(s.calls.some(c=>/UPDATE fintoc_sync_state/.test(c.sql))).toBe(false);expect(s.calls.some(c=>/FROM checking_transactions.*FOR UPDATE/s.test(c.sql))).toBe(true);expect(s.calls.some(c=>/INSERT INTO fintoc_sync_runs/.test(c.sql))).toBe(true)});
 test('exact matches write only integration metadata',async()=>{const s=setup({checking:[checking('original')]});const before=JSON.stringify(s.getRows());const p=await s.service.preview(OWNER);expect((await s.service.apply(OWNER,{digest:p.digest})).linked).toBe(1);expect(JSON.stringify(s.getRows())).toBe(before);expect(s.calls.some(c=>/INSERT INTO checking_transactions/.test(c.sql))).toBe(false)});
 test('notes/classification changes invalidate the reviewed plan',async()=>{const s=setup({checking:[checking('original',{amount:'15000'})]});const p=await s.service.preview(OWNER);s.getRows()[0].notas='Cambio humano';await expect(s.service.apply(OWNER,{digest:p.digest})).rejects.toMatchObject({code:'FINTOC_RECONCILIATION_STALE_PLAN'});expect(s.calls.some(c=>/INSERT INTO checking_transactions/.test(c.sql))).toBe(false)});
 test('raw SQL snapshot precision participates in digest',async()=>{const s=setup({checking:[checking('original',{amount:'15000',immutable_snapshot:'timestamp .123456'})]});const p=await s.service.preview(OWNER);s.getRows()[0].immutable_snapshot='timestamp .123457';await expect(s.service.apply(OWNER,{digest:p.digest})).rejects.toMatchObject({code:'FINTOC_RECONCILIATION_STALE_PLAN'})});
 test('next Santiago calendar day invalidates old future decisions',async()=>{const s=setup();const p=await s.service.preview(OWNER);s.setNow('2026-11-02T16:00:00Z');await expect(s.service.apply(OWNER,{digest:p.digest})).rejects.toMatchObject({code:'FINTOC_RECONCILIATION_STALE_PLAN'})});
 test('new snapshot data invalidates an old plan',async()=>{const s=setup();const p=await s.service.preview(OWNER);s.observations[0].descripcion='Banco corrige';await expect(s.service.apply(OWNER,{digest:p.digest})).rejects.toMatchObject({code:'FINTOC_RECONCILIATION_STALE_PLAN'})});
 test.each([undefined,'bad','a'.repeat(63)])('invalid digest %s is rejected without connection',async digest=>{const s=setup();await expect(s.service.apply(OWNER,{digest})).rejects.toMatchObject({code:'FINTOC_RECONCILIATION_INVALID_PLAN'});expect(s.db.connect).not.toHaveBeenCalled()});
 test('failure after financial INSERT rolls back the transaction',async()=>{const s=setup({failMapping:true});const p=await s.service.preview(OWNER);await expect(s.service.apply(OWNER,{digest:p.digest})).rejects.toMatchObject({code:'FINTOC_RECONCILIATION_STORAGE_ERROR'});expect(s.calls.some(c=>c.sql==='ROLLBACK')).toBe(true);expect(s.calls.filter(c=>c.sql==='COMMIT')).toHaveLength(1);expect(s.client.release).toHaveBeenCalledTimes(2)});
 test('unexpected mutation of an original checking field aborts before commit',async()=>{const s=setup({checking:[checking('original',{amount:'15000'})],mutateOriginal:true});const p=await s.service.preview(OWNER);await expect(s.service.apply(OWNER,{digest:p.digest})).rejects.toMatchObject({code:'FINTOC_RECONCILIATION_INTEGRITY'});expect(s.calls.some(c=>c.sql==='ROLLBACK')).toBe(true)});
 test('second preview has no new insertion and old apply is stale',async()=>{const s=setup();const p=await s.service.preview(OWNER);await s.service.apply(OWNER,{digest:p.digest});expect((await s.service.preview(OWNER)).summary.insert).toBe(0);await expect(s.service.apply(OWNER,{digest:p.digest})).rejects.toMatchObject({code:'FINTOC_RECONCILIATION_STALE_PLAN'})});
 test('hold reasons update integration only, preserving freshness',async()=>{const s=setup({movements:[movement('mov_future',{fecha:'2026-11-02'})]});const p=await s.service.preview(OWNER);expect(p.summary).toEqual({insert:0,link:0,hold:1});await s.service.apply(OWNER,{digest:p.digest});expect(s.observations[0].reason).toBe('future_date');expect(s.calls.some(c=>/UPDATE checking_transactions|UPDATE fintoc_sync_state/.test(c.sql))).toBe(false)});
 test('plan hashes do not depend on database row ordering',async()=>{const s=setup({movements:[movement('mov_b'),movement('mov_a')]});const p=await s.service.preview(OWNER);s.observations.reverse();expect((await s.service.preview(OWNER)).digest).toBe(p.digest)});
});
