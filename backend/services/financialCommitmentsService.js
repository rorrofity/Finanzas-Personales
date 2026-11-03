const { listEffectiveProjections } = require('./effectiveProjectionsService');
const iso = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null;

function minor(value) {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) throw new Error('FINANCIAL_AMOUNT_INVALID');
  return (match[1] ? -1n : 1n) * (BigInt(match[2])*100n + BigInt((match[3]||'').padEnd(2,'0')));
}
function money(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('FINANCIAL_AMOUNT_OUT_OF_RANGE');
  return number/100;
}
const known = brand => brand==='visa'||brand==='mastercard';
const emptyCards = () => ({ visa:{unbilled:0n,payments:0n,installments:0n,international:0n},mastercard:{unbilled:0n,payments:0n,installments:0n,international:0n} });
const freshSource = (asOf=null) => ({state:'available',freshness:'current',asOf:iso(asOf),errorCode:null});
const later = (value,previous) => Boolean(iso(value)) && (!iso(previous) || iso(value)>iso(previous));

/** The caller can isolate each source in a read-only transaction savepoint. */
async function readFinancialCommitments(userId,year,month,{query,readSource}={}) {
  const read=query||require('../config/database').query;
  const capture=readSource||(async(name,fn)=>({ok:true,value:await fn()}));
  const sources={},partialReasons=[],cards=emptyCards();
  let conversionPendingCount=0,unknownNetworkCount=0;
  const readGroup=async(name,fn)=>{
    const result=await capture(name,fn);
    if(!result.ok){sources[name]={state:'error',freshness:'unknown',asOf:null,errorCode:`${name.toUpperCase()}_UNAVAILABLE`};partialReasons.push(`${name.toUpperCase()}_UNAVAILABLE`);return null;}
    sources[name]=freshSource(result.value.asOf);return result.value;
  };
  const national=await readGroup('national',async()=>{
    const result=await read(`SELECT LOWER(COALESCE(i.network,'unknown')) AS network,t.tipo,
      SUM(ABS(t.monto))::text AS total,COUNT(*)::int AS count,MAX(t.updated_at) AS last_changed_at
      FROM transactions t LEFT JOIN imports i ON t.import_id=i.id
      WHERE t.user_id=$1 AND COALESCE(t.billing_year,EXTRACT(YEAR FROM t.fecha))=$2
        AND COALESCE(t.billing_month,EXTRACT(MONTH FROM t.fecha))=$3 AND t.tipo IN ('gasto','pago')
      GROUP BY LOWER(COALESCE(i.network,'unknown')),t.tipo`,[userId,year,month]);
    const values=emptyCards();let unknown=0,last=null;
    for(const row of result.rows){if(!known(row.network)){unknown+=Number(row.count||1);continue;}const field=row.tipo==='pago'?'payments':'unbilled';values[row.network][field]+=minor(row.total);if(later(row.last_changed_at,last))last=row.last_changed_at;}
    return {values,unknown,asOf:last};
  });
  if(national){unknownNetworkCount=national.unknown;for(const brand of ['visa','mastercard'])Object.assign(cards[brand],{unbilled:national.values[brand].unbilled,payments:national.values[brand].payments});if(unknownNetworkCount){partialReasons.push('UNKNOWN_CARD_NETWORK');sources.national.freshness='unknown';sources.national.errorCode='UNKNOWN_CARD_NETWORK';}}
  const installments=await readGroup('installments',async()=>{
    const result=await read(`SELECT LOWER(COALESCE(ip.brand,'unknown')) AS brand,SUM(io.amount)::text AS total,
      MAX(GREATEST(io.updated_at,ip.updated_at)) AS last_changed_at
      FROM installment_occurrences io JOIN installment_plans ip ON io.plan_id=ip.id
      WHERE ip.user_id=$1 AND io.year=$2 AND io.month=$3 AND io.active=true
      GROUP BY LOWER(COALESCE(ip.brand,'unknown'))`,[userId,year,month]);
    const values={visa:0n,mastercard:0n};let last=null;
    for(const row of result.rows){if(!known(row.brand))throw Error('UNKNOWN_INSTALLMENT_NETWORK');values[row.brand]+=minor(row.total);if(later(row.last_changed_at,last))last=row.last_changed_at;}return{values,asOf:last};
  });
  if(installments)for(const brand of ['visa','mastercard'])cards[brand].installments=installments.values[brand];
  const international=await readGroup('international',async()=>{
    const result=await read(`SELECT LOWER(brand) AS brand,SUM(amount_clp)::text AS total,
      COUNT(*) FILTER (WHERE amount_clp IS NULL) AS conversion_pending_count,MAX(updated_at) AS last_changed_at
      FROM intl_unbilled WHERE user_id=$1 AND period_year=$2 AND period_month=$3 AND tipo = 'gasto'
      GROUP BY LOWER(brand)`,[userId,year,month]);
    const values={visa:0n,mastercard:0n};let pending=0,last=null;
    for(const row of result.rows){if(!known(row.brand))throw Error('UNKNOWN_INTERNATIONAL_NETWORK');pending+=Number(row.conversion_pending_count||0);if(row.total!==null)values[row.brand]+=minor(row.total);if(later(row.last_changed_at,last))last=row.last_changed_at;}return{values,pending,asOf:last};
  });
  if(international){conversionPendingCount=international.pending;for(const brand of ['visa','mastercard'])cards[brand].international=international.values[brand];if(conversionPendingCount){partialReasons.push('USD_CONVERSION_PENDING');sources.international.freshness='unknown';sources.international.errorCode='USD_CONVERSION_PENDING';}}
  const projected=await readGroup('projected',async()=>{
    const rows=await listEffectiveProjections(userId,year,month,{query:read});let expenses=0n,income=0n,last=null;const expenseDetails=[],incomeDetails=[];
    for(const row of rows){if(row.active===false)continue;const amount=minor(row.monto);if(amount<=0n)throw Error('PROJECTED_AMOUNT_INVALID');const detail={name:row.nombre,amount:money(amount),fecha:row.fecha,virtual:row.virtual===true};if(row.tipo==='gasto'){expenses+=amount;expenseDetails.push(detail);}else if(row.tipo==='ingreso'){income+=amount;incomeDetails.push(detail);}else throw Error('PROJECTED_TYPE_INVALID');if(later(row.updated_at,last))last=row.updated_at;}
    return{expenses,income,details:{expenses:expenseDetails,income:incomeDetails},asOf:last};
  });
  const cardsComplete=Boolean(national&&installments&&international);
  let combined=0n;
  const creditCards={};
  for(const brand of ['visa','mastercard']){
    const values=cards[brand],total=values.unbilled+values.installments+values.international-values.payments,positive=total>0n?total:0n;
    creditCards[brand]={unbilled:national?money(values.unbilled):null,payments:national?money(values.payments):null,installments:installments?money(values.installments):null,international:international?money(values.international):null,total:cardsComplete?money(positive):null};combined+=positive;
  }
  creditCards.combined=cardsComplete?money(combined):null;
  const commitments=cardsComplete&&projected?combined+projected.expenses:null;
  return{creditCards,projected:{expenses:projected?money(projected.expenses):null,income:projected?money(projected.income):null,details:projected?.details||{expenses:[],income:[]}},sources,partialReasons,conversionPendingCount,unknownNetworkCount,totalCommitments:commitments===null?null:money(commitments),_minor:{combined:cardsComplete?combined:null,projectedExpenses:projected?.expenses??null,projectedIncome:projected?.income??null,totalCommitments:commitments},legacy:{tcNoFacturado:national?money(cards.visa.unbilled+cards.mastercard.unbilled):null,cuotas:installments?money(cards.visa.installments+cards.mastercard.installments):null,intl:international?money(cards.visa.international+cards.mastercard.international):null,proyectados:projected?money(projected.expenses):null}};
}

module.exports={readFinancialCommitments,minor,money,iso};
