/* eslint-disable no-restricted-globals */
/**
 * Service Worker (CRA InjectManifest + Workbox).
 *
 * Estrategia (Req 9.1, 9.5):
 *  - Precache del App Shell (self.__WB_MANIFEST inyectado por el build).
 *  - Navegación SPA: App Shell servido offline.
 *  - Estáticos (JS/CSS/imágenes): StaleWhileRevalidate / CacheFirst.
 *  - API GET (lectura): NetworkFirst con fallback a caché (consulta offline).
 *  - API de ESCRITURA (POST/PUT/DELETE): NUNCA se cachea ni encola
 *    (no hay escritura offline — Req 9.4).
 *
 * Actualización (Req 9.6): soporta SKIP_WAITING vía postMessage.
 */
import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import {
  StaleWhileRevalidate,
  CacheFirst,
  NetworkFirst,
  NetworkOnly,
} from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';

clientsClaim();

// Precache de assets generados por el build.
precacheAndRoute(self.__WB_MANIFEST || []);

// Navegación SPA: servir index.html para rutas de la app (App Shell).
const fileExtensionRegexp = /\/[^/?]+\.[^/]+$/;
registerRoute(
  new NavigationRoute(createHandlerBoundToURL(process.env.PUBLIC_URL + '/index.html'), {
    denylist: [
      // No interceptar llamadas a la API ni archivos con extensión.
      /^\/api\//,
      fileExtensionRegexp,
    ],
  })
);

// Expense reports have their own cache keyed by authenticated user, space and
// filters. A shared URL-only Workbox fallback must never bypass that isolation.
// Fintoc previews are online-only and must never enter any browser data cache.
registerRoute(
  ({ url, request }) => request.method === 'GET' && (
    url.pathname === '/api/dashboard/expense-evolution'
    || url.pathname === '/api/dashboard/expense-evolution/transactions'
    || url.pathname === '/api/dashboard/overview'
    || url.pathname === '/api/financial-health/summary'
    || url.pathname === '/api/checking/global-balance'
    || url.pathname === '/api/checking/fintoc'
    || url.pathname.startsWith('/api/checking/fintoc/')
    || url.pathname === '/api/card-statements'
    || url.pathname.startsWith('/api/card-statements/')
  ),
  new NetworkOnly(),
  'GET'
);

// Remove legacy URL-only copies when this worker takes control. Health reads
// now use the explicit identity+household+period cache in the application.
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    if (typeof caches === 'undefined' || !(await caches.has('api-read-cache'))) return;
    const cache = await caches.open('api-read-cache');
    const requests = await cache.keys();
    await Promise.all(requests.filter(request => {
      const path = new URL(request.url).pathname;
      return path === '/api/financial-health/summary' || path === '/api/checking/global-balance';
    }).map(request => cache.delete(request)));
  })());
});

// API de LECTURA (GET): NetworkFirst — intenta red, cae a caché si no hay red.
registerRoute(
  ({ url, request }) =>
    url.pathname.startsWith('/api/') && request.method === 'GET',
  new NetworkFirst({
    cacheName: 'api-read-cache',
    networkTimeoutSeconds: 5,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 24 * 60 * 60 }),
    ],
  }),
  'GET'
);

// JS y CSS: StaleWhileRevalidate.
registerRoute(
  ({ request }) =>
    request.destination === 'script' || request.destination === 'style',
  new StaleWhileRevalidate({ cacheName: 'static-resources' })
);

// Imágenes: CacheFirst con expiración.
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  })
);

// Las peticiones de ESCRITURA no se interceptan: pasan directo a la red.
// Si no hay conexión, fallan y la UI informa (Req 9.4).

// Actualización inmediata cuando la app lo solicita (Req 9.6).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Notificaciones Web Push (Epic 13, Reqs 13.9, 13.10).
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Finanzas Personales', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Finanzas Personales';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-96.png',
    data: { url: data.url || '/transactions' },
    tag: 'sync-summary',
  };

  event.waitUntil(Promise.all([
    self.registration.showNotification(title, options),
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      clients.forEach(client => { try { client.postMessage({ type: 'FINANCIAL_DATA_CHANGED' }); } catch (_) { /* A window may have closed. */ } });
    }).catch(() => {}),
  ]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/transactions';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      const existing = clientsList.find((c) => new URL(c.url).pathname === targetUrl);
      if (existing) {
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
