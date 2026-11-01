const { planHistoryClassification, createFintocHistoryClassificationService } = require('../fintocHistoryClassificationService');
const OWNER = 'owner-fixture';
const OTHER = 'other-fixture';
const ACCOUNT = 'acc_fixture';
const category = (id, name='Cuentas', patch={}) => ({ id, name, user_id: OWNER, ...patch });
const row = (id, patch={}) => ({ id, user_id: OWNER, descripcion: 'Pago:Servicio Ficticio 1234', tipo: 'cargo', category_id: null, amount: '12345.00', notas: 'Nota protegida', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...patch });
const classify = (patch={}) => planHistoryClassification({ targets:[row('target')], history:[row('old',{category_id:1})], categories:[category(1)], ...patch });

describe('history-only classification planner', () => {
  test('one exact unambiguous historical category is sufficient', () => expect(classify()).toEqual({ summary:{classify:1,leave:0}, actions:[{checkingId:'target',decision:'classify',categoryId:1,reason:'history_unanimous',support:1}] }));
  test('normalizes accents, case, punctuation and whitespace without changing identity', () => expect(classify({history:[row('old',{category_id:1,descripcion:' PÁGO servicio   ficticio:1234 '})]}).summary.classify).toBe(1));
  test('preserves digits instead of combining different beneficiaries or references', () => expect(classify({targets:[row('target',{descripcion:'Pago servicio ficticio 1235'})]}).summary.leave).toBe(1));
  test('full descriptions are matched without truncating names', () => expect(classify({targets:[row('target',{descripcion:'a'.repeat(60)+' otra contraparte'})],history:[row('old',{category_id:1,descripcion:'a'.repeat(60)+' primera contraparte'})]}).summary.leave).toBe(1));
  test('a bank full description differing beyond stored truncation remains unknown', () => expect(classify({targets:[row('target',{descripcion:'a'.repeat(60),source_description:'a'.repeat(60)+' another beneficiary'})],history:[row('old',{category_id:1,descripcion:'a'.repeat(60)})]}).summary.leave).toBe(1));
  test('a manually edited target description does not hide its different bank source', () => expect(classify({targets:[row('target',{source_description:'Another bank beneficiary'})]}).summary.leave).toBe(1));
  test('same amount or generic bank alone never provides a match', () => expect(classify({targets:[row('target',{descripcion:'Otro servicio'})]}).summary.leave).toBe(1));
  test('cargo and abono cannot train each other', () => expect(classify({targets:[row('target',{tipo:'abono'})]}).summary.leave).toBe(1));
  test('contradictory categories remain null regardless of frequency', () => expect(classify({history:[row('a',{category_id:1}),row('b',{category_id:1}),row('c',{category_id:2})],categories:[category(1),category(2,'Otra')]}).actions).toMatchObject([{decision:'leave',categoryId:null,reason:'history_conflict',support:3}]));
  test('all agreeing examples contribute to support', () => expect(classify({history:[row('a',{category_id:1}),row('b',{category_id:1})]}).actions[0].support).toBe(2));
  test('history from another owner is not evidence', () => expect(classify({history:[row('old',{category_id:1,user_id:OTHER})]}).summary.leave).toBe(1));
  test('a category owned by someone else cannot be assigned', () => expect(classify({categories:[category(1,'Cuentas',{user_id:OTHER})]}).summary.leave).toBe(1));
  test('global categories can be used', () => expect(classify({categories:[category(1,'Cuentas',{user_id:null})]}).summary.classify).toBe(1));
  test.each(['Sin categorizar','Sin categoría','Sin clasificar','Sin clasificación','Uncategorized'])('placeholder category %s is not learned', name => expect(classify({categories:[category(1,name)]}).summary.leave).toBe(1));
  test('null and deleted categories are not evidence', () => expect(classify({history:[row('a'),row('b',{category_id:999})]}).summary.leave).toBe(1));
  test('another imported classification is never training data', () => expect(classify({history:[row('old',{category_id:1,created_checking:true})]}).summary.leave).toBe(1));
  test('a target cannot teach its own category', () => expect(classify({history:[row('target',{category_id:1})]}).summary.leave).toBe(1));
  test('already classified target is excluded', () => expect(classify({targets:[row('target',{category_id:2})]}).actions).toEqual([]));
  test('unknown empty or invalid descriptions remain null', () => expect(classify({targets:[row('target',{descripcion:'  '})]}).summary.leave).toBe(1));
  test('inputs and existing classifications are immutable', () => {const input={targets:[row('target')],history:[row('old',{category_id:1})],categories:[category(1)]}; const before=JSON.stringify(input);planHistoryClassification(input);expect(JSON.stringify(input)).toBe(before)});
});

function setup(options={}) {
  const rows = (options.rows || [row('manual',{category_id:1}),row('target')]).map(value=>({...value}));
  const mappings = (options.mappings || [{external_id:'mov_target',account_id:ACCOUNT,checking_transaction_id:'target',created_checking:true}]).map(value=>({descripcion:'Pago:Servicio Ficticio 1234',...value}));
  const categories = (options.categories || [category(1)]).map(value=>({...value}));
  const calls=[];
  const query=jest.fn(async(sql,params=[])=>{
    calls.push({sql,params});
    if (/FROM checking_transactions/.test(sql)) return {rows:rows.map(value=>({...value}))};
    if (/FROM fintoc_external_movements/.test(sql)) return {rows:mappings.map(value=>({...value}))};
    if (/FROM categories/.test(sql)) return {rows:categories.map(value=>({...value}))};
    if (/UPDATE checking_transactions/.test(sql)) {
      if(options.failUpdate)throw new Error('PRIVATE account failure');
      const target=rows.find(value=>value.user_id===params[0]&&value.id===params[1]&&value.category_id===null);
      if(options.zeroRows||!target)return{rows:[],rowCount:0};
      target.category_id=params[2];target.updated_at=params[3];
      if(options.mutateNote)target.notas='UNEXPECTED';
      if(options.mutateOther)rows[0].notas='UNEXPECTED';
      if(options.addUnexpected)rows.push(row('unexpected'));
      return{rows:[{id:target.id}],rowCount:1};
    }
    return{rows:[]};
  });
  const client={query,release:jest.fn()},db={connect:jest.fn().mockResolvedValue(client)};
  const env={FINTOC_OWNER_USER_ID:OWNER,FINTOC_ACCOUNT_ID:ACCOUNT};
  const service=createFintocHistoryClassificationService({db,env,now:()=>new Date('2026-11-01T16:00:00Z')});
  return{service,db,client,calls,rows,mappings,categories,env};
}

describe('reviewed classification transaction',()=>{
 test('preview is deterministic, read-only, and uses shared lock',async()=>{const s=setup();const p=await s.service.preview(OWNER);expect(p).toEqual(await s.service.preview(OWNER));expect(p.digest).toMatch(/^[a-f0-9]{64}$/);expect(p.summary).toEqual({classify:1,leave:0});expect(s.calls.some(c=>/^(UPDATE|INSERT|DELETE)/.test(c.sql))).toBe(false);expect(s.calls.some(c=>c.sql.includes('pg_advisory_xact_lock'))).toBe(true)});
 test('owner mismatch fails before connecting',async()=>{const s=setup();await expect(s.service.preview(OTHER)).rejects.toMatchObject({code:'FINTOC_CLASSIFICATION_FORBIDDEN'});expect(s.db.connect).not.toHaveBeenCalled()});
 test('account configuration is required',async()=>{const s=setup();delete s.env.FINTOC_ACCOUNT_ID;await expect(s.service.preview(OWNER)).rejects.toMatchObject({code:'FINTOC_CLASSIFICATION_FORBIDDEN'})});
 test('only own configured imported NULL targets are selected',async()=>{const s=setup({rows:[row('manual',{category_id:1}),row('target'),row('other_account'),row('already',{category_id:1})],mappings:[{external_id:'mov_target',account_id:ACCOUNT,checking_transaction_id:'target',created_checking:true},{external_id:'mov_else',account_id:'acc_other',checking_transaction_id:'other_account',created_checking:true},{external_id:'mov_already',account_id:ACCOUNT,checking_transaction_id:'already',created_checking:true}]});expect((await s.service.preview(OWNER)).actions.map(a=>a.checkingId)).toEqual(['target'])});
 test('imported classifications from every account are excluded from learning',async()=>{const s=setup({rows:[row('inferred',{category_id:1}),row('target')],mappings:[{external_id:'mov_target',account_id:ACCOUNT,checking_transaction_id:'target',created_checking:true},{external_id:'mov_old',account_id:'acc_other',checking_transaction_id:'inferred',created_checking:true}]});expect((await s.service.preview(OWNER)).summary).toEqual({classify:0,leave:1})});
 test('mapping full description prevents classifying an ambiguous truncated target',async()=>{const description='a'.repeat(60);const s=setup({rows:[row('manual',{category_id:1,descripcion:description}),row('target',{descripcion:description})],mappings:[{external_id:'mov_target',account_id:ACCOUNT,checking_transaction_id:'target',created_checking:true,descripcion:description+' unknown suffix'}]});expect((await s.service.preview(OWNER)).summary).toEqual({classify:0,leave:1})});
 test('apply changes only planned category and updated timestamp',async()=>{const s=setup();const before=JSON.stringify(s.rows[0]),p=await s.service.preview(OWNER);const r=await s.service.apply(OWNER,{digest:p.digest});expect(r).toMatchObject({status:'success',classified:1,left:0});expect(s.rows[1]).toMatchObject({category_id:1,updated_at:'2026-11-01T16:00:00.000Z',notas:'Nota protegida',amount:'12345.00'});expect(JSON.stringify(s.rows[0])).toBe(before);expect(s.calls.filter(c=>/^(UPDATE|INSERT|DELETE)/.test(c.sql))).toHaveLength(1);expect(s.calls.some(c=>/FROM checking_transactions[\s\S]*FOR UPDATE/.test(c.sql))).toBe(true)});
 test('manual classification between preview/apply invalidates plan',async()=>{const s=setup();const p=await s.service.preview(OWNER);s.rows[1].category_id=2;await expect(s.service.apply(OWNER,{digest:p.digest})).rejects.toMatchObject({code:'FINTOC_CLASSIFICATION_STALE_PLAN'});expect(s.rows[1].category_id).toBe(2)});
 test('historical category changes invalidate plan',async()=>{const s=setup();const p=await s.service.preview(OWNER);s.rows[0].category_id=2;await expect(s.service.apply(OWNER,{digest:p.digest})).rejects.toMatchObject({code:'FINTOC_CLASSIFICATION_STALE_PLAN'})});
 test('raw SQL precision participates in stale detection',async()=>{const s=setup();s.rows[0].immutable_snapshot='timestamp.123456';const p=await s.service.preview(OWNER);s.rows[0].immutable_snapshot='timestamp.123457';await expect(s.service.apply(OWNER,{digest:p.digest})).rejects.toMatchObject({code:'FINTOC_CLASSIFICATION_STALE_PLAN'})});
 test('category definition changes invalidate plan',async()=>{const s=setup();const p=await s.service.preview(OWNER);s.categories[0].name='Changed';await expect(s.service.apply(OWNER,{digest:p.digest})).rejects.toMatchObject({code:'FINTOC_CLASSIFICATION_STALE_PLAN'})});
 test.each([undefined,'bad','a'.repeat(63)])('invalid digest %s is rejected before connecting',async digest=>{const s=setup();await expect(s.service.apply(OWNER,{digest})).rejects.toMatchObject({code:'FINTOC_CLASSIFICATION_INVALID_PLAN'});expect(s.db.connect).not.toHaveBeenCalled()});
 test('update failure rolls back without exposing raw errors',async()=>{const s=setup({failUpdate:true}),p=await s.service.preview(OWNER);await expect(s.service.apply(OWNER,{digest:p.digest})).rejects.toMatchObject({code:'FINTOC_CLASSIFICATION_STORAGE_ERROR'});expect(s.calls.some(c=>c.sql==='ROLLBACK')).toBe(true)});
 test('zero row count aborts instead of silently overwriting human decision',async()=>{const s=setup({zeroRows:true}),p=await s.service.preview(OWNER);await expect(s.service.apply(OWNER,{digest:p.digest})).rejects.toMatchObject({code:'FINTOC_CLASSIFICATION_INTEGRITY'})});
 test.each(['mutateNote','mutateOther','addUnexpected'])('unexpected financial change %s aborts before commit',async option=>{const s=setup({[option]:true}),p=await s.service.preview(OWNER);await expect(s.service.apply(OWNER,{digest:p.digest})).rejects.toMatchObject({code:'FINTOC_CLASSIFICATION_INTEGRITY'});expect(s.calls.filter(c=>c.sql==='COMMIT')).toHaveLength(1)});
 test('second preview has no assignments and old apply is stale',async()=>{const s=setup(),p=await s.service.preview(OWNER);await s.service.apply(OWNER,{digest:p.digest});expect((await s.service.preview(OWNER)).summary.classify).toBe(0);await expect(s.service.apply(OWNER,{digest:p.digest})).rejects.toMatchObject({code:'FINTOC_CLASSIFICATION_STALE_PLAN'})});
 test('rows and mappings reordered do not change digest',async()=>{const s=setup();const p=await s.service.preview(OWNER);s.rows.reverse();s.mappings.reverse();expect((await s.service.preview(OWNER)).digest).toBe(p.digest)});
});
