jest.mock('../../config/database',()=>({query:jest.fn()}));
const db=require('../../config/database');const {computeCommitments}=require('../commitments');
function setup(intl=[{brand:'visa',total:'300',conversion_pending_count:'2'},{brand:'mastercard',total:null,conversion_pending_count:'1'}]){db.query.mockImplementation(async sql=>{
 if(sql.includes('FROM transactions'))return{rows:[{network:'visa',tipo:'gasto',total:'1000'},{network:'visa',tipo:'pago',total:'200'},{network:'mastercard',tipo:'gasto',total:'500'}]};
 if(sql.includes('FROM installment_occurrences'))return{rows:[{brand:'visa',total:'100'}]};
 if(sql.includes('FROM intl_unbilled'))return{rows:intl};
 if(sql.includes('FROM projected_occurrences'))return{rows:[{tipo:'gasto',monto:'50'},{tipo:'ingreso',monto:'100'}]};throw Error('Unexpected SQL');
});}
test('commitments identifies native USD awaiting conversion while preserving existing sums',async()=>{setup();const r=await computeCommitments('owner',2030,6);expect(r).toEqual({tcNoFacturado:1500,cuotas:100,intl:300,proyectados:50,total:1750,conversionPendingCount:3,amountsPartial:true});expect(db.query).toHaveBeenCalledTimes(4);const [sql,p]=db.query.mock.calls.find(([sql])=>sql.includes('FROM intl_unbilled'));expect(sql).toMatch(/COUNT\(\*\) FILTER\s*\(WHERE amount_clp IS NULL\)/);expect(sql).toContain("tipo = 'gasto'");expect(p).toEqual(['owner',2030,6]);expect(db.query.mock.calls.every(([sql])=>!/(INSERT|UPDATE|DELETE)/.test(sql))).toBe(true)});
test.each([{rows:[]},{rows:[{brand:'visa',total:'300',conversion_pending_count:'0'}]},{rows:[{brand:'visa',total:'300'}]}])('complete or legacy result %j defaults to nonpartial zero',async({rows})=>{setup(rows);expect(await computeCommitments('owner',2030,6)).toMatchObject({conversionPendingCount:0,amountsPartial:false})});
