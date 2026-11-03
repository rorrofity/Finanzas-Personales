const { readFinancialCommitments, minor, money, iso } = require('./financialCommitmentsService');
const MONTHS=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function calculateHealthScore(projectedBalance,totalCommitments,currentBalance) {
  if(totalCommitments===0||currentBalance===0)return{score:50,status:'unknown'};
  const coverageRatio=currentBalance/totalCommitments;let score=50;
  if(projectedBalance>0)score+=Math.min(projectedBalance/currentBalance*50,50);
  else score-=Math.min(Math.abs(projectedBalance)/totalCommitments*50,50);
  if(coverageRatio>2)score+=10;if(coverageRatio>3)score+=10;
  score=Math.max(0,Math.min(100,Math.round(score)));
  return{score,status:score>=80?'excellent':score>=60?'healthy':score>=40?'warning':'critical'};
}
function periodFrom(query,now) {
  if(!query||typeof query!=='object'||Array.isArray(query)||Object.keys(query).some(k=>!['year','month'].includes(k)))throw Error('INVALID_PERIOD');
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).reduce((a,p)=>(a[p.type]=p.value,a),{});
  const givenYear=query.year!==undefined,givenMonth=query.month!==undefined;
  if(givenYear!==givenMonth)throw Error('INVALID_PERIOD');
  if(givenYear&&(!['string','number'].includes(typeof query.year)||!['string','number'].includes(typeof query.month)||!/^\d{4}$/.test(String(query.year))||!/^(?:0?[1-9]|1[0-2])$/.test(String(query.month))))throw Error('INVALID_PERIOD');
  let year=givenYear?Number(query.year):Number(today.year),month=givenMonth?Number(query.month):Number(today.month)+1;
  if(!givenMonth&&month>12){year++;month=1;}
  if(year<2000||year>2100)throw Error('INVALID_PERIOD');
  return{year,month,currentDate:`${today.year}-${today.month}-${today.day}`};
}

function createFinancialHealthController({db,getCheckingBalance,now=()=>new Date()}={}) {
  const database=()=>db||require('../config/database');
  const checking=getCheckingBalance||((owner,options)=>require('./canonicalCheckingBalanceService').getCanonicalCheckingBalance(owner,options));
  async function getSummary(req,res) {
    const instant=new Date(typeof now==='function'?now():now);let period;
    try{period=periodFrom(req.query||{},instant);}catch(_){return res.status(400).json({error:'Se requiere un período válido.',code:'FINANCIAL_HEALTH_INVALID_PERIOD'});}
    let client,begun=false;
    try{
      client=await(database().pool||database()).connect();const query=client.query.bind(client);
      await query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;
      const readSource=async(name,fn)=>{
        // Every name below is a fixed internal identifier, never request text.
        if(!/^[a-z]+$/.test(name))throw Error('INVALID_SOURCE');
        const savepoint='hfs_'+name;await query('SAVEPOINT '+savepoint);
        try{const value=await fn();await query('RELEASE SAVEPOINT '+savepoint);return{ok:true,value};}
        catch(_){await query('ROLLBACK TO SAVEPOINT '+savepoint);await query('RELEASE SAVEPOINT '+savepoint);return{ok:false};}
      };
      const owner=req.spaceUserId||req.user.id;
      const bankRead=await readSource('checking',()=>checking(owner,{query,now:instant}));
      const bank=bankRead.ok?bankRead.value:{source:'fintoc',provider:'fintoc',currency:'CLP',amount:null,available:null,current:null,state:'error',freshness:'unknown',bankUpdatedAt:null,queriedAt:null,reason:'CHECKING_UNAVAILABLE'};
      const commitments=await readFinancialCommitments(owner,period.year,period.month,{query,readSource});
      const sync=await readSource('sync',async()=>{
        const rows=(await query(`SELECT created_at,error IS NOT NULL AS failed,
          (SELECT MAX(created_at) FROM sync_runs WHERE user_id=$1 AND error IS NULL) AS latest_success_at
          FROM sync_runs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`,[owner])).rows;
        return rows[0]||null;
      });
      const sources={checking:{state:bank.state,freshness:bank.freshness,asOf:bank.bankUpdatedAt,errorCode:bank.reason||null},...commitments.sources};
      const reasons=[...commitments.partialReasons];
      if(bank.state!=='available'||bank.amount===null)reasons.push('CHECKING_UNAVAILABLE');
      else if(bank.freshness==='stale')reasons.push('CHECKING_STALE');
      else if(bank.freshness!=='current')reasons.push('CHECKING_DATE_UNKNOWN');
      let bankMinor=null;
      if(bank.amount!==null){try{bankMinor=minor(bank.amount);money(bankMinor);}catch(_){bankMinor=null;reasons.push('CHECKING_AMOUNT_UNSAFE');sources.checking.errorCode='CHECKING_AMOUNT_UNSAFE';}}
      const lastRun=sync.ok&&sync.value?{at:iso(sync.value.created_at),state:sync.value.failed?'error':'available',lastSuccessAt:iso(sync.value.latest_success_at)}:null;
      const syncAge=lastRun?.lastSuccessAt?instant.getTime()-Date.parse(lastRun.lastSuccessAt):null;
      const syncFreshness=syncAge===null||!Number.isFinite(syncAge)||syncAge< -300000?'unknown':syncAge>86400000?'stale':'current';
      const syncReason=syncFreshness==='unknown'?'EMAIL_SYNC_UNVERIFIED':syncFreshness==='stale'?'EMAIL_SYNC_STALE':lastRun?.state==='error'?'EMAIL_SYNC_FAILED':null;
      if(lastRun){
        for(const key of ['national','international']){
          if(sources[key].state==='available'){
            sources[key].asOf=lastRun.lastSuccessAt||sources[key].asOf;
          }
        }
      }
      if(syncReason){reasons.push(syncReason);for(const key of ['national','international'])if(sources[key].state==='available'){
        sources[key].freshness=syncReason==='EMAIL_SYNC_STALE'?'stale':'unknown';
        if(!sources[key].errorCode)sources[key].errorCode=syncReason;
      }}
      const projectedMinor=bankMinor!==null&&commitments._minor.projectedIncome!==null&&commitments._minor.totalCommitments!==null
        ?bankMinor+commitments._minor.projectedIncome-commitments._minor.totalCommitments:null;
      const currentBalance=bankMinor===null?null:money(bankMinor),projectedBalance=projectedMinor===null?null:money(projectedMinor);
      const partialReasons=[...new Set(reasons)],amountsPartial=partialReasons.length>0;
      const health=amountsPartial||projectedBalance===null||commitments.totalCommitments===null
        ?{score:null,status:'unknown'}:calculateHealthScore(projectedBalance,commitments.totalCommitments,currentBalance);
      const alerts=[];
      if(projectedBalance!==null&&projectedBalance<0)alerts.push({type:amountsPartial?'warning':'critical',title:amountsPartial?'Proyección parcial negativa':'Proyección Negativa',message:`La proyección de ${MONTHS[period.month-1]} es negativa${amountsPartial?' con datos por verificar':''}.`});
      else if(projectedBalance!==null&&currentBalance!==null&&projectedBalance<currentBalance*.2)alerts.push({type:'warning',title:'Saldo Bajo Proyectado',message:'El saldo previsto requiere revisar los compromisos del período.'});
      await query('COMMIT');begun=false;
      if(typeof res.set==='function')res.set('Cache-Control','private, no-store');
      return res.json({generatedAt:instant.toISOString(),currentDate:period.currentDate,targetMonth:{year:period.year,month:period.month,name:`${MONTHS[period.month-1]} ${period.year}`},
        checking:{...bank,currentBalance,lastUpdated:bank.bankUpdatedAt},creditCards:commitments.creditCards,projected:commitments.projected,
        summary:{totalCommitments:commitments.totalCommitments,projectedBalance,healthScore:health.score,healthStatus:health.status,conversionPendingCount:commitments.conversionPendingCount,unknownNetworkCount:commitments.unknownNetworkCount,amountsPartial,partialReasons},sources,emailSync:lastRun,alerts});
    }catch(_){
      if(begun&&client){try{await client.query('ROLLBACK');}catch(__){/* preserve sanitized failure */}}
      return res.status(503).json({error:'No se pudo actualizar la salud financiera. Los datos anteriores no se han modificado.',code:'FINANCIAL_HEALTH_UNAVAILABLE'});
    }finally{if(client)client.release();}
  }
  return{getSummary};
}

module.exports={createFinancialHealthController,calculateHealthScore,periodFrom};
