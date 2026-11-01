const crypto=require('crypto');
const path=require('path');
const {CardStatementError,error}=require('./errors');
const {normalizeDescription}=require('./matcher');
const {analyzeStatement}=require('./settlement');
const {createSettlementService}=require('./settlementService');
const SENDER='enviodigital@bancochile.cl',SUBJECT='Estado de Cuenta Tarjeta de Crédito';
const KINDS=new Set(['purchase','installment','payment','fee','debt_transfer','other_credit']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function redactPan(value){
 if(typeof value!=='string')return value;
 // Try bounded shapes independently: a valid 16-digit PAN followed by a short
 // reference must not disappear inside an invalid, greedily captured 18/19 span.
 const shapes=['\\d{19}','\\d{16}','\\d{13}',
  '\\d{4}[\\s-]+\\d{4}[\\s-]+\\d{4}[\\s-]+\\d{4}[\\s-]+\\d{3}',
  '\\d{4}[\\s-]+\\d{4}[\\s-]+\\d{4}[\\s-]+\\d{4}',
  '\\d{4}[\\s-]+\\d{4}[\\s-]+\\d{4}[\\s-]+\\d'];
 const spans=[];
 for(const shape of shapes){
  const pattern=new RegExp('(?<!\\d)'+shape+'(?!\\d)','g');let match;
  while((match=pattern.exec(value))!==null){
   const digits=match[0].replace(/[^0-9]/g,'');
   const visa=digits.startsWith('4')&&[13,16,19].includes(digits.length);
   const mastercard=digits.length===16&&((Number(digits.slice(0,2))>=51&&Number(digits.slice(0,2))<=55)||(Number(digits.slice(0,4))>=2221&&Number(digits.slice(0,4))<=2720));
   if(!visa&&!mastercard)continue;
   let sum=0,double=false;for(let index=digits.length-1;index>=0;index--){let number=Number(digits[index]);if(double){number*=2;if(number>9)number-=9;}sum+=number;double=!double;}
   if(sum%10===0)spans.push({start:match.index,end:match.index+match[0].length,lastFour:digits.slice(-4)});
  }
 }
 spans.sort((left,right)=>left.start-right.start||right.end-left.end);
 let cursor=0,result='';for(const span of spans){if(span.start<cursor)continue;result+=value.slice(cursor,span.start)+'[tarjeta-'+span.lastFour+']';cursor=span.end;}
 return result+value.slice(cursor);
}
const cleanText=(value,max=2000)=>typeof value==='string'&&value.trim()&&value.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)?value.trim():null;
const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value?value:null;
const lastFour=value=>typeof value==='string'&&/^\d{4}$/.test(value)?value:null;
const amount=(value,currency)=>typeof value==='string'&&(currency==='CLP'?/^-?(0|[1-9]\d*)$/:/^-?(0|[1-9]\d*)\.\d{2}$/).test(value)&&value.replace(/[-.]/g,'').length<=20;
const validation=value=>({valid:value?.valid===true,issues:Array.isArray(value?.issues)?value.issues.filter(code=>typeof code==='string'&&/^[A-Z][A-Z0-9_]{1,100}$/.test(code)):[]});
function cleanDocument(raw){
  if(raw?.version!==1||!Array.isArray(raw.sections)||raw.sections.length>4)throw error(422,'INVALID_DOCUMENT');
  const root={version:1,network:['visa','mastercard'].includes(raw.network)?raw.network:null,mainCardLastFour:lastFour(raw.mainCardLastFour),statementDate:day(raw.statementDate),period:{since:day(raw.period?.since),until:day(raw.period?.until)},dueDate:day(raw.dueDate),validation:validation(raw.validation),sections:[]};
  let count=0;
  for(const section of raw.sections){
    if(!['national','international'].includes(section.scope)||section.currency!==(section.scope==='national'?'CLP':'USD')||!Array.isArray(section.items)||section.items.length>2000)throw error(422,'INVALID_DOCUMENT');
    const currency=section.currency,totals={};
    const keys=currency==='CLP'?['previousBilled','payments','automaticPayments','purchases','installments','voluntaryServices','charges','billedTotal']:['previousBilled','payments','purchases','charges','debtTotal','credited','transferToNational'];
    for(const key of keys){const value=section.totals?.[key];if(value!==null&&value!==undefined&&!amount(value,currency))throw error(422,'INVALID_DOCUMENT');totals[key]=value===undefined?null:value;}
    const items=section.items.map(item=>{
      if(!cleanText(item.rowKey,200)||!Number.isInteger(item.page)||item.page<1||item.page>100||!day(item.date)||!cleanText(item.description)||!KINDS.has(item.kind)||item.currency!==currency||!amount(item.amount,currency)||!amount(item.operationAmount,currency))throw error(422,'INVALID_DOCUMENT');
      count++;
      return{rowKey:item.rowKey,page:item.page,date:item.date,description:redactPan(item.description.trim()),reference:redactPan(cleanText(item.reference,200)),cardLastFour:lastFour(item.cardLastFour),kind:item.kind,currency,amount:item.amount,operationAmount:item.operationAmount,
        installmentNumber:Number.isInteger(item.installmentNumber)&&item.installmentNumber>0&&item.installmentNumber<=120?item.installmentNumber:null,
        installmentTotal:Number.isInteger(item.installmentTotal)&&item.installmentTotal>0&&item.installmentTotal<=120?item.installmentTotal:null};
    });
    if(new Set(items.map(item=>item.rowKey)).size!==items.length)throw error(422,'INVALID_DOCUMENT');
    root.sections.push({scope:section.scope,currency,totals,validation:validation(section.validation),items});
  }
  if(count>3000)throw error(422,'INVALID_DOCUMENT');
  if(!root.network||!root.mainCardLastFour||!root.statementDate||!root.period.since||!root.period.until||!root.dueDate||root.period.since>root.period.until||!root.sections.length){root.validation.valid=false;root.validation.issues.push('HEADER_INCOMPLETE');}
  if(root.sections.some(section=>!section.validation.valid))root.validation.valid=false;
  return root;
}
function invalidDocument(code){return{version:1,network:null,mainCardLastFour:null,statementDate:null,period:{since:null,until:null},dueDate:null,sections:[],validation:{valid:false,issues:[/^(?:CARD_)?STATEMENT_[A-Z0-9_]{1,64}$/.test(code)?code:'STATEMENT_EXTRACTION_FAILED']}};}
function validEnvelope(input){
  const from=cleanText(input?.from,500),sender=from?.match(/^(?:[^<>]*<)?([^<>\s]+@[^<>\s]+)>?$/)?.[1]?.toLowerCase();
  if(sender!==SENDER||typeof input.subject!=='string'||input.subject.normalize('NFC').trim()!==SUBJECT)throw error(400,'INVALID_ENVELOPE');
  for(const key of ['messageId','attachmentId'])if(!cleanText(input[key],4096)||/[\r\n]/.test(input[key]))throw error(400,'INVALID_ENVELOPE');
  if(!Buffer.isBuffer(input.buffer)||input.buffer.length<5||input.buffer.length>5*1024*1024||input.buffer.subarray(0,5).toString('ascii')!=='%PDF-')throw error(400,'INVALID_PDF');
  const filename=path.basename(redactPan(cleanText(input.filename,255)||'statement.pdf'));if(!/\.pdf$/i.test(filename))throw error(400,'INVALID_PDF');
  return{...input,filename};
}
const RUN_SELECT=`SELECT r.*,EXISTS(SELECT 1 FROM card_statement_runs other WHERE other.user_id=r.user_id AND other.provider=r.provider AND other.id<>r.id AND other.network=r.network AND other.main_card_last_four=r.main_card_last_four AND other.period_since=r.period_since AND other.period_until=r.period_until) AS revision_conflict FROM card_statement_runs r WHERE r.user_id=$1`;
function createCardStatementService({db,extractor,env=process.env,now=()=>new Date()}){
 const pool=db.pool||db;
 const configuredOwner=()=>env.CARD_STATEMENTS_OWNER_USER_ID||env.FINTOC_OWNER_USER_ID;
 function owner(actor){const id=configuredOwner();if(!id||actor!==id)throw error(403,'FORBIDDEN');return id;}
 function storage(failure){if(failure instanceof CardStatementError)throw failure;throw error(500,'STORAGE_ERROR');}
 async function evidence(userId,executor=pool){const rows=(await executor.query('SELECT a.*,a.created_at::text AS created_at FROM card_statement_actions a WHERE a.user_id=$1 ORDER BY a.fingerprint',[userId])).rows;return rows.map(row=>({...row,bank_snapshot:typeof row.bank_snapshot==='string'?JSON.parse(row.bank_snapshot):row.bank_snapshot,financial_snapshot:typeof row.financial_snapshot==='string'?JSON.parse(row.financial_snapshot):row.financial_snapshot}));}
 async function sources(userId,executor=pool,evidenceRows){
  const [national,international,installments]=await Promise.all([
   executor.query(`SELECT t.id::text,t.fecha::text AS date,t.descripcion AS description,t.monto::text AS amount,t.tipo AS type,t.billing_year,t.billing_month,row_to_json(t)::text AS immutable_snapshot,
    COALESCE(i.network,t.metadata->>'tipo_tarjeta',t.metadata->>'network') AS network,
    COALESCE(t.metadata->>'tarjeta_ultimos_4',t.metadata->>'card_last_four') AS card_last_four,
    i.network AS import_network,COALESCE(t.metadata->>'tipo_tarjeta',t.metadata->>'network') AS metadata_network,i.provider,t.metadata->>'banco' AS source_bank FROM transactions t LEFT JOIN imports i ON i.id=t.import_id AND i.user_id=t.user_id WHERE t.user_id=$1`,[userId]),
   executor.query(`SELECT id::text,COALESCE(original_fecha,fecha)::text AS date,descripcion AS description,amount_usd::text AS amount,tipo AS type,brand AS network,period_year AS billing_year,period_month AS billing_month,row_to_json(intl_unbilled)::text AS immutable_snapshot FROM intl_unbilled WHERE user_id=$1`,[userId]),
   executor.query(`SELECT o.id::text,p.descripcion AS description,o.amount::text AS amount,p.brand AS network,o.year AS billing_year,o.month AS billing_month,o.installment_number,(o.active AND p.active) AS active,row_to_json(o)::text AS immutable_snapshot,row_to_json(p)::text AS plan_immutable_snapshot FROM installment_occurrences o JOIN installment_plans p ON p.id=o.plan_id AND p.user_id=o.user_id WHERE o.user_id=$1`,[userId])]);
  const network=value=>['visa','mastercard'].includes(String(value||'').toLowerCase())?String(value).toLowerCase():null;
  const common=row=>({id:String(row.id),date:row.date||null,description:row.description,amount:String(row.amount),type:row.type||'gasto',network:network(row.network),cardLastFour:lastFour(row.card_last_four),billingYear:row.billing_year,billingMonth:row.billing_month,immutableSnapshot:row.immutable_snapshot,planImmutableSnapshot:row.plan_immutable_snapshot,identityConflict:Boolean(network(row.import_network)&&network(row.metadata_network)&&network(row.import_network)!==network(row.metadata_network))});
  const origins=row=>[row.provider,row.source_bank].map(value=>normalizeDescription(value||'')).filter(Boolean);
  const chile=value=>['banco chile','banco de chile','bancochile','chile'].includes(value);
  const records=national.rows.filter(row=>origins(row).every(chile)).map(row=>({...common(row),sourceType:'transaction',currency:'CLP',providerKnown:origins(row).length>0}))
   .concat(international.rows.map(row=>({...common(row),sourceType:'international',currency:'USD'})))
   .concat(installments.rows.map(row=>({...common(row),sourceType:'installment',currency:'CLP',installmentNumber:row.installment_number,type:row.active===false?'desestimar':'gasto'})));
  const actions=evidenceRows||await evidence(userId,executor);
  return records.map(source=>{const action=actions.find(a=>a.source_type===source.sourceType&&String(a.source_id)===source.id);if(!action)return source;const bank=action.bank_snapshot||{};return{...source,network:source.network||network(bank.network),cardLastFour:source.cardLastFour||lastFour(bank.cardLastFour),...(action.decision==='insert'&&source.providerKnown===false?{providerKnown:true}:{})};});
 }
 async function documentFor(row,executor=pool){
  const header=typeof row.document_header==='string'?JSON.parse(row.document_header):row.document_header;
  const payload={...header,sections:header.sections.map(section=>({...section,items:[]}))};
  const stored=(await executor.query('SELECT section_index,ordinal,item FROM card_statement_items WHERE run_id=$1 ORDER BY section_index,ordinal',[row.id])).rows;
  for(const item of stored)if(payload.sections[item.section_index])payload.sections[item.section_index].items.push(typeof item.item==='string'?JSON.parse(item.item):item.item);
  return payload;
 }
 async function loadSettlement(executor,userId,id){
  const row=(await executor.query(RUN_SELECT+' AND r.id=$2',[userId,id])).rows[0];if(!row)throw error(404,'NOT_FOUND');
  const actions=await evidence(userId,executor);const document=await documentFor(row,executor);const sourceRows=await sources(userId,executor,actions);const cards=(await executor.query('SELECT last_four,network,is_active FROM credit_cards WHERE user_id=$1 ORDER BY last_four',[userId])).rows;
  return{runId:String(row.id),document,sources:sourceRows,evidence:actions,cards,revisionConflict:row.revision_conflict===true};
 }
 async function materialize(row,withItems=true,sourceRows){
  const payload=await documentFor(row);
  const result=analyzeStatement(payload,sourceRows||await sources(row.user_id),{revisionConflict:row.revision_conflict===true});
  return{id:String(row.id),network:result.network,statementDate:result.statementDate,period:result.period,dueDate:result.dueDate,validation:result.validation,status:result.status,revisionConflict:result.revisionConflict,
   sections:result.sections.map(section=>({scope:section.scope,currency:section.currency,totals:section.totals,validation:section.validation,counts:section.counts,reconciliation:section.reconciliation,...(withItems?{items:section.items,extras:section.extras}:{})}))};
 }
 async function detail(actor,id){const userId=owner(actor);if(!UUID.test(String(id)))throw error(400,'INVALID_ID');try{const row=(await pool.query(RUN_SELECT+' AND r.id=$2',[userId,id])).rows[0];if(!row)throw error(404,'NOT_FOUND');return await materialize(row);}catch(e){return storage(e)}}
 async function list(actor,input={}){const userId=owner(actor);if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['year','month'].includes(key))||typeof input.year!=='string'||!/^\d{4}$/.test(input.year)||Number(input.year)<2000||Number(input.year)>2100||typeof input.month!=='string'||!/^([1-9]|1[0-2])$/.test(input.month))throw error(400,'INVALID_QUERY');
  try{const rows=(await pool.query(RUN_SELECT+` AND ((EXTRACT(YEAR FROM r.due_date)=$2 AND EXTRACT(MONTH FROM r.due_date)=$3) OR (r.due_date IS NULL AND EXTRACT(YEAR FROM r.created_at AT TIME ZONE 'America/Santiago')=$2 AND EXTRACT(MONTH FROM r.created_at AT TIME ZONE 'America/Santiago')=$3)) ORDER BY r.created_at DESC LIMIT 100`,[userId,Number(input.year),Number(input.month)])).rows;const sourceRows=rows.length?await sources(userId):[];return{items:await Promise.all(rows.map(row=>materialize(row,false,sourceRows)))}}catch(e){return storage(e)}
 }
 async function ingest(rawInput){const input=validEnvelope(rawInput),userId=owner(configuredOwner()),fileHash=crypto.createHash('sha256').update(input.buffer).digest('hex');
  try{
   const existing=(await pool.query('SELECT * FROM card_statement_runs WHERE user_id=$1 AND file_sha256=$2',[userId,fileHash])).rows[0];
   let document;
   if(existing?.document_header?.validation?.valid===true)document=null;
   else{try{document=cleanDocument(await extractor({buffer:input.buffer,filename:input.filename}));}catch(e){document=invalidDocument(e.code||'STATEMENT_EXTRACTION_FAILED');}}
   const client=await pool.connect();let resultId,duplicate=false;
   try{await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtext('card-statements'),hashtext($1))",[userId]);
    const source=(await client.query('SELECT s.run_id,r.file_sha256 FROM card_statement_sources s JOIN card_statement_runs r ON r.id=s.run_id WHERE s.user_id=$1 AND s.message_id=$2 AND s.attachment_id=$3',[userId,input.messageId,input.attachmentId])).rows[0];
    if(source&&source.file_sha256!==fileHash)throw error(409,'SOURCE_CONFLICT');
    const current=(await client.query('SELECT * FROM card_statement_runs WHERE user_id=$1 AND file_sha256=$2',[userId,fileHash])).rows[0];
    duplicate=Boolean(current);
    const replaceExisting=Boolean(current&&document&&current.document_header?.validation?.valid!==true);
    if(current&&!replaceExisting){resultId=current.id;}
    else{
     if(!document)throw error(500,'STORAGE_ERROR');
     if(document.mainCardLastFour){const cards=(await client.query('SELECT last_four,network,is_active FROM credit_cards WHERE user_id=$1 AND last_four=$2',[userId,document.mainCardLastFour])).rows;const card=cards.find(row=>String(row.last_four).trim()===document.mainCardLastFour&&row.is_active!==false);
      if(!card||card.network!==document.network){document.validation.valid=false;document.validation.issues.push(card?'CARD_NETWORK_CONFLICT':'CARD_UNREGISTERED');}}
     const header={...document,sections:document.sections.map(({items,...section})=>section)};
     const values=[userId,fileHash,document.network,document.mainCardLastFour,document.statementDate,document.period.since,document.period.until,document.dueDate,JSON.stringify(header)];
     const row=replaceExisting?(await client.query(`UPDATE card_statement_runs SET network=$3,main_card_last_four=$4,statement_date=$5,period_since=$6,period_until=$7,due_date=$8,document_header=$9::jsonb,updated_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND file_sha256=$2 AND id=$10 RETURNING *`,[...values,current.id])).rows[0]
       :(await client.query(`INSERT INTO card_statement_runs (user_id,file_sha256,network,main_card_last_four,statement_date,period_since,period_until,due_date,document_header) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING *`,values)).rows[0];resultId=row.id;
     if(replaceExisting)await client.query('DELETE FROM card_statement_items WHERE run_id=$1',[resultId]);
     for(let section=0;section<document.sections.length;section++)for(let ordinal=0;ordinal<document.sections[section].items.length;ordinal++){const item=document.sections[section].items[ordinal];await client.query('INSERT INTO card_statement_items(run_id,section_index,ordinal,row_key,item) VALUES($1,$2,$3,$4,$5::jsonb)',[resultId,section,ordinal,item.rowKey,JSON.stringify(item)]);}
    }
    await client.query('INSERT INTO card_statement_sources(user_id,message_id,attachment_id,run_id,filename) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,message_id,attachment_id) DO NOTHING',[userId,input.messageId,input.attachmentId,resultId,input.filename]);
    await client.query('COMMIT');
   }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
   let applied;
   if(env.CARD_STATEMENTS_AUTO_POST==='true'){const preview=await settlement.preview(userId,resultId);applied=await settlement.apply(userId,resultId,{digest:preview.digest});}
   const result=await detail(userId,resultId);return{...result,sections:result.sections.map(({scope,currency,validation,counts})=>({scope,currency,validation,counts})),duplicate,...(applied?{settlement:{inserted:applied.inserted,linked:applied.linked,held:applied.held}}:{})};
  }catch(e){return storage(e)}
 }
 const settlement=createSettlementService({pool,load:loadSettlement,owner,now});
 return{ingest,list,detail,previewSettlement:settlement.preview,applySettlement:settlement.apply};
}
let defaultService;
function getDefault(){if(!defaultService){const {createPdfExtractor}=require('./pdfExtractor');defaultService=createCardStatementService({db:require('../../config/database'),extractor:createPdfExtractor(),env:process.env})}return defaultService;}
module.exports={createCardStatementService,cleanDocument,validEnvelope,ingest:input=>getDefault().ingest(input),list:(actor,input)=>getDefault().list(actor,input),detail:(actor,id)=>getDefault().detail(actor,id),previewSettlement:(actor,id)=>getDefault().previewSettlement(actor,id),applySettlement:(actor,id,input)=>getDefault().applySettlement(actor,id,input)};
