jest.mock('../../config/database', () => { throw new Error('Controller loaded database eagerly'); });
const { createFintocDailyController } = require('../fintocDailyController');

function response() {
  const res = { statusCode: 200 };
  res.status = jest.fn(code => { res.statusCode = code; return res; });
  res.json = jest.fn(data => { res.data = data; return res; });
  return res;
}

test('importing the controller and constructing it never load the database', () => {
  expect(createFintocDailyController()).toEqual(expect.objectContaining({ getDailyStatus: expect.any(Function), getReview: expect.any(Function) }));
});

test('status passes the real actor to a lazy service without triggering its runner', async () => {
  const data = { provider: 'fintoc', enabled: true, schedule: '07:00', timezone: 'America/Santiago', state: 'not_initialized' };
  const service = { getDailyStatus: jest.fn().mockResolvedValue(data), run: jest.fn() };
  const getService = jest.fn(() => service);
  const controller = createFintocDailyController({ getService });
  const res = response();
  expect(getService).not.toHaveBeenCalled();
  await controller.getDailyStatus({ actorId: 'actual-owner', user: { id: 'effective-owner' }, query: {} }, res);
  expect(service.getDailyStatus).toHaveBeenCalledWith('actual-owner');
  expect(service.run).not.toHaveBeenCalled();
  expect(res.data).toEqual(data);
});

test('status rejects all query parameters before constructing a database-backed service', async () => {
  const getService = jest.fn();
  const res = response();
  await createFintocDailyController({ getService }).getDailyStatus({ actorId: 'owner', query: { refresh: 'true' } }, res);
  expect(res.statusCode).toBe(400);
  expect(res.data.code).toBe('FINTOC_DAILY_INVALID_QUERY');
  expect(getService).not.toHaveBeenCalled();
});

test('review delegates pagination to the read-only engine and never invokes run', async () => {
  const data = { items: [], total: 0, limit: 20, offset: 0 };
  const service = { getReview: jest.fn().mockResolvedValue(data), run: jest.fn() };
  const res = response();
  await createFintocDailyController({ getService: () => service }).getReview({ actorId: 'owner', query: { limit: '20', offset: '0' } }, res);
  expect(service.getReview).toHaveBeenCalledWith('owner', { limit: '20', offset: '0' });
  expect(service.run).not.toHaveBeenCalled();
  expect(res.data).toEqual(data);
});

test.each([
  [{ status: 403, code: 'FINTOC_DAILY_FORBIDDEN', message: 'raw secret sk_live_privateExample' }, 403, 'FINTOC_DAILY_FORBIDDEN'],
  [{ status: 400, code: 'FINTOC_DAILY_INVALID_QUERY', message: 'link_token=privateExample' }, 400, 'FINTOC_DAILY_INVALID_QUERY'],
  [new Error('raw secret privateExample'), 500, 'FINTOC_DAILY_INTERNAL_ERROR'],
])('daily errors return stable safe codes without raw provider/storage details', async (error, status, code) => {
  const service = { getDailyStatus: jest.fn().mockRejectedValue(error) };
  const res = response();
  await createFintocDailyController({ getService: () => service }).getDailyStatus({ actorId: 'owner', query: {} }, res);
  expect(res.statusCode).toBe(status);
  expect(res.data.code).toBe(code);
  expect(JSON.stringify(res.data)).not.toMatch(/privateExample|sk_live_|link_token/);
});
