import axios from '../../config/axios';
import { cacheRead, getCachedEntry } from '../readCache';
import { readFinancialHealth } from '../financialHealth';
jest.mock('../../config/axios', () => ({ get: jest.fn() }));
jest.mock('../readCache', () => ({ cacheRead: jest.fn(), getCachedEntry: jest.fn() }));
const scope = { userId: 'reader', ownerId: 'household', year: 2026, month: 11 };
beforeEach(() => {
  jest.clearAllMocks(); Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  getCachedEntry.mockResolvedValue(null); cacheRead.mockResolvedValue();
});
test('consulta solo el resumen guardado con período, timeout y cancelación', async () => {
  const data = { generatedAt: '2026-11-02T22:00:00Z' }, controller = new AbortController(); axios.get.mockResolvedValue({ data });
  expect(await readFinancialHealth(scope, { signal: controller.signal })).toMatchObject({ data, origin: 'network', stale: false });
  expect(axios.get).toHaveBeenCalledWith('/api/financial-health/summary', expect.objectContaining({ params: { year: 2026, month: 11 }, timeout: 15000, signal: controller.signal }));
  expect(cacheRead).toHaveBeenCalledWith('financial-health:v1:reader:household:2026:11', data);
});
test('caché separada por lector, hogar y período', async () => {
  axios.get.mockResolvedValue({ data: {} });
  for (const item of [scope, { ...scope, userId: 'other' }, { ...scope, ownerId: 'other' }, { ...scope, month: 12 }]) await readFinancialHealth(item);
  expect(new Set(cacheRead.mock.calls.map(([key]) => key)).size).toBe(4);
});
test('offline identifica copia y fecha sin ejecutar consultas', async () => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false }); getCachedEntry.mockResolvedValue({ data: { checking: { currentBalance: 42 } }, cachedAt: 1000 });
  expect(await readFinancialHealth(scope)).toMatchObject({ origin: 'cache', stale: true, cachedAt: 1000 }); expect(axios.get).not.toHaveBeenCalled();
});
test('offline sin copia no inventa ceros', async () => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  await expect(readFinancialHealth(scope)).rejects.toMatchObject({ code: 'OFFLINE_MISS' });
});
test.each([401, 403, 400])('rechazo %s prevalece sobre caché', async status => {
  axios.get.mockRejectedValue({ response: { status } }); getCachedEntry.mockResolvedValue({ data: { old: true }, cachedAt: 1 });
  await expect(readFinancialHealth(scope)).rejects.toMatchObject({ response: { status } }); expect(getCachedEntry).not.toHaveBeenCalled();
});
test('fallo de conexión conserva metadata original de copia', async () => {
  axios.get.mockRejectedValue(new Error('Network error')); getCachedEntry.mockResolvedValue({ data: { old: true }, cachedAt: 1 });
  expect(await readFinancialHealth(scope)).toMatchObject({ data: { old: true }, origin: 'cache', stale: true, cachedAt: 1 });
});
test('respuesta de una consulta cancelada no almacena datos', async () => {
  const controller = new AbortController(); axios.get.mockImplementation(async () => { controller.abort(); return { data: {} }; });
  await expect(readFinancialHealth(scope, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' }); expect(cacheRead).not.toHaveBeenCalled();
});
test('cambio de hogar durante respuesta impide mostrar o cachear el resultado', async () => {
  let current = true; axios.get.mockImplementation(async () => { current = false; return { data: { old: true } }; });
  await expect(readFinancialHealth(scope, { isCurrent: () => current })).rejects.toMatchObject({ name: 'AbortError' }); expect(cacheRead).not.toHaveBeenCalled();
});
