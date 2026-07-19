# tasks.md — Sincronización Automática Programada + Push (Epic 13)

> **Subordinación:** subordinado a `constitution.md` v1.2, `spec.md` v1.3.0 (Epic 13) y `plan.md` v4.0.0.
> Tareas de épicas anteriores en `docs/archive/`.
>
> **Metodología — Test-First obligatorio (TEST-001):** 🔴 RED → 🟢 GREEN → 🔁 VERIFY.

## Leyenda

`[ ]` pendiente · `[~]` en progreso · `[x]` completado · `[!]` bloqueado

---

## Fase 0: Infraestructura

| # | Tipo | Tarea | Req | Estado |
|---|---|---|---|---|
| 0.1 | S | Instalar `node-cron` y `web-push` (en package.json raíz, junto al resto de deps del backend) | — | `[x]` |
| 0.2 | S | Generar par de claves VAPID; documentar variables `.env`/`.env.example` (VAPID_PUBLIC/PRIVATE/SUBJECT, TZ, SYNC_CRON_TIMES, ENABLE_SCHEDULER) | 13.8 | `[x]` |
| 0.3 | S | Runner de tests unitarios para `backend/` (`backend/jest.config.js` + script `test:backend`) | — | `[x]` |
| 0.4 | S | Migraciones 028 (push_subscriptions), 029 (users.auto_sync_enabled), 030 (sync_runs) + correr en local | 13.2, 13.5, 13.8 | `[x]` |
| 0.5 | V | Baseline: `test:backend` corre y las migraciones aplican en local | — | `[x]` |

## Fase 1: syncService + bitácora + settings

| # | Tipo | Tarea | Req | Estado |
|---|---|---|---|---|
| 1.T1 | 🔴 T | Unit: `runSync` mockeando axios(N8N) → retorna {imported,skipped}, registra en sync_runs, y ante error de N8N NO lanza (registra error) | 13.4, 13.5 | `[x]` |
| 1.T2 | 🔴 T | API: `/sync/settings` GET refleja estado; PUT activa/desactiva (dueño 200, miembro 403) | 13.2, 13.3 | `[x]` |
| 1.T3 | 🔴 T | API: `/sync/runs` lista las últimas ejecuciones del usuario | 13.5 | `[x]` |
| 1.I1 | 🟢 I | `backend/services/syncService.js` (extraer llamada N8N del endpoint) + modelo/insert en sync_runs | 13.1, 13.5 | `[x]` |
| 1.I2 | 🟢 I | Refactor `/sync-emails` para usar `runSync(userId,'manual')` sin cambiar la respuesta | 13.1 | `[x]` |
| 1.I3 | 🟢 I | Endpoints `/sync/settings` (GET/PUT) y `/sync/runs` | 13.2, 13.3, 13.5 | `[x]` |
| 1.V1 | 🔁 V | 1.T1–1.T3 verdes + suite API previa sin regresiones (unit 5/5, API 23/23, E2E 94/94) | — | `[x]` |

## Fase 2: Scheduler

| # | Tipo | Tarea | Req | Estado |
|---|---|---|---|---|
| 2.T1 | 🔴 T | Unit: `runScheduledSync` itera SOLO usuarios con `auto_sync_enabled`; llama runSync por cada uno | 13.1, 13.2 | `[ ]` |
| 2.T2 | 🔴 T | Unit: tras runSync con imported>0 llama a pushService.notifySync; con imported=0 NO | 13.9, 13.13 | `[ ]` |
| 2.T3 | 🔴 T | Unit: un error en un usuario no aborta el resto (error-safe) | 13.4 | `[ ]` |
| 2.I1 | 🟢 I | `backend/services/scheduler.js` (node-cron TZ Santiago, times configurables) + `runScheduledSync` | 13.1 | `[ ]` |
| 2.I2 | 🟢 I | `server.js`: start del scheduler solo en prod / `ENABLE_SCHEDULER=true` | 13.6 | `[ ]` |
| 2.V1 | 🔁 V | 2.T1–2.T3 verdes | — | `[ ]` |

## Fase 3: Push backend

| # | Tipo | Tarea | Req | Estado |
|---|---|---|---|---|
| 3.T1 | 🔴 T | API: `/push/subscribe` guarda suscripción (endpoint único, idempotente); `/push/unsubscribe` la borra | 13.8, 13.12 | `[ ]` |
| 3.T2 | 🔴 T | API: `/push/vapid-public-key` retorna la pública; nunca expone la privada | 13.8 | `[ ]` |
| 3.T3 | 🔴 T | Unit: `pushService.sendToUser` envía a todas las subs del usuario; ante 404/410 elimina la sub; sin subs no falla | 13.9, 13.11 | `[ ]` |
| 3.I1 | 🟢 I | Modelo `PushSubscription.js` + `pushService.js` (web-push, poda) | 13.9, 13.11 | `[ ]` |
| 3.I2 | 🟢 I | `pushController.js` + `pushRoutes.js` (subscribe/unsubscribe/vapid-public-key/test) | 13.8, 13.12 | `[ ]` |
| 3.V1 | 🔁 V | 3.T1–3.T3 verdes | — | `[ ]` |

## Fase 4: Push frontend / PWA

| # | Tipo | Tarea | Req | Estado |
|---|---|---|---|---|
| 4.T1 | 🔴 T | Unit: `pushClient` — urlBase64ToUint8Array correcto; subscribe llama pushManager con la key y postea al backend | 13.8 | `[ ]` |
| 4.T2 | 🔴 T | Unit: `usePushNotifications` — estados supported/permission/subscribed y acciones | 13.7, 13.12 | `[ ]` |
| 4.T3 | 🔴 T | E2E: Settings muestra "Automatización" solo al dueño; toggle sync programada llama PUT /sync/settings | 13.3 | `[ ]` |
| 4.T4 | 🔴 T | E2E: activar notificaciones pide permiso (mock concedido) → subscribe; botón "Enviar prueba" | 13.7, 13.8 | `[ ]` |
| 4.I1 | 🟢 I | Handlers `push` y `notificationclick` en `src/service-worker.js` | 13.9, 13.10 | `[ ]` |
| 4.I2 | 🟢 I | `src/services/pushClient.js` + `src/hooks/usePushNotifications.js` | 13.7, 13.8, 13.12 | `[ ]` |
| 4.I3 | 🟢 I | `NotificationsSettings.jsx` + sección "Automatización" en Settings (solo dueño, explicación iOS) | 13.3, 13.7, 13.12 | `[ ]` |
| 4.V1 | 🔁 V | 4.T1–4.T4 verdes + suite completa (unit + API + E2E + pwa-build) | 13.x | `[ ]` |

## Fase 5: Deploy y verificación

| # | Tipo | Tarea | Req | Estado |
|---|---|---|---|---|
| 5.1 | 🔁 V | Suite completa en verde | Todas | `[ ]` |
| 5.2 | S | Configurar VAPID + TZ en `.env` de producción; aplicar migraciones (vía psql como postgres + GRANT) | — | `[ ]` |
| 5.3 | S | Deploy al droplet (pull + install + build + pm2 restart); verificar que el scheduler arranca (logs) | 13.6 | `[ ]` |
| 5.4 | 🔁 V | Verificación real: Rodrigo activa sync programada + notificaciones en su teléfono; `/push/test` llega; observar una corrida en `sync_runs` y su push | 13.7–13.10 | `[ ]` |
| 5.5 | S | Actualizar walkthrough.md, PROJECT_SUMMARY.md y memoria | — | `[ ]` |

## Mapeo Req → Tareas

| Req | Tareas |
|---|---|
| 13.1 (sync programada) | 1.I1–1.I2, 2.I1 |
| 13.2 (opt-in por usuario) | 0.4, 1.T2, 2.T1 |
| 13.3 (toggle en Settings) | 1.T2, 1.I3, 4.T3, 4.I3 |
| 13.4 (error-safe) | 1.T1, 2.T3 |
| 13.5 (bitácora) | 0.4, 1.T1, 1.T3, 1.I1, 1.I3 |
| 13.6 (guard de entorno) | 2.I2 |
| 13.7 (permiso no intrusivo) | 4.T2, 4.T4, 4.I2–4.I3 |
| 13.8 (suscripción VAPID) | 0.2, 3.T1–3.T2, 3.I2, 4.T1, 4.I2 |
| 13.9 (push tras sync) | 2.T2, 3.T3, 3.I1, 4.I1 |
| 13.10 (tap abre transacciones) | 4.I1 |
| 13.11 (podar expiradas) | 3.T3, 3.I1 |
| 13.12 (desuscribir) | 3.T1, 4.T2, 4.I2–4.I3 |
| 13.13 (no push si 0) | 2.T2 |

## Notas y Riesgos

- **El workflow N8N no cambia**: solo se automatiza su disparo. Que además traiga "facturadas" es un ajuste del workflow en N8N (visual), fuera de este código.
- **iOS**: push solo con PWA instalada; la UI lo explica.
- **Secretos**: VAPID privado y web-push solo en `.env` del servidor.
- **Sin staging**: validar en local; el scheduler NO corre en dev salvo `ENABLE_SCHEDULER=true` para no llamar N8N por accidente.
- **Envío real de push y disparo del cron** no se cubren con tests automáticos end-to-end; se verifican en producción (5.4).

---

*Versión: 4.0.0 (épica Sync Programada + Push)*
*Última actualización: 2026-07-19*
