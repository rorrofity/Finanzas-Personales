/** Read-only bridge: late purchase notifications must respect bank-statement evidence. */
const {normalizeDescription,amountsEqual}=require('./cardStatements/matcher');
const none=()=>({decision:'none',reason:'no_statement_candidate'});
const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const merchant=value=>normalizeDescription(value).replace(/\b(?:compra|compras|pago|con|tarjeta|credito|debito)\b/g,' ').replace(/\s+/g,' ').trim();
const compatible=(a,b)=>{a=merchant(a);b=merchant(b);return Boolean(a&&b&&(a===b||(Math.min(a.length,b.length)>=6&&(a.includes(b)||b.includes(a)))))};
async function lockStatementEmailBatch(db,userId,{env=process.env}={}){
 if(env.CARD_STATEMENTS_AUTO_POST!=='true'||userId!==(env.CARD_STATEMENTS_OWNER_USER_ID||env.FINTOC_OWNER_USER_ID))return;
 await db.query('LOCK TABLE imports, transactions, intl_unbilled, installment_plans, installment_occurrences IN ACCESS SHARE MODE');
}
async function checkStatementEmail(db,userId,txn,{env=process.env}={}){
 if(env.CARD_STATEMENTS_AUTO_POST!=='true'||userId!==(env.CARD_STATEMENTS_OWNER_USER_ID||env.FINTOC_OWNER_USER_ID))return none();
 const currency=txn?.is_international===true?'USD':'CLP',date=txn?.fecha,amount=currency==='USD'?txn?.amount_usd:txn?.monto;
 if(!validDay(date)||!merchant(txn?.descripcion)||!amountsEqual(amount,amount)||(txn.tipo&&txn.tipo!=='gasto'))return none();
 const bank=normalizeDescription(txn.banco||'');const knownBank=['banco chile','banco de chile','bancochile','chile'].includes(bank);
 if(bank&&!knownBank&&!['desconocido','unknown','email'].includes(bank))return none();
 const network=['visa','mastercard'].includes(String(txn.tipo_tarjeta||txn.brand||'').toLowerCase())?String(txn.tipo_tarjeta||txn.brand).toLowerCase():null;
 const lastFour=typeof txn.tarjeta_ultimos_4==='string'&&/^\d{4}$/.test(txn.tarjeta_ultimos_4)?txn.tarjeta_ultimos_4:null;
 // Same lock order as statement application. ACCESS SHARE waits for an active
 // settlement, and remains until the legacy writer commits its dedup/INSERT.
 await lockStatementEmailBatch(db,userId,{env});
 const {rows}=await db.query(`SELECT a.bank_snapshot,
 CASE a.source_type WHEN 'transaction' THEN EXISTS(SELECT 1 FROM transactions t WHERE t.id=a.source_id AND t.user_id=a.user_id)
 WHEN 'international' THEN EXISTS(SELECT 1 FROM intl_unbilled i WHERE i.id=a.source_id AND i.user_id=a.user_id)
 WHEN 'installment' THEN EXISTS(SELECT 1 FROM installment_occurrences o WHERE o.id=a.source_id AND o.user_id=a.user_id) ELSE false END AS source_exists
 FROM card_statement_actions a WHERE a.user_id=$1 AND a.bank_snapshot->>'currency'=$2
 AND (a.bank_snapshot->>'date')::date BETWEEN $3::date-INTERVAL '3 days' AND $3::date+INTERVAL '3 days'`,[userId,currency,date]);
 const candidates=rows.map(row=>({...row,bank:typeof row.bank_snapshot==='string'?JSON.parse(row.bank_snapshot):row.bank_snapshot})).filter(row=>{
  const item=row.bank;if(!item||!validDay(item.date)||item.currency!==currency||['payment','debt_transfer','other_credit'].includes(item.kind))return false;
  if(network&&item.network&&network!==item.network)return false;
  if(lastFour&&item.cardLastFour&&lastFour!==item.cardLastFour)return false;
  return Math.abs(Date.parse(date+'T00:00:00Z')-Date.parse(item.date+'T00:00:00Z'))<=3*86400000&&compatible(txn.descripcion,item.description)
    &&(amountsEqual(amount,item.amount)||date===item.date);
 });
 if(!candidates.length)return none();
 if(candidates.length!==1)return{decision:'review',reason:'multiple_statement_candidates'};
 const record=candidates[0],item=record.bank;
 if(record.source_exists!==true)return{decision:'review',reason:'statement_charge_removed'};
 if(!knownBank||!network||!item.network||!lastFour||!item.cardLastFour||item.kind==='installment'||date!==item.date||!amountsEqual(amount,item.amount))return{decision:'review',reason:'statement_charge_uncertain'};
 return{decision:'duplicate',reason:'statement_charge_present'};
}
module.exports={checkStatementEmail,lockStatementEmailBatch};
