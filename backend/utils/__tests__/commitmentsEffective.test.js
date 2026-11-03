jest.mock('../../config/database',()=>({query:jest.fn()}));
const db=require('../../config/database');
const {computeCommitments}=require('../commitments');
test('shared commitment calculation includes pure virtual projections with exact decimals',async()=>{
  db.query.mockImplementation(async sql=>{
    if(sql.includes('FROM transactions')||sql.includes('FROM installment_occurrences')||sql.includes('FROM intl_unbilled'))return{rows:[]};
    if(sql.includes('HFS_EFFECTIVE_PROJECTIONS'))return{rows:[{template_id:'one',monto:'0.10',nombre:'Uno',tipo:'gasto',active:true,virtual:true,fecha:'2026-11-02'},{template_id:'two',monto:'0.20',nombre:'Dos',tipo:'gasto',active:true,virtual:true,fecha:'2026-11-03'}]};
    throw Error('An incomplete occurrence-only query must not be used');
  });
  const result=await computeCommitments('owner',2026,11);
  expect(result.proyectados).toBe(0.3);expect(result.total).toBe(0.3);
  expect(db.query.mock.calls.every(([sql])=>/^SELECT/.test(sql.trim()))).toBe(true);
});
