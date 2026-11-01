const {randomUUID}=require('crypto');
const {CardStatementError,error}=require('./errors');
const {planSettlement,analyzeStatement}=require('./settlement');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function santiagoDay(now){const values=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).reduce((v,p)=>(v[p.type]=p.value,v),{});return values.year+'-'+values.month+'-'+values.day;}
function createSettlementService({pool,load,owner,now=()=>new Date()}){
 function identify(actor,id){const userId=owner(actor);if(!UUID.test(String(id)))throw error(400,'INVALID_ID');return userId;}
 async function transaction(readOnly,task){let client;try{client=await pool.connect();await client.query(readOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');await client.query("SET LOCAL statement_timeout='15s'");if(!readOnly)await client.query("SET LOCAL lock_timeout='3s'");const value=await task(client);await client.query('COMMIT');return value;}catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});if(e instanceof CardStatementError)throw e;if(['55P03','40P01','57014'].includes(e.code))throw error(409,'SETTLEMENT_BUSY','La conciliación está ocupada; vuelve a intentarlo.');throw error(500,'STORAGE_ERROR');}finally{if(client)client.release();}}
 const plan=state=>planSettlement({...state,asOfDate:santiagoDay(now())});
 async function preview(actor,id){const userId=identify(actor,id);return transaction(true,async client=>plan(await load(client,userId,id)));}
 async function apply(actor,id,input){
  const userId=identify(actor,id);if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>k!=='digest')||typeof input.digest!=='string'||!/^[a-f0-9]{64}$/.test(input.digest))throw error(400,'INVALID_DIGEST');
  return transaction(false,async client=>{
   await client.query("SELECT pg_advisory_xact_lock(hashtext('card-statements'),hashtext($1))",[userId]);
   // Includes legacy writers: their earlier SELECT locks are retained until COMMIT.
   // Extraction takes place before this short transaction, never while locked.
   await client.query('LOCK TABLE imports,transactions,intl_unbilled,installment_plans,installment_occurrences IN ACCESS EXCLUSIVE MODE');
   const state=await load(client,userId,id),current=plan(state);if(current.digest!==input.digest)throw error(409,'STALE_SETTLEMENT','El historial cambió; revisa una nueva conciliación.');
   // Only this reviewed, locked transaction may insert distinct bank occurrences.
   // LOCAL guarantees that both COMMIT and ROLLBACK clear the trigger context.
   await client.query("SET LOCAL app.card_statement_apply='true'");
   let inserted=0,linked=0,importId=null;
   for(const action of current.actions){
    if(!['link','insert'].includes(action.decision))continue;
    const item=state.document.sections[action.sectionIndex].items[action.ordinal];let sourceId=action.sourceId,sourceType=action.sourceType,source;
    const year=Number(state.document.dueDate.slice(0,4)),month=Number(state.document.dueDate.slice(5,7));
    if(action.decision==='insert'){
     sourceId=randomUUID();
     if(item.currency==='CLP'){
      sourceType='transaction';
      if(!importId){importId=randomUUID();await client.query(`INSERT INTO imports(id,user_id,provider,network,product_type,original_filename,period_year,period_month) VALUES($1,$2,'banco_chile',$3,'card_statement','card-statement.pdf',$4,$5)`,[importId,userId,state.document.network,year,month]);}
      const metadata={source:'card_statement',statement_fingerprint:action.fingerprint,banco:'banco_chile',tipo_tarjeta:state.document.network,tarjeta_ultimos_4:item.cardLastFour,statement_kind:item.kind};
      await client.query(`INSERT INTO transactions(id,user_id,fecha,descripcion,monto,tipo,category_id,notas,categoria,cuotas,import_id,billing_year,billing_month,metadata,created_by) VALUES($1,$2,$3,$4,$5,'gasto',NULL,NULL,'Sin categorizar',1,$6,$7,$8,$9::jsonb,$2) RETURNING id::text`,[sourceId,userId,item.date,item.description,item.amount,importId,year,month,JSON.stringify(metadata)]);
     }else{
      sourceType='international';
      await client.query(`INSERT INTO intl_unbilled(id,user_id,brand,fecha,original_fecha,descripcion,amount_usd,exchange_rate,amount_clp,tipo,category_id,period_year,period_month) VALUES($1,$2,$3,$4,$4,$5,$6,NULL,NULL,'gasto',NULL,$7,$8) RETURNING id::text`,[sourceId,userId,state.document.network,item.date,item.description,item.amount,year,month]);
     }
     source={sourceType,id:sourceId,date:item.date,amount:item.amount,currency:item.currency,type:'gasto',billingYear:year,billingMonth:month};inserted++;
    }else source=state.sources.find(s=>s.sourceType===sourceType&&String(s.id)===String(sourceId));
    const bank={network:state.document.network,mainCardLastFour:state.document.mainCardLastFour,cardLastFour:item.cardLastFour,currency:item.currency,date:item.date,description:item.description,amount:item.amount,kind:item.kind,reference:item.reference,installmentNumber:item.installmentNumber,installmentTotal:item.installmentTotal};
    const financial={sourceType,id:String(sourceId),date:source.date,amount:source.amount,currency:source.currency,type:source.type,billingYear:source.billingYear,billingMonth:source.billingMonth};
    const saved=await client.query(`INSERT INTO card_statement_actions(user_id,run_id,section_index,ordinal,row_key,fingerprint,decision,source_type,source_id,bank_snapshot,financial_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb) ON CONFLICT(user_id,fingerprint) DO NOTHING`,[userId,id,action.sectionIndex,action.ordinal,action.rowKey,action.fingerprint,action.decision,sourceType,sourceId,JSON.stringify(bank),JSON.stringify(financial)]);
    if(action.decision==='link'&&saved.rowCount>0)linked++;
   }
   const after=await load(client,userId,id),result=analyzeStatement(after.document,after.sources,{revisionConflict:after.revisionConflict});
   return{id,inserted,linked,held:current.summary.hold,informational:current.summary.informational,sections:result.sections.map(({scope,currency,reconciliation})=>({scope,currency,reconciliation}))};
  });
 }
 return{preview,apply};
}
module.exports={createSettlementService};
