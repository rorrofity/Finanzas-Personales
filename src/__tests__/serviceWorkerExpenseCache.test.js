const mockRoutes = [];

jest.mock('workbox-core', () => ({ clientsClaim: () => {} }));
jest.mock('workbox-precaching', () => ({ precacheAndRoute: () => {}, createHandlerBoundToURL: () => () => {} }));
jest.mock('workbox-routing', () => ({
  registerRoute: (match, handler, method = 'GET') => mockRoutes.push({ match, handler, method }),
  NavigationRoute: class NavigationRoute {},
}));
jest.mock('workbox-strategies', () => ({
  NetworkOnly: class NetworkOnly { constructor() { this.strategy = 'NetworkOnly'; } },
  NetworkFirst: class NetworkFirst { constructor() { this.strategy = 'NetworkFirst'; } },
  CacheFirst: class CacheFirst {},
  StaleWhileRevalidate: class StaleWhileRevalidate {},
}));
jest.mock('workbox-cacheable-response', () => ({ CacheableResponsePlugin: class CacheableResponsePlugin {} }));
jest.mock('workbox-expiration', () => ({ ExpirationPlugin: class ExpirationPlugin {} }));

function routeFor(path, method = 'GET') {
  return mockRoutes.find((route) => route.method === method && typeof route.match === 'function'
    && route.match({ url: new URL(path, 'https://finanzas.example.invalid'), request: { method, destination: '' } }));
}

beforeEach(() => {
  mockRoutes.length = 0;
  jest.isolateModules(() => require('../service-worker'));
});

test.each(['/api/dashboard/expense-evolution', '/api/dashboard/expense-evolution/transactions', '/api/dashboard/overview'])('%s evita caché por URL compartida y delega en caché aislada por identidad', (path) => {
  expect(routeFor(path).handler.strategy).toBe('NetworkOnly');
});

test('conserva la estrategia existente para otras lecturas API', () => {
  expect(routeFor('/api/transactions').handler.strategy).toBe('NetworkFirst');
});

test.each(['/api/checking/fintoc', '/api/checking/fintoc/status', '/api/checking/fintoc/preview?year=2026&month=10'])('%s consulta Fintoc solo por red y nunca comparte movimientos mediante caché offline', (path) => {
  expect(routeFor(path).handler.strategy).toBe('NetworkOnly');
});

test('Fintoc no registra escrituras y conserva otras lecturas de cuenta corriente', () => {
  expect(routeFor('/api/checking/fintoc/preview', 'POST')).toBeUndefined();
  expect(routeFor('/api/checking/fintoc-other').handler.strategy).toBe('NetworkFirst');
  expect(routeFor('/api/checking/global-balance').handler.strategy).toBe('NetworkFirst');
});

test('no registra escrituras del dashboard ni otro prefijo parecido', () => {
  expect(routeFor('/api/dashboard/expense-evolution', 'POST')).toBeUndefined();
  expect(routeFor('/api/dashboard/expense-evolution-other').handler.strategy).toBe('NetworkFirst');
});

test.each(['/api/card-statements', '/api/card-statements?year=2030&month=5', '/api/card-statements/11111111-1111-4111-8111-111111111111'])('%s mantiene estados de tarjetas fuera de la caché offline', path => {
  expect(routeFor(path).handler.strategy).toBe('NetworkOnly');
});
test('los estados no registran ni encolan escrituras; prefijos parecidos siguen su estrategia previa', () => {
  expect(routeFor('/api/card-statements/ingest', 'POST')).toBeUndefined();
  expect(routeFor('/api/card-statements-other').handler.strategy).toBe('NetworkFirst');
});
