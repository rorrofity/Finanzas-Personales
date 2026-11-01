jest.mock('../../config/database',()=>({query:jest.fn()}));
const db=require('../../config/database');const {getSummary}=require('../financialHealthController');
const res=()=>({json:jest.fn(),status:jest.fn().mockReturnThis()});
function setup(intl=[{brand:'visa',total:'300',conversion_pending_count:'2'},{brand:'mastercard',total:null,conversion_pending_count:'1'}]){db.query.mockImplementation(async sql=>{
 if(sql.includes('FROM checking_balances'))return{rows:[{saldo_actual:'10000'}]};
 if(sql.includes('FROM transactions'))return{rows:[{network:'visa',tipo:'gasto',total:'1000'},{network:'visa',tipo:'pago',total:'200'},{network:'mastercard',tipo:'gasto',total:'500'}]};
 if(sql.includes('FROM installment_occurrences'))return{rows:[{brand:'visa',total:'100'}]};
 if(sql.includes('FROM intl_unbilled'))return{rows:intl};
 if(sql.includes('FROM projected_occurrences'))return{rows:[{tipo:'gasto',nombre:'Fijo ficticio',monto:'50'},{tipo:'ingreso',nombre:'Ingreso ficticio',monto:'100'}]};throw Error('Unexpected SQL');
});}
test('health summary exposes partial conversion count without changing financial amounts or queries',async()=>{setup();const response=res();await getSummary({user:{id:'owner'},query:{year:'2030',month:'6'}},response);expect(response.status).not.toHaveBeenCalled();const r=response.json.mock.calls[0][0];expect(r.summary).toMatchObject({totalCommitments:1750,projectedBalance:8350,conversionPendingCount:3,amountsPartial:true});expect(r.creditCards.visa.total).toBe(1200);expect(r.creditCards.mastercard.total).toBe(500);expect(db.query).toHaveBeenCalledTimes(5);const [sql,p]=db.query.mock.calls.find(([sql])=>sql.includes('FROM intl_unbilled'));expect(sql).toMatch(/COUNT\(\*\) FILTER\s*\(WHERE amount_clp IS NULL\)/);expect(sql).toContain("tipo = 'gasto'");expect(p).toEqual(['owner',2030,6]);expect(db.query.mock.calls.every(([sql])=>!/(INSERT|UPDATE|DELETE)/.test(sql))).toBe(true)});
test.each([{rows:[]},{rows:[{brand:'visa',total:'300',conversion_pending_count:'0'}]},{rows:[{brand:'visa',total:'300'}]}])('health result %j defaults to complete zero',async({rows})=>{setup(rows);const response=res();await getSummary({user:{id:'owner'},query:{year:'2030',month:'6'}},response);expect(response.json.mock.calls[0][0].summary).toMatchObject({conversionPendingCount:0,amountsPartial:false})});
