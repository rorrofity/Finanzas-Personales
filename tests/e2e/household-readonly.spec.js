const {test,expect}=require('@playwright/test');
const {installDashboardFixtures}=require('./helpers/expenseFixtures');
const token='F'.repeat(43),owner='shared-fixture-owner',invited='demo@example.invalid';
const own={ownerId:'fixture-user',ownerName:'Usuario de prueba',isOwner:true,canEdit:true,canDelete:true};
const shared={ownerId:owner,ownerName:'Familia de prueba',isOwner:false,canEdit:false,canDelete:false};
const json=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'Cache-Control':'no-store'},body:JSON.stringify(data)});
async function setup(page,{member=false,guest=false}={}){
 const state=await installDashboardFixtures(page,{period:'2026-10'});state.accepted=member;state.members=[];state.invites=[];state.previews=0;state.accepts=0;state.readHeaders=[];
 await page.addInitScript(()=>{window.__copiedInvitation=null;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copiedInvitation=text;}}});});
 if(member)await page.addInitScript(value=>localStorage.setItem('activeSpaceOwner::fixture-user',value),owner);
 if(guest)await page.route('**/api/auth/profile',route=>json(route,{message:'Sesión anterior'},401));
 await page.route('**/api/auth/login',route=>json(route,{user:{id:'fixture-user',nombre:'Usuario de prueba',email:invited},token:'fixture-renewed-token'}));
 await page.route('**/api/space/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(path==='/api/space/memberships')return json(route,{spaces:state.accepted?[own,shared]:[own]});
  if(path==='/api/space/members'&&req.method()==='GET')return json(route,{members:state.members});
  if(path==='/api/space/members'&&req.method()==='POST'){
   const body=req.postDataJSON();state.invites.push(body);const member={id:'fixture-invitation',invitedEmail:body.email,status:'pending',isActive:true,canEdit:body.canEdit,canDelete:body.canDelete,inviteExpiresAt:'2026-11-09T03:30:00Z'};state.members=[member];return json(route,{member,invitationUrl:'http://127.0.0.1:3105/invite#token='+token},201);
  }
  if(path==='/api/space/invitations/preview'){expect(req.postDataJSON()).toEqual({token});state.previews++;return json(route,{invitation:{ownerName:shared.ownerName,invitedEmail:invited,expiresAt:'2026-11-09T03:30:00Z',canEdit:false,canDelete:false}});}
  if(path==='/api/space/invitations/accept'){expect(req.postDataJSON()).toEqual({token});state.accepts++;state.accepted=true;return json(route,{member:{id:'fixture-invitation',status:'linked',canEdit:false,canDelete:false},ownerId:owner});}
  state.unexpected.push(req.method()+' '+path);return route.abort();
 });
 const extra={
 '/api/cards':[], '/api/categories':[], '/api/intl-unbilled':[], '/api/projected':[],
 '/api/checking':{items:[],total:0},'/api/checking/global-balance':{saldo_actual:650000},
 '/api/checking/fintoc/bank-balance':{provider:'fintoc',currency:'CLP',available:'765432',current:'700000',state:'available',freshness:'current',queriedAt:'2026-10-31T20:00:00Z',bankUpdatedAt:'2026-10-31T19:00:00Z'},
 '/api/checking/fintoc/daily-status':{provider:'fintoc',enabled:true,schedule:'07:00',timezone:'America/Santiago',state:'current',pendingReviewCount:0,lastSuccessAt:'2026-10-31T20:00:00Z'},
 '/api/financial-health/alerts':{alerts:[]},
 };
 await page.route('**/api/**',async(route)=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(Object.prototype.hasOwnProperty.call(extra,path)){
   if(req.method()!=='GET'){state.writes.push(req.method()+' '+path);return route.abort();}
   state.readHeaders.push({path,owner:req.headers()['x-space-owner']});return json(route,extra[path]);
  }
  return route.fallback();
 });
 return state;
}
test('dueño prepara enlace privado de solo lectura y lo copia sin enviar correo',async({page})=>{
 const state=await setup(page);await page.goto('/settings');await page.getByRole('tab',{name:'Espacio compartido'}).click();await page.getByLabel('Email del invitado').fill(invited);await expect(page.getByLabel('Crear/Editar',{exact:true})).not.toBeChecked();await expect(page.getByLabel('Eliminar',{exact:true})).not.toBeChecked();await page.getByRole('button',{name:'Invitar',exact:true}).click();await expect(page.getByText('Invitación preparada',{exact:true})).toBeVisible();await expect(page.getByLabel('Enlace de invitación')).toHaveValue('http://127.0.0.1:3105/invite#token='+token);await page.getByRole('button',{name:'Copiar enlace',exact:true}).click();expect(await page.evaluate(()=>window.__copiedInvitation)).toContain('/invite#token=');expect(state.invites).toEqual([{email:invited,canEdit:false,canDelete:false}]);state.verify();
});
test('pareja acepta explícitamente y entra al hogar recién agregado sin persistir token',async({page})=>{
 const state=await setup(page);await page.goto('/invite#token='+token);await expect(page.getByRole('heading',{name:'Invitación al hogar'})).toBeVisible();await expect(page.getByText(/Acceso de solo lectura:/)).toBeVisible();expect(state.accepts).toBe(0);expect(new URL(page.url()).hash).toBe('');await page.getByRole('button',{name:'Aceptar invitación'}).click();await expect(page.getByTestId('space-switcher')).toContainText('Hogar de Familia de prueba');expect(await page.evaluate(()=>sessionStorage.getItem('householdInvitation'))).toBeNull();expect(state.accepts).toBe(1);state.verify();
});
test('sesión caducada conserva enlace en la pestaña y vuelve a aceptación tras login',async({page})=>{
 const state=await setup(page,{guest:true});await page.goto('/invite#token='+token);await page.getByRole('link',{name:'Iniciar sesión',exact:true}).click();await expect(page).toHaveURL(/\/login$/);await page.getByLabel('Correo Electrónico').fill(invited);await page.getByLabel('Contraseña').fill('Fictitious-password');await page.getByRole('button',{name:'Iniciar Sesión',exact:true}).click();await expect(page.getByRole('heading',{name:'Invitación al hogar'})).toBeVisible();await expect(page.getByRole('button',{name:'Aceptar invitación'})).toBeEnabled();expect(state.accepts).toBe(0);expect(new URL(page.url()).search).toBe('');state.verify();
});
for(const path of ['/checking','/transactions-intl','/categories','/projected-transactions'])test('hogar solo lectura bloquea controles de escritura '+path,async({page})=>{
 const state=await setup(page,{member:true});await page.goto(path);await expect(page.getByTestId('space-switcher')).toContainText('Hogar de Familia de prueba');const buttons=page.getByRole('button',{name:/^(?:Importar|Nuevo|Nueva|Agregar|Editar|Eliminar|Resolver)/i});for(const button of await buttons.all())await expect(button).toBeDisabled();if(path==='/checking'){await expect(page.getByText('$765.432',{exact:true})).toBeVisible();expect(state.readHeaders.filter(r=>r.path.includes('/fintoc/')).every(r=>r.owner===owner)).toBe(true);}const geometry=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));expect(geometry.scroll).toBeLessThanOrEqual(geometry.width);state.verify();
});
