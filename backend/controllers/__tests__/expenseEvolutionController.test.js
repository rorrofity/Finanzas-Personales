jest.mock('../../config/database', () => ({ query: jest.fn() }));
jest.mock('../../services/expenseEvolutionService', () => ({ getEvolution: jest.fn(), getTransactions: jest.fn() }));
jest.mock('../../models/SpaceMember', () => ({ findMembership: jest.fn() }));

const service = require('../../services/expenseEvolutionService');
const spaceMember = require('../../models/SpaceMember');
const { getExpenseEvolution, getExpenseTransactions } = require('../expenseEvolutionController');
const { generateToken } = require('../../middleware/auth');

const response = () => {
  const res = { statusCode: 200, data: undefined };
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn((data) => { res.data = data; return res; });
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = 'expense-evolution-unit-test-secret';
  service.getEvolution.mockResolvedValue({ scope: {}, categories: [] });
  service.getTransactions.mockResolvedValue({ total: 0, count: 0, transactions: [] });
});

test.each([
  ['evolution', getExpenseEvolution, 'getEvolution'],
  ['detail', getExpenseTransactions, 'getTransactions'],
])('%s forwards the resolved owner and original query to the read service', async (_, controller, method) => {
  const req = { user: { id: 'resolved-owner' }, actorId: 'member', query: { endYear: '2026', endMonth: '10' } };
  const res = response();
  await controller(req, res);
  expect(service[method]).toHaveBeenCalledWith('resolved-owner', req.query);
  expect(res.json).toHaveBeenCalledWith(await service[method].mock.results[0].value);
});

test.each([
  [getExpenseEvolution, 'getEvolution', 400], [getExpenseTransactions, 'getTransactions', 400],
  [getExpenseTransactions, 'getTransactions', 404],
])('preserves a safe validation/not-found status', async (controller, method, status) => {
  service[method].mockRejectedValue(Object.assign(new Error('Parámetros no válidos'), { status }));
  const res = response();
  await controller({ user: { id: 'owner' }, query: {} }, res);
  expect(res.status).toHaveBeenCalledWith(status);
  expect(res.json).toHaveBeenCalledWith({ error: 'Parámetros no válidos' });
});

test.each([[getExpenseEvolution, 'getEvolution'], [getExpenseTransactions, 'getTransactions']])('does not expose internal database errors or invent zero data', async (controller, method) => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  service[method].mockRejectedValue(new Error('private database failure'));
  const res = response();
  await controller({ user: { id: 'owner' }, query: {} }, res);
  expect(res.status).toHaveBeenCalledWith(500);
  expect(res.data.error).not.toMatch(/private database/);
  expect(res.data.transactions).toBeUndefined();
  log.mockRestore();
});

async function requestRoute(path, { actor, owner } = {}) {
  const router = require('../../routes/dashboardRoutes');
  const headers = {};
  if (actor) headers.authorization = `Bearer ${generateToken(actor)}`;
  if (owner) headers['x-space-owner'] = owner;
  const req = { method: 'GET', url: path, originalUrl: path, baseUrl: '', query: {}, headers, user: undefined, header: (name) => headers[name.toLowerCase()] };
  const res = response();
  await new Promise((resolve, reject) => {
    const json = res.json;
    res.json = jest.fn((data) => { json(data); resolve(); return res; });
    router.handle(req, res, (error) => { if (error) reject(error); else { res.statusCode = 404; resolve(); } });
  });
  return res;
}

describe.each(['/expense-evolution', '/expense-evolution/transactions'])('GET %s uses existing authentication and space checks', (path) => {
  test('rejects unauthenticated requests without reading expenses', async () => {
    const res = await requestRoute(path);
    expect(res.statusCode).toBe(401);
    expect(service.getEvolution).not.toHaveBeenCalled();
    expect(service.getTransactions).not.toHaveBeenCalled();
  });

  test('allows the owner to read their own space', async () => {
    const res = await requestRoute(path, { actor: 'owner' });
    expect(res.statusCode).toBe(200);
    expect(service.getEvolution.mock.calls.concat(service.getTransactions.mock.calls)[0][0]).toBe('owner');
  });

  test('allows a read-only member and resolves data to the owner', async () => {
    spaceMember.findMembership.mockResolvedValue({ can_edit: false, can_delete: false });
    const res = await requestRoute(path, { actor: 'member', owner: 'owner' });
    expect(res.statusCode).toBe(200);
    expect(spaceMember.findMembership).toHaveBeenCalledWith('owner', 'member');
    expect(service.getEvolution.mock.calls.concat(service.getTransactions.mock.calls)[0][0]).toBe('owner');
  });

  test('rejects revoked or unknown members before querying expenses', async () => {
    spaceMember.findMembership.mockResolvedValue(null);
    const res = await requestRoute(path, { actor: 'stranger', owner: 'owner' });
    expect(res.statusCode).toBe(403);
    expect(res.data.code).toBe('SPACE_FORBIDDEN');
    expect(service.getEvolution).not.toHaveBeenCalled();
    expect(service.getTransactions).not.toHaveBeenCalled();
  });
});
