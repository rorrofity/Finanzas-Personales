# plan.md — Plan de Arquitectura Técnica: Sync Programada + Push (Epic 13)

> **Subordinación:** subordinado a `constitution.md` v1.2 y `spec.md` v1.3.0 (Epic 13).
> Planes anteriores archivados en `docs/archive/`.

---

## 1. Arquitectura (visión general)

```
        ┌──────────────── Backend (Express + PM2) ────────────────┐
        │                                                          │
 node-cron (America/Santiago)         POST /api/push/subscribe     │
   13:00 y 22:00                       (guarda suscripción)        │
        │                                    ▲                     │
        ▼                                    │                     │
  runScheduledSync()                         │                     │
   • para cada user con auto_sync_enabled    │                     │
   • runSync(userId)  ─────────────► webhook N8N (existente)       │
        │                             (Gmail → parse → sync-save)  │
        │  ◄──── {imported, skipped} ────────                      │
        ▼                                                          │
  registra en sync_runs                                           │
        │                                                          │
   if imported > 0 → sendPush(userId, resumen) ──► web-push ──────┼──► Push Service ──► 📱 SW push event
        │                                                          │                        │
        └──────────────────────────────────────────────────────────┘                        ▼
                                                                                  showNotification → tap → abre /transactions
```

**Idea central:** extraer la lógica de llamada a N8N (hoy embebida en el endpoint `/sync-emails`) a una función reutilizable `runSync(userId, trigger)`. El endpoint manual y el scheduler la comparten. El push se decide en el scheduler según el resultado.

## 2. Backend

### 2.1 Migraciones (nuevas, sin tocar datos existentes)
- `028_create_push_subscriptions.sql`: tabla `push_subscriptions` (endpoint único).
- `029_add_auto_sync_to_users.sql`: `ALTER TABLE users ADD COLUMN auto_sync_enabled BOOLEAN NOT NULL DEFAULT false`.
- `030_create_sync_runs.sql`: bitácora `sync_runs`.

### 2.2 Dependencias nuevas (`backend/package.json`)
| Paquete | Rol |
|---|---|
| `node-cron` | Scheduler in-process (soporta timezone) |
| `web-push` | Envío de notificaciones Web Push (VAPID) |

### 2.3 Archivos nuevos
| Archivo | Responsabilidad |
|---|---|
| `backend/services/syncService.js` | `runSync(userId, trigger)` — extrae la llamada a N8N del endpoint; registra en `sync_runs`; retorna `{imported, skipped, error}` |
| `backend/services/scheduler.js` | Registra los cron (13:00, 22:00 TZ Santiago); `runScheduledSync()` itera usuarios con `auto_sync_enabled` y, tras cada sync con `imported>0`, llama a `pushService.notifySync` |
| `backend/services/pushService.js` | `sendToUser(userId, payload)` con `web-push`; poda suscripciones 404/410; `notifySync(userId, imported)` arma el mensaje |
| `backend/controllers/pushController.js` | vapid-public-key / subscribe / unsubscribe / test |
| `backend/routes/pushRoutes.js` | `/api/push/*` (JWT) |
| `backend/models/PushSubscription.js` | CRUD de suscripciones |

### 2.4 Cambios en código existente
- `syncRoutes.js`: `/sync-emails` refactorizado para usar `syncService.runSync(req.user.id, 'manual')` (mismo comportamiento visible). Agrega `/settings` (GET/PUT) y `/runs` (GET).
- `server.js`: `require('./services/scheduler').start()` solo si `NODE_ENV==='production'` o `ENABLE_SCHEDULER==='true'` (Req 13.6).
- `.env` (prod): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto), `SYNC_CRON_TIMES` opcional (default "0 13 * * *,0 22 * * *"), `TZ=America/Santiago`.

### 2.5 Seguridad (PUSH-001, DATA-001)
- Claves VAPID privadas solo en `.env` del servidor. El endpoint `/vapid-public-key` expone únicamente la pública.
- Cada suscripción se asocia a `user_id` (del JWT); el envío filtra por usuario. Un miembro no recibe push del espacio del dueño.
- Scheduler y push: solo para el dueño (`auto_sync_enabled` es del usuario dueño; el flujo de sync ya es owner-only).

## 3. Frontend / PWA

### 3.1 Service Worker (`src/service-worker.js`)
Agregar handlers (fuera de Workbox):
```js
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body, icon: '/icons/icon-192.png', badge: '/icons/icon-96.png',
    data: { url: data.url || '/transactions' }, tag: 'sync-summary',
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window' }).then((wins) => {
    const url = event.notification.data?.url || '/transactions';
    const open = wins.find((w) => w.url.includes(url));
    return open ? open.focus() : clients.openWindow(url);
  }));
});
```

### 3.2 Archivos nuevos
| Archivo | Rol |
|---|---|
| `src/services/pushClient.js` | `getPermission`, `subscribe` (usa `registration.pushManager.subscribe` con la VAPID pública), `unsubscribe`, POST/DELETE al backend; utilidades urlBase64ToUint8Array |
| `src/hooks/usePushNotifications.js` | estado: `supported`, `permission`, `subscribed`; acciones enable/disable |
| `src/components/NotificationsSettings.jsx` | sección en Settings (solo dueño): activar sync programada + activar/probar notificaciones + explicación iOS |

### 3.3 Cambios en código existente
- `Settings.js`: nueva pestaña/sección "Automatización" (solo dueño) con: toggle sync programada (`PUT /api/sync/settings`), toggle notificaciones (permiso + subscribe), botón "Enviar prueba".
- Sin pop-up automático: el permiso se pide al tocar el toggle (Req 13.7).

## 4. Estrategia de Pruebas (TEST-001)

| Capa | Cobertura |
|---|---|
| **API** (Playwright request) | subscribe/unsubscribe (persistencia, endpoint único), vapid-public-key, `/sync/settings` GET/PUT (solo dueño 200; miembro 403), `/sync/runs`, `/push/test` |
| **Unit backend** (nuevo runner Jest para `backend/`) | `syncService.runSync` (mock axios N8N → registra sync_run, retorna counts, maneja error sin lanzar); `scheduler.runScheduledSync` (mock: itera solo `auto_sync_enabled`, push solo si imported>0); `pushService` (poda 404/410, no envía si no hay subs) |
| **Unit frontend** (Jest/RTL) | `pushClient` (urlBase64, subscribe llama pushManager con la key), `usePushNotifications` (estados), gating de la sección a dueño |
| **E2E** (Playwright, mock API) | Settings muestra Automatización solo al dueño; activar toggle sync; flujo de permiso de notificaciones mockeado (permiso concedido → subscribe llamado); push handler del SW: cubierto en pwa-build o manual |

> **Nota:** El envío real de push y el disparo del cron NO se testean end-to-end automáticamente (dependen de N8N/Gmail/push service reales). Se validan en producción con `/push/test` y una corrida programada observada en `sync_runs`.

## 5. Fases (detalle en tasks.md)

0. Infra: deps (node-cron, web-push), generar VAPID, runner de tests backend, migraciones.
1. `syncService.runSync` (refactor del endpoint manual) + `sync_runs` + `/sync/settings` + `/sync/runs`.
2. Scheduler (node-cron) + `runScheduledSync` (opt-in, error-safe, guard de entorno).
3. Push backend: `pushService` + `pushController` + rutas + poda de expiradas.
4. Push frontend/PWA: SW handlers + pushClient + hook + sección Settings.
5. Deploy + verificación en producción (VAPID en .env, `/push/test` real, corrida programada) + walkthrough.

**Riesgos / notas:**
- **N8N-001 (enmendado):** el webhook de N8N no cambia; solo se automatiza el disparo. Si el usuario quiere que el workflow además traiga "facturadas", eso es un ajuste del workflow en N8N (visual), fuera de este código — se documenta como dependencia.
- **iOS push** solo con PWA instalada; la UI lo explica.
- **Backend sin runner de tests aún:** se agrega Jest para `backend/` (Fase 0); no interferir con `react-scripts test` del frontend (configs separadas).
- **Doble ejecución del cron:** una sola instancia PM2 (fork) — sin riesgo de doble disparo. Documentar no escalar a cluster sin un lock.

---

*Versión: 4.0.0 (épica Sync Programada + Push)*
*Última actualización: 2026-07-19*
