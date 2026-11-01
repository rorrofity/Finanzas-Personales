const { test, expect } = require('@playwright/test');
const { installDashboardFixtures } = require('./helpers/expenseFixtures');
const cases=[{path:'/transactions',api:'/api/transactions',name:'nacionales'},{path:'/transactions-intl',api:'/api/intl-unbilled',name:'internacionales'},{path:'/checking',api:'/api/checking',name:'cuenta-corriente'}];
const rows=[
 {id:'fixture-pending',descripcion:'Pendiente ficticio Visa',category_id:null,network:'visa',brand:'visa',tipo:'gasto'},
 {id:'fixture-assigned',descripcion:'Clasificado ficticio Visa',category_id:7,network:'visa',brand:'visa',tipo:'gasto'},
 {id:'fixture-other-card',descripcion:'Pendiente ficticio Mastercard',network:'mastercard',brand:'mastercard',tipo:'gasto'},
 {id:'fixture-empty',descripcion:'Pendiente ficticio sin ID',category_id:'',network:'visa',brand:'visa',tipo:'gasto'},
 {id:'fixture-dismissed',descripcion:'Desestimado ficticio pendiente',category_id:null,network:'visa',brand:'visa',tipo:'desestimar'},
].map(row=>({fecha:'2026-05-10',monto:'1000',amount_usd:'10.00',exchange_rate:'900.0000',amount_clp:'9000.00',provider:'banco_chile',...row}));
async function fixtures(page,entry){
 const state=await installDashboardFixtures(page,{period:'2026-05'});state.filterReads=[];
 const checking=rows.slice(0,4).map((row,index)=>({...row,tipo:index===2?'abono':'cargo',amount:'1000',notas:''}));
 const responses={
  '/api/categories':[{id:7,name:'Categoría ficticia',tipo:'gasto'}],'/api/cards':[],
  '/api/checking/global-balance':{saldo_actual:123456},
  '/api/checking/fintoc/status':{provider:'fintoc',state:'disabled',mode:null,readOnly:true,writesEnabled:false},
  '/api/checking/fintoc/daily-status':{provider:'fintoc',enabled:true,schedule:'07:00',timezone:'America/Santiago',state:'needs_review',initialized:true,cutoverDate:'2026-05-01',lastSuccessAt:'2026-05-31T20:00:00.000Z',bankUpdatedAt:'2026-05-31T19:00:00.000Z',bankFreshness:'current',coverage:{since:'2026-03-01',until:'2026-05-31',complete:true},pendingReviewCount:0,importedTotal:0,lastRun:{trigger:'scheduled',status:'success',inserted:0,linked:1,review:0},lastErrorCode:null},
  '/api/checking/fintoc/bank-balance':{provider:'fintoc',currency:'CLP',state:'available',available:'123456',current:'123456',bankUpdatedAt:'2026-05-31T19:00:00.000Z',queriedAt:'2026-05-31T20:00:00.000Z',freshness:'current'},
 };
 for(const pattern of ['**/api/categories**','**/api/cards**','**/api/transactions**','**/api/intl-unbilled**','**/api/checking**'])await page.route(pattern,route=>{
  const request=route.request(),url=new URL(request.url());if(request.method()!=='GET'){state.writes.push(request.method()+' '+url.pathname);return route.abort()}
  let data;if(url.pathname===entry.api){state.filterReads.push(url.pathname);data=entry.path==='/checking'?{items:checking,total:checking.length}:rows}
  else if(Object.prototype.hasOwnProperty.call(responses,url.pathname))data=responses[url.pathname];else {state.unexpected.push(request.method()+' '+url.pathname);return route.abort()}
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 return state;
}
async function appearance(page,mode){await page.getByRole('button',{name:'Apariencia',exact:true}).click();await page.getByRole('menuitemradio',{name:mode==='dark'?'Oscuro':'Claro',exact:true}).click();await expect(page.getByRole('menu',{name:'Elegir apariencia'})).toBeHidden()}
async function capture(page,entry,mode,testInfo,state){
 const geometry=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));expect(geometry.scroll).toBeLessThanOrEqual(geometry.width);
 const dir=process.env.UNCATEGORIZED_QA_DIR;if(!dir||!['dashboard-mobile','dashboard-desktop'].includes(testInfo.project.name))return;
 const fs=require('fs'),path=require('path');fs.mkdirSync(dir,{recursive:true});const name=`${testInfo.project.name}-${entry.name}-${mode}`;await page.screenshot({path:path.join(dir,name+'.png'),fullPage:true});const file=path.join(dir,'evidence.json');const value=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{data:'exclusively fictitious',realDatabaseAccess:false,realBankRequests:0,cases:[]};value.cases=value.cases.filter(row=>row.name!==name);value.cases.push({name,mode,...geometry,writes:state.writes,jsErrors:state.errors,unexpectedApi:state.unexpected});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
}
for(const entry of cases)test(`Sin categoría de ${entry.name}: contador, filtro reversible y temas sin escrituras`,async({page},testInfo)=>{
 const state=await fixtures(page,entry);await page.goto(entry.path);await expect(page.getByText('Clasificado ficticio Visa',{exact:true})).toBeVisible();const count=entry.path==='/checking'?3:4;
 for(const mode of ['light','dark']){
  await appearance(page,mode);const button=page.getByRole('button',{name:`Sin categoría (${count})`,exact:true});await expect(button).toHaveAttribute('aria-pressed','false');await button.click();await expect(button).toHaveAttribute('aria-pressed','true');await expect(page.getByText('Clasificado ficticio Visa',{exact:true})).toHaveCount(0);await expect(page.getByText('Pendiente ficticio Visa',{exact:true})).toBeVisible();await expect(page.getByText('Pendiente ficticio Mastercard',{exact:true})).toBeVisible();await capture(page,entry,mode,testInfo,state);await button.click();await expect(page.getByText('Clasificado ficticio Visa',{exact:true})).toBeVisible();
 }
 state.verify();
});
