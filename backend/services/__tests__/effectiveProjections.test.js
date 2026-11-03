const { effectiveProjectionsSql, listEffectiveProjections } = require('../effectiveProjectionsService');
test('shared relation contains stored rows, eligible missing templates and an owner-scoped anti-join', () => {
  const sql = effectiveProjectionsSql();
  expect(sql).toMatch(/UNION ALL/); expect(sql).toMatch(/NOT EXISTS/); expect(sql).toMatch(/start_year/); expect(sql).toMatch(/repeat_monthly/); expect(sql).toMatch(/make_date/);
  expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b/); expect(sql.match(/user_id\s*=\s*\$1/g).length).toBeGreaterThanOrEqual(2);
});
test('read helper queries owner/month with no mutations and returns stable virtual identities', async () => {
  const query = jest.fn().mockResolvedValue({ rows: [{ occurrence_id: null, template_id: 'fixture-template', fecha: '2028-02-29', nombre: 'Ficticio', tipo: 'gasto', monto: '0.30', category_id: null, active: true, virtual: true }] });
  const rows = await listEffectiveProjections('owner', 2028, 2, { query });
  expect(query).toHaveBeenCalledTimes(1); expect(query.mock.calls[0][1]).toEqual(['owner', 2028, 2]); expect(rows[0]).toMatchObject({ occurrence_id: 'virtual-fixture-template-2028-02', virtual: true });
});
