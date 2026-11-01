const { withCheckingWriteTransaction } = require('../withCheckingWriteTransaction');

function setup() {
  const client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
  const pool = { connect: jest.fn().mockResolvedValue(client), query: jest.fn() };
  return { client, pool };
}

test('reserves one client, locks the owner before callback and commits the result', async () => {
  const { client, pool } = setup();
  const callback = jest.fn(async (connection) => {
    expect(connection).toBe(client);
    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(client.query.mock.calls[1][0]).toMatch(/pg_advisory_xact_lock\(hashtext\('checking-write'\),\s*hashtext\(\$1\)\)/);
    expect(client.query.mock.calls[1][1]).toEqual(['owner-1']);
    await connection.query('SELECT $1', ['value']);
    return { inserted: 1 };
  });
  await expect(withCheckingWriteTransaction(pool, 'owner-1', callback)).resolves.toEqual({ inserted: 1 });
  expect(pool.connect).toHaveBeenCalledTimes(1);
  expect(client.query.mock.calls.at(-1)).toEqual(['COMMIT']);
  expect(client.release).toHaveBeenCalledTimes(1);
  expect(pool.query).not.toHaveBeenCalled();
});

test('accepts the project database wrapper with pool', async () => {
  const { client, pool } = setup();
  await withCheckingWriteTransaction({ pool, query: jest.fn() }, 'owner-2', async () => 7);
  expect(client.query.mock.calls[1][1]).toEqual(['owner-2']);
  expect(client.release).toHaveBeenCalledTimes(1);
});

test.each(['callback', 'lock', 'commit'])('rolls back and releases on %s failure without replacing the error', async (stage) => {
  const { client, pool } = setup();
  const original = new Error('Synthetic failure');
  if (stage === 'lock') client.query.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(original);
  if (stage === 'commit') client.query.mockImplementation(sql => sql === 'COMMIT' ? Promise.reject(original) : Promise.resolve({ rows: [] }));
  const callback = jest.fn(async () => { if (stage === 'callback') throw original; return 9; });
  await expect(withCheckingWriteTransaction(pool, 'owner-1', callback)).rejects.toBe(original);
  expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  expect(client.release).toHaveBeenCalledTimes(1);
});

test('rollback failure does not mask callback error', async () => {
  const { client, pool } = setup();
  const original = new Error('Synthetic callback failure');
  client.query.mockImplementation(sql => sql === 'ROLLBACK' ? Promise.reject(new Error('Rollback failure')) : Promise.resolve({ rows: [] }));
  await expect(withCheckingWriteTransaction(pool, 'owner-1', async () => { throw original; })).rejects.toBe(original);
  expect(client.release).toHaveBeenCalledTimes(1);
});

test('BEGIN failure releases without running callback', async () => {
  const { client, pool } = setup();
  const original = new Error('Synthetic BEGIN failure');
  client.query.mockRejectedValueOnce(original);
  const callback = jest.fn();
  await expect(withCheckingWriteTransaction(pool, 'owner-1', callback)).rejects.toBe(original);
  expect(callback).not.toHaveBeenCalled();
  expect(client.release).toHaveBeenCalledTimes(1);
});

test.each(['', undefined, null, 2])('invalid owner %j never reserves a database connection', async (owner) => {
  const { pool } = setup();
  await expect(withCheckingWriteTransaction(pool, owner, jest.fn())).rejects.toThrow();
  expect(pool.connect).not.toHaveBeenCalled();
});
