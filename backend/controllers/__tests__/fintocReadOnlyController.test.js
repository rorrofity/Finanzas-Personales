jest.mock('../../config/database', () => ({ query: jest.fn() }));
jest.mock('../../models/SpaceMember', () => ({ findMembership: jest.fn() }));
jest.mock('axios', () => ({ get: jest.fn() }));

const axios = require('axios');
const db = require('../../config/database');
const spaceMember = require('../../models/SpaceMember');
const { generateToken } = require('../../middleware/auth');
const router = require('../../routes/fintocRoutes');
const originalEnv = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of Object.keys(process.env)) if (key.startsWith('FINTOC_')) delete process.env[key];
  process.env.JWT_SECRET = 'fintoc-unit-test-only-secret';
});
afterAll(() => { process.env = originalEnv; });

async function request(path, { actor, owner, method = 'GET' } = {}) {
  const headers = {};
  if (actor) headers.authorization = `Bearer ${generateToken(actor)}`;
  if (owner) headers['x-space-owner'] = owner;
  const query = Object.fromEntries(new URL(path, 'http://unit.test').searchParams);
  const req = { method, url: path, originalUrl: path, baseUrl: '', query, headers, header: (name) => headers[name.toLowerCase()] };
  const res = { statusCode: 200, headers: {} };
  res.setHeader = (name, value) => { res.headers[name.toLowerCase()] = value; return res; };
  res.set = res.setHeader;
  res.status = (status) => { res.statusCode = status; return res; };
  await new Promise((resolve, reject) => {
    res.json = (data) => { res.data = data; resolve(); return res; };
    router.handle(req, res, (error) => { if (error) reject(error); else { res.statusCode = 404; resolve(); } });
  });
  expect(axios.get).not.toHaveBeenCalled();
  expect(db.query).not.toHaveBeenCalled();
  expect(res.headers['cache-control']).toMatch(/no-store/);
  return res;
}

describe.each(['/status', '/preview?year=2026&month=10'])('Fintoc %s protects its private connection', (path) => {
  test('unauthenticated requests are rejected before any network or DB read', async () => {
    expect((await request(path)).statusCode).toBe(401);
  });
  test('a shared-space member cannot query the bank even when allowed to edit', async () => {
    spaceMember.findMembership.mockResolvedValue({ can_edit: true, can_delete: true });
    const res = await request(path, { actor: 'member', owner: 'owner' });
    expect(res.statusCode).toBe(403);
  });
  test('another owner cannot inspect the configured owner connection', async () => {
    process.env.FINTOC_OWNER_USER_ID = 'configured-owner';
    const res = await request(path, { actor: 'another-owner' });
    expect(res.statusCode).toBe(403);
    expect(res.data.code).toBe('FINTOC_FORBIDDEN');
  });
});

test('an owner without configuration sees a disabled local status', async () => {
  const res = await request('/status', { actor: 'owner' });
  expect(res.statusCode).toBe(200);
  expect(res.data).toMatchObject({ state: 'disabled', provider: 'fintoc', mode: null, readOnly: true, writesEnabled: false });
});

test('preview cannot execute before configuration is ready', async () => {
  const res = await request('/preview?year=2026&month=10', { actor: 'owner' });
  expect(res.statusCode).toBe(503);
  expect(res.data.code).toBe('FINTOC_NOT_READY');
});

test.each(['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])('%s cannot trigger any connection action', async (method) => {
  const res = await request('/preview?year=2026&month=10', { actor: 'owner', method });
  expect(res.statusCode).toBe(405);
  expect(res.headers.allow).toBe('GET');
});

test('unknown status parameters are rejected', async () => {
  const res = await request('/status?link_token=anything', { actor: 'owner' });
  expect(res.statusCode).toBe(400);
});
