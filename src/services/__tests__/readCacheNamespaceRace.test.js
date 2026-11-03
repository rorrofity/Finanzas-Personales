/** A delayed IndexedDB connection must not move a read/write into another household. */
jest.mock('idb', () => ({ openDB: jest.fn() }));

let cache, setActiveSpaceOwner, database, releaseDatabase;
const key = 'financial-health:v1:fixture-user:fixture-owner:2026:11';
const namespace = owner => `${owner || 'own'}::${key}`;

beforeEach(() => {
  jest.resetModules();
  ({ setActiveSpaceOwner } = require('../activeSpace'));
  const entries = new Map();
  database = {
    get: jest.fn(async (_store, entryKey) => entries.get(entryKey)),
    put: jest.fn(async (_store, value, entryKey) => { entries.set(entryKey, value); }),
    entries,
  };
  const connection = new Promise(resolve => { releaseDatabase = () => resolve(database); });
  require('idb').openDB.mockReturnValue(connection);
  cache = require('../readCache');
});

afterEach(() => setActiveSpaceOwner(null));

test.each([null, 'fixture-owner-a'])('cacheRead keeps its starting namespace %s while IndexedDB opens', async startingOwner => {
  setActiveSpaceOwner(startingOwner);
  const data = { marker: 'original household fixture' };
  const pending = cache.cacheRead(key, data);
  setActiveSpaceOwner('fixture-owner-b');
  releaseDatabase();
  await pending;

  expect(database.put).toHaveBeenCalledTimes(1);
  expect(database.put).toHaveBeenCalledWith('readCache', { data, cachedAt: expect.any(Number) }, namespace(startingOwner));
  expect(database.entries.get(namespace(startingOwner)).data).toEqual(data);
  expect(database.entries.has(namespace('fixture-owner-b'))).toBe(false);
});

describe.each(['getCachedRead', 'getCachedEntry'])('%s', method => {
  test.each([null, 'fixture-owner-a'])('reads the starting namespace %s when the active household changes before IndexedDB opens', async startingOwner => {
    const original = { data: { marker: 'original household fixture' }, cachedAt: 100 };
    const other = { data: { marker: 'another household fixture' }, cachedAt: 200 };
    database.entries.set(namespace(startingOwner), original);
    database.entries.set(namespace('fixture-owner-b'), other);
    setActiveSpaceOwner(startingOwner);
    const pending = cache[method](key);
    setActiveSpaceOwner('fixture-owner-b');
    releaseDatabase();
    const result = await pending;

    expect(result).toEqual(method === 'getCachedEntry' ? original : original.data);
    expect(database.get).toHaveBeenCalledTimes(1);
    expect(database.get).toHaveBeenCalledWith('readCache', namespace(startingOwner));
    expect(database.put).not.toHaveBeenCalled();
  });
});
