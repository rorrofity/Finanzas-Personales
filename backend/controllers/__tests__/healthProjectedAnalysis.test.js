jest.mock('../../config/database',()=>({query:jest.fn()}));
const db=require('../../config/database');
const {getCategoryBreakdown}=require('../dashboardController');
test('projected category analyses use the same effective active occurrences and missing templates as health',async()=>{
  db.query.mockResolvedValue({rows:[]});
  const res={json:jest.fn(),status:jest.fn().mockReturnThis()};
  await getCategoryBreakdown({user:{id:'owner'},query:{periodYear:'2026',periodMonth:'11',mode:'projected'}},res);
  expect(res.status).not.toHaveBeenCalled();
  const [sql,parameters]=db.query.mock.calls[0];
  expect(sql).toContain('HFS_EFFECTIVE_PROJECTIONS');expect(sql).toMatch(/projection\.active/);expect(sql).toMatch(/projection\.tipo\s*=\s*'gasto'/);expect(parameters).toEqual(['owner',2026,11]);
});
