const Checking = require('../Checking');

function setup(existing = []) {
  const client = {
    release: jest.fn(),
    query: jest.fn(async (sql, params) => {
      if (/SELECT fecha, amount, tipo, descripcion/.test(sql)) return { rows: existing };
      if (/INSERT INTO checking_transactions/.test(sql)) return { rows: [{ id: 'created-fixture', params }] };
      return { rows: [] };
    }),
  };
  const db = { query: jest.fn(), pool: { connect: jest.fn().mockResolvedValue(client) } };
  return { client, db, model: new Checking(db) };
}

beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

test('create inserts with unchanged category and notes on the owner-locked client', async () => {
  const { client, db, model } = setup();
  const data = { year: 2026, month: 10, fecha: '2026-10-15', descripcion: 'Fixture', tipo: 'cargo', amount: 1234, category_id: 8, notas: 'Keep notes' };
  const out = await model.create('owner-1', data);
  expect(out.id).toBe('created-fixture');
  expect(client.query.mock.calls[0]).toEqual(['BEGIN']);
  expect(client.query.mock.calls[1][0]).toMatch(/pg_advisory_xact_lock/);
  expect(client.query.mock.calls[1][1]).toEqual(['owner-1']);
  const insert = client.query.mock.calls.find(([sql]) => /INSERT INTO checking_transactions/.test(sql));
  expect(insert[1]).toEqual(['owner-1', 2026, 10, '2026-10-15', 'Fixture', 'cargo', 1234, 8, 'Keep notes']);
  expect(client.query.mock.calls.at(-1)).toEqual(['COMMIT']);
  expect(client.release).toHaveBeenCalledTimes(1);
  expect(db.query).not.toHaveBeenCalled();
});

test('bulkImport reads and writes on the same locked client and preserves existing dedup results', async () => {
  const { client, db, model } = setup([{ fecha: '2026-10-02', amount: '5000.00', tipo: 'cargo', descripcion: '  Existing   Fixture ' }]);
  const out = await model.bulkImport('owner-1', [
    { fecha: '2026-10-02', amount: 5000, tipo: 'cargo', descripcion: 'existing fixture' },
    { fecha: '2026-10-15', amount: -1234, tipo: 'abono', descripcion: 'New Fixture' },
    { fecha: '2026-10-15', amount: 1234, tipo: 'abono', descripcion: ' new   fixture ' },
    { fecha: '', amount: 7, tipo: 'cargo', descripcion: 'Invalid fixture' },
  ]);
  expect(out).toEqual({ inserted: 1, skipped: 3 });
  expect(client.query.mock.calls[0]).toEqual(['BEGIN']);
  expect(client.query.mock.calls[1][0]).toMatch(/pg_advisory_xact_lock/);
  expect(client.query.mock.calls[1][1]).toEqual(['owner-1']);
  const selectIndex = client.query.mock.calls.findIndex(([sql]) => /SELECT fecha, amount, tipo, descripcion/.test(sql));
  expect(selectIndex).toBeGreaterThan(1);
  expect(client.query.mock.calls[selectIndex][1]).toEqual(['owner-1']);
  const inserts = client.query.mock.calls.filter(([sql]) => /INSERT INTO checking_transactions/.test(sql));
  expect(inserts).toHaveLength(1);
  expect(inserts[0][1]).toEqual(['owner-1', 2026, 10, '2026-10-15', 'New Fixture', 'abono', 1234]);
  expect(client.query.mock.calls.at(-1)).toEqual(['COMMIT']);
  expect(client.release).toHaveBeenCalledTimes(1);
  expect(db.query).not.toHaveBeenCalled();
});

test('bulkImport rolls back rather than leaving a partial set if an insertion fails', async () => {
  const { client, model } = setup();
  const original = new Error('Synthetic insert failure');
  const defaultQuery = client.query.getMockImplementation();
  client.query.mockImplementation((sql, params) => /INSERT INTO checking_transactions/.test(sql) ? Promise.reject(original) : defaultQuery(sql, params));
  await expect(model.bulkImport('owner-1', [{ fecha: '2026-10-15', amount: 1234, tipo: 'cargo', descripcion: 'Fixture' }])).rejects.toBe(original);
  expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  expect(client.release).toHaveBeenCalledTimes(1);
});
