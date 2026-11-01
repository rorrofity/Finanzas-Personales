const {createHash}=require('crypto');
const {matchStatement,normalizeDescription}=require('./matcher');
const INFO=new Set(['payment','debt_transfer','other_credit']);
const positive=value=>minor(value)!==null&&minor(value)>0n;
function minor(value){const m=/^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));return m?(m[1]?-1n:1n)*(BigInt(m[2])*100n+BigInt((m[3]||'').padEnd(2,'0'))):null;}
function money(value,currency){const sign=value<0n?'-':'';const n=value<0n?-value:value;return currency==='CLP'?sign+String(n/100n):sign+String(n/100n)+'.'+String(n%100n).padStart(2,'0');}
const key=s=>s.sourceType+':'+s.id;
const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const commerce=value=>normalizeDescription(value).replace(/\b(?:compra|compras|pago|con|tarjeta|credito|debito)\b/g,' ').trim().replace(/\s+/g,' ');
function compatible(a,b){const x=commerce(a),y=commerce(b);return Boolean(x&&y&&(x===y||(Math.min(x.length,y.length)>=6&&(x.includes(y)||y.includes(x)))));}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
function validHeader(document){const p=document.period||{};const dates=[p.since,p.until,document.statementDate,document.dueDate];return dates.every(d=>validDay(d)&&Number(d.slice(0,4))>=2000&&Number(d.slice(0,4))<=2100)&&p.since<=p.until&&p.until<=document.statementDate&&document.statementDate<=document.dueDate;}
const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const samePeriod=(source,document)=>Number(source.billingYear)===Number(document.dueDate?.slice(0,4))&&Number(source.billingMonth)===Number(document.dueDate?.slice(5,7));
function possibleIdentity(item,source,network){
 // A legacy brand may be a route default; without physical card identity it
 // cannot establish that an otherwise compatible charge belongs elsewhere.
 if(!item.cardLastFour||!source.cardLastFour)return true;
 return item.cardLastFour===source.cardLastFour&&(!source.network||source.network===network);
}
function sameCandidateAmount(item,source){const a=minor(item.amount),b=minor(source.amount);return a!==null&&b!==null&&(a===b||(item.currency==='CLP'&&source.type==='gasto'&&b<0n&&a===-b));}
function near(item,source,document){
 if(item.currency!==source.currency||!possibleIdentity(item,source,document.network))return false;
 const dated=validDay(item.date)&&validDay(source.date);
 const distance=dated?Math.abs(Date.parse(item.date+'T00:00:00Z')-Date.parse(source.date+'T00:00:00Z')):Infinity;
 return ((!source.network||!source.cardLastFour||source.providerKnown===false)&&samePeriod(source,document)&&sameCandidateAmount(item,source))
  ||(distance<=3*86400000&&sameCandidateAmount(item,source))
  ||(compatible(item.description,source.description)&&(samePeriod(source,document)||distance<=3*86400000));
}
function fingerprintItems(document){
 const groups=new Map(),rows=[];
 document.sections.forEach((section,sectionIndex)=>section.items.forEach((item,ordinal)=>{
  const semantic=[document.network,item.cardLastFour||document.mainCardLastFour,item.currency,item.kind,item.date,String(minor(item.amount)),commerce(item.description),item.kind==='installment'?item.installmentNumber:null];
  const signature=JSON.stringify(semantic);const occurrence=groups.get(signature)||0;groups.set(signature,occurrence+1);
  rows.push({sectionIndex,ordinal,rowKey:item.rowKey,item,signature,fingerprint:digest({semantic,occurrence})});
 }));
 return rows.map(row=>({...row,duplicateCount:groups.get(row.signature)}));
}
function analyzeStatement(document,sources,{revisionConflict=false}={}){
 const result=matchStatement(document,sources,{revisionConflict});
 const headerValid=validHeader(document);
 if(!headerValid)result.validation={...document.validation,valid:false,issues:[...(document.validation?.issues||[]),'HEADER_ORDER_INVALID']};
 const used=new Set(result.sections.flatMap(section=>section.items.filter(item=>item.finding.status==='matched').map(item=>item.finding.sourceType+':'+item.finding.sourceId)));
 const cards=new Set([document.mainCardLastFour,...document.sections.flatMap(s=>s.items.map(i=>i.cardLastFour))].filter(Boolean));
 result.sections=result.sections.map(section=>{
  let statement=0n,matched=0n,extra=0n;let unresolvedCount=0,uncertainCount=0;const extras=[];
  for(const item of section.items){if(INFO.has(item.kind))continue;const n=minor(item.amount);if(n===null){unresolvedCount++;continue;}statement+=n;if(item.finding.status==='matched')matched+=n;else unresolvedCount++;}
  for(const source of sources){
   if(source.currency!==section.currency||!samePeriod(source,document)||source.type!=='gasto'||minor(source.amount)===null||minor(source.amount)===0n)continue;
   if(source.network&&source.network!==document.network){if(source.cardLastFour&&cards.has(source.cardLastFour))uncertainCount++;continue;}
   if(minor(source.amount)<0n){uncertainCount++;continue;}
   const uncertain=!source.network||!source.cardLastFour||source.providerKnown===false||source.identityConflict===true||(source.cardLastFour&&!cards.has(source.cardLastFour));
   if(uncertain){uncertainCount++;continue;}
   if(used.has(key(source)))continue;
   extra+=minor(source.amount);extras.push({sourceType:source.sourceType,sourceId:String(source.id),date:source.date||null,description:source.description,amount:money(minor(source.amount),section.currency),reason:'extra_in_history'});
  }
  const difference=statement-matched-extra;
  const official=section.currency==='CLP'?section.totals?.billedTotal:section.totals?.debtTotal;
  const officialTotal=minor(official)===null?null:money(minor(official),section.currency);
  const complete=headerValid&&document.validation?.valid===true&&section.validation?.valid===true&&!revisionConflict&&officialTotal!==null&&unresolvedCount===0&&extras.length===0&&uncertainCount===0&&difference===0n;
  return{...section,extras,reconciliation:{officialTotal,statementCharges:money(statement,section.currency),matchedCharges:money(matched,section.currency),unresolvedCharges:money(statement-matched,section.currency),extraCharges:money(extra,section.currency),difference:money(difference,section.currency),extraCount:extras.length,uncertainCount,complete}};
 });
 result.status=!headerValid||!document.validation?.valid||result.sections.some(s=>!s.validation?.valid)?'invalid':result.sections.every(s=>s.reconciliation.complete)?'ready':'review';return result;
}
function planSettlement({runId,document,sources,evidence=[],cards=[],revisionConflict=false,asOfDate}){
 const result=analyzeStatement(document,sources,{revisionConflict});
 const main=cards.find(card=>String(card.last_four).trim()===document.mainCardLastFour&&card.network===document.network&&card.is_active!==false);
 const valid=validHeader(document)&&document.validation?.valid===true&&document.sections.every(s=>s.validation?.valid===true)&&Boolean(main)&&!revisionConflict;
 const rows=fingerprintItems(document),actions=[];
 for(const row of rows){
  const item=row.item,finding=result.sections[row.sectionIndex].items[row.ordinal].finding;
  const action={sectionIndex:row.sectionIndex,ordinal:row.ordinal,rowKey:row.rowKey,fingerprint:row.fingerprint,currency:item.currency,decision:'hold',reason:null,sourceType:null,sourceId:null};
  const hold=reason=>{action.reason=reason;actions.push(action);};
  if(INFO.has(item.kind)){action.decision='informational';action.reason=item.kind;actions.push(action);continue;}
  if(!valid){hold(revisionConflict?'revision_conflict':!main?'card_unregistered':'invalid_document');continue;}
  if(sources.some(source=>source.cardLastFour&&source.cardLastFour===item.cardLastFour&&source.network&&source.network!==document.network&&near(item,{...source,network:document.network},document))){hold('card_network_conflict');continue;}
  const previous=evidence.find(e=>e.fingerprint===row.fingerprint);
  if(previous){
   const source=sources.find(s=>s.sourceType===previous.source_type&&String(s.id)===String(previous.source_id));
   if(!source){hold('financial_record_removed');continue;}
   if(finding.status!=='matched'||finding.sourceType!==source.sourceType||String(finding.sourceId)!==String(source.id)){hold('previous_reference_changed');continue;}
   action.decision='link';action.reason='already_recorded';action.sourceType=source.sourceType;action.sourceId=String(source.id);actions.push(action);continue;
  }
  if(finding.status==='matched'){action.decision='link';action.reason='unique_identity_match';action.sourceType=finding.sourceType;action.sourceId=finding.sourceId;actions.push(action);continue;}
  if(finding.status!=='missing'){hold(finding.reason);continue;}
  if(item.kind==='installment'){hold('installment_requires_review');continue;}
  if(!['purchase','fee'].includes(item.kind)||!positive(item.amount)||minor(item.amount)>99999999999n||!validDay(item.date)||item.date<document.period.since||item.date>document.period.until||(asOfDate&&item.date>asOfDate)||!item.description?.trim()||item.description.length>255){hold('unsafe_charge');continue;}
  if(!item.cardLastFour||!cards.some(card=>String(card.last_four).trim()===item.cardLastFour&&card.network===document.network&&card.is_active!==false)){hold('card_identity_missing');continue;}
  if(row.duplicateCount>1){hold('ambiguous_multiplicity');continue;}
  if(sources.some(source=>near(item,source,document))){hold('possible_existing_charge');continue;}
  if(evidence.some(e=>{const bank=e.bank_snapshot||{};return near(item,{...bank,network:bank.network||document.network,billingYear:e.financial_snapshot?.billingYear,billingMonth:e.financial_snapshot?.billingMonth},document);})){hold('previous_reference_possible');continue;}
  action.decision='insert';action.reason='confirmed_missing';actions.push(action);
 }
 const summary=actions.reduce((sum,a)=>{sum[a.decision]++;return sum;},{insert:0,link:0,hold:0,informational:0});
 const sections=result.sections.map(({scope,currency,reconciliation})=>({scope,currency,reconciliation}));
 const state={runId,document,sources:[...sources].sort((a,b)=>key(a).localeCompare(key(b))),evidence:[...evidence].sort((a,b)=>a.fingerprint.localeCompare(b.fingerprint)),cards:[...cards].sort((a,b)=>String(a.last_four).localeCompare(String(b.last_four))),revisionConflict,asOfDate,actions};
 return{id:runId,digest:digest(state),actions,summary,sections};
}
module.exports={planSettlement,analyzeStatement,fingerprintItems,minor,money,canonical};
