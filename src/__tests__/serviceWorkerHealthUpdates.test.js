const mockEvents = {};
jest.mock('workbox-core', () => ({ clientsClaim: jest.fn() }));
jest.mock('workbox-precaching', () => ({ precacheAndRoute: jest.fn(), createHandlerBoundToURL: () => () => {} }));
jest.mock('workbox-routing', () => ({ registerRoute: jest.fn(), NavigationRoute: class {} }));
jest.mock('workbox-strategies', () => ({ NetworkOnly: class {}, NetworkFirst: class {}, CacheFirst: class {}, StaleWhileRevalidate: class {} }));
jest.mock('workbox-cacheable-response', () => ({ CacheableResponsePlugin: class {} }));
jest.mock('workbox-expiration', () => ({ ExpirationPlugin: class {} }));
beforeEach(() => {
  Object.keys(mockEvents).forEach(key => delete mockEvents[key]);
  jest.spyOn(self, 'addEventListener').mockImplementation((name, callback) => { mockEvents[name] = callback; });
  jest.isolateModules(() => require('../service-worker'));
});
afterEach(() => jest.restoreAllMocks());
test('activar retira solo copias legacy de salud y saldo actual', async () => {
  const requests = ['/api/financial-health/summary?year=2026&month=11', '/api/checking/global-balance', '/api/transactions'].map(path => ({ url: 'https://fixture.invalid' + path }));
  const cache = { keys: jest.fn().mockResolvedValue(requests), delete: jest.fn().mockResolvedValue(true) };
  Object.defineProperty(global, 'caches', { configurable: true, value: { has: jest.fn().mockResolvedValue(true), open: jest.fn().mockResolvedValue(cache) } });
  expect(mockEvents.activate).toEqual(expect.any(Function));
  const event = { waitUntil: jest.fn() }; mockEvents.activate(event); await event.waitUntil.mock.calls[0][0];
  expect(cache.delete.mock.calls).toEqual([[requests[0]], [requests[1]]]);
});
test('push conserva el aviso y comunica invalidación sin importes a ventanas abiertas', async () => {
  const client = { postMessage: jest.fn() }, showNotification = jest.fn().mockResolvedValue();
  Object.defineProperty(self, 'registration', { configurable: true, value: { showNotification } });
  Object.defineProperty(self, 'clients', { configurable: true, value: { matchAll: jest.fn().mockResolvedValue([client]) } });
  const event = { data: { json: () => ({ title: 'Fixture', body: 'Fixture message', url: '/transactions' }) }, waitUntil: jest.fn() };
  mockEvents.push(event); await event.waitUntil.mock.calls[0][0];
  expect(showNotification).toHaveBeenCalledWith('Fixture', expect.objectContaining({ body: 'Fixture message', tag: 'sync-summary' }));
  expect(client.postMessage).toHaveBeenCalledWith({ type: 'FINANCIAL_DATA_CHANGED' });
});
test('un fallo en la señal a ventanas no impide mostrar el aviso push', async () => {
  const showNotification = jest.fn().mockResolvedValue();
  Object.defineProperty(self, 'registration', { configurable: true, value: { showNotification } });
  Object.defineProperty(self, 'clients', { configurable: true, value: { matchAll: jest.fn().mockRejectedValue(new Error('Fixture closed windows')) } });
  const event = { data: { json: () => ({ title: 'Fixture' }) }, waitUntil: jest.fn() }; mockEvents.push(event);
  await expect(event.waitUntil.mock.calls[0][0]).resolves.toEqual(expect.any(Array)); expect(showNotification).toHaveBeenCalledTimes(1);
});
