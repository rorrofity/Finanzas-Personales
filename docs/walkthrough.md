# walkthrough.md — Épicas PWA, Espacio Compartido, Rediseño Dashboard y Sync+Push

---

# PARTE 4 — Epic 13: Sincronización Automática Programada + Push (2026-07-19)

## Qué se construyó

**Backend:**
- [backend/services/syncService.js](../backend/services/syncService.js) — `runSync(userId, trigger)`: extrae la llamada al webhook de N8N que antes vivía embebida en `POST /sync-emails`. Nunca lanza; cualquier fallo se captura y registra en `sync_runs`. La usan tanto el botón manual como el scheduler.
- [backend/services/scheduler.js](../backend/services/scheduler.js) — `node-cron` (America/Santiago, horarios en `SYNC_CRON_TIMES`, default 13:00 y 22:00). `runScheduledSync()` itera usuarios con `auto_sync_enabled=true`; tras cada sync con `imported>0` dispara `pushService.notifySync`. Un error por usuario no aborta el resto. Arranca en `server.js` solo si `NODE_ENV=production` o `ENABLE_SCHEDULER=true`.
- [backend/services/pushService.js](../backend/services/pushService.js) + [backend/models/PushSubscription.js](../backend/models/PushSubscription.js) — Web Push (VAPID) real vía `web-push`; poda automática de suscripciones 404/410 expiradas.
- Endpoints nuevos: `GET/PUT /api/sync/settings` (opt-in, solo dueño puede activar), `GET /api/sync/runs` (bitácora), `GET /api/push/vapid-public-key`, `POST /api/push/subscribe|unsubscribe|test`.
- Migraciones 028 (`push_subscriptions`), 029 (`users.auto_sync_enabled`), 030 (`sync_runs`).
- **Decisión de diseño clave:** las suscripciones push son *por persona* (`req.user.id`), no por espacio activo — no usan `resolveSpace`/`X-Space-Owner`. Un dispositivo notifica a quien lo sostiene, sin importar qué espacio esté viendo en la app.

**Frontend / PWA:**
- [src/service-worker.js](../src/service-worker.js) — handlers `push` (muestra la notificación) y `notificationclick` (enfoca o abre `/transactions`).
- [src/services/pushClient.js](../src/services/pushClient.js) + [src/hooks/usePushNotifications.js](../src/hooks/usePushNotifications.js) — suscripción del navegador; el permiso **nunca** se pide automáticamente al montar, solo por acción explícita del usuario.
- [src/components/NotificationsSettings.jsx](../src/components/NotificationsSettings.jsx) — nueva pestaña "Automatización" en Settings (solo dueño): toggle de sync programada, toggle de notificaciones, botón "Enviar prueba", bitácora de las últimas sincronizaciones, aviso de la limitación real de iOS (push solo con la PWA instalada).

## Suites
Unit frontend 65/65 · unit backend 14/14 (nuevo runner `npm run test:backend`, Jest separado de `react-scripts test`) · API 28/28 · E2E 106/106 (incluye Chromium real + WebKit para mobile/tablet) · pwa-build 7/7.

## Bugs/hallazgos de testing reales
- **`navigator.serviceWorker.ready` es un getter nativo en Chromium** (a diferencia de jsdom): una asignación directa en el mock E2E se ignora silenciosamente; hubo que usar `Object.defineProperty`.
- **Los proyectos `mobile-375`/`tablet-768` corren en el motor WebKit real** (no Chromium emulado) — ahí la Push API no está disponible fuera de una PWA instalada, la misma limitación real de iOS. El test verifica que la UI muestre el aviso "no soporta" en vez de forzar un flujo que no existe en ese motor.

## Verificación en producción (2026-07-19)
Migraciones aplicadas (`sudo -u postgres psql` + GRANT, mismo patrón que Epic 11). Par de claves VAPID generado **exclusivamente para producción** (no reutiliza el de desarrollo). Deploy confirmado: log `✅ [scheduler] sincronización programada activa: 0 13 * * * | 0 22 * * * (America/Santiago)`. Flujo completo probado con una cuenta temporal (creada y eliminada): `GET/PUT /sync/settings`, `GET /sync/runs`, `GET /push/vapid-public-key`, `POST /push/subscribe` → todos 200/201.

**Pendiente manual (no delegable):** Rodrigo debe activar la sincronización programada y las notificaciones desde **su cuenta real en su teléfono** (Settings → Automatización) y confirmar que el push llega tras una sincronización con transacciones nuevas.

## Nota operativa
El endpoint `/api/health` del backend responde HTML en producción (lo sombrea el catch-all de servido estático `app.get('*')`) — es un comportamiento preexistente, no introducido por esta épica; Caddy lo considera sano igualmente. No confundir con un fallo real: usar `pm2 list` / logs para confirmar salud del proceso.

---

# PARTE 3 — Epic 12: Rediseño del Dashboard (2026-07-18)

## Qué se construyó

**Backend (sin migraciones):**
- `GET /api/dashboard/overview?year&month` ([dashboardController.getOverview](../backend/controllers/dashboardController.js)): agrega 7 KPIs en una respuesta — balance, gastos (+Δ% vs mes anterior), tasa de ahorro, burn rate (solo mes en curso), disponible hoy, compromisos próximos (con desglose), top 5 categorías (% + Δ). Montado tras `auth` + `resolveSpace` → funciona en espacio compartido (Epic 11).
- Helper [backend/utils/commitments.js](../backend/utils/commitments.js): lógica de compromisos extraída de financial-health para no divergir.

**Sistema de diseño compacto** ([src/components/ui/](../src/components/ui/)): `StatCard` (valor/delta/vacío/skeleton/valueText/subtext), `TrendDelta` (color semántico invertible, null→"—"), `CategoryBar`, `SectionCard`, `ChartTabs`. Formato CLP compartido en [utils/format.js](../src/utils/format.js).

**Dashboard rediseñado** ([Dashboard.js](../src/pages/Dashboard.js)): stat-cards 2×2 en mobile (≤96px) en vez de cards gigantes apiladas; compromisos colapsables; "En qué se va la plata" con barras y drill-down; gráficos de evolución bajo tabs (uno visible, ≤240px) en vez de 3 apilados; estado vacío con CTA. Consume `fetchWithCache` por espacio (offline + Epic 11).

**Totales compactos (Req 12.10):** Transactions, Checking, ProjectedTransactions y TransactionsIntl reemplazan sus 3 cards gigantes por una fila de 3 stat-cards (una fila incluso en 375px).

## Suites
- Unit 42/42 · API 17/17 (incluye `dashboard-overview.spec.js`) · E2E 94/94 (incluye `dashboard-redesign.spec.js` y `compact-totals.spec.js`) · pwa-build 7/7

## Verificación
Endpoint overview responde 401 sin auth (correcto), app y N8N 200, nuevo dashboard renderizado en viewport móvil con el usuario de prueba (estados vacíos correctos). **Pendiente:** que Rodrigo lo confirme con su cuenta real (datos reales) en su teléfono — tras el banner "Nueva versión disponible" → Actualizar.

## Nota de diseño
Las stat-cards del dashboard usan monto CLP completo (finanzas: el usuario quiere el peso exacto); los totales secundarios de las páginas de datos usan formato abreviado ($1,8M) por caber 3 en una fila de 375px.

---

# PARTE 1 y 2 — Épicas PWA y Espacio Compartido: lo construido y cómo validarlo

---

# PARTE 2 — Epic 11: Espacio Compartido del Hogar (2026-07-18)

## Qué se construyó

**Backend (ACL sobre la cuenta del dueño, principio ACL-001):**
- Tabla `space_members` (migración 026) + auditoría `created_by/updated_by` en transactions (027)
- `/api/space`: memberships, members, invitar (máx 2, 409 duplicado, 400 auto-invitación), actualizar permisos, revocar. Invitación pending se vincula al registrarse el email (también vía Google)
- Middleware [resolveSpace.js](../backend/middleware/resolveSpace.js): valida membresía en BD por request (header `X-Space-Owner`), reescribe `req.user.id` al dueño (controllers sin cambios) y guarda el actor en `req.actorId`
- Guards [requirePermission.js](../backend/middleware/requirePermission.js): `requireEdit`, `requireDelete`, `requireOwner` (sync/cards/billing config), `requireResolve` (duplicados con action=delete exige can_delete)
- Montado en TODAS las rutas de datos; sin header el comportamiento es idéntico al previo (retrocompatible)

**Frontend:**
- [SpaceContext](../src/contexts/SpaceContext.jsx): espacios accesibles, selección persistida por usuario, revocación en vivo (403 SPACE_FORBIDDEN → aviso y vuelta al espacio propio)
- [SpaceSwitcher](../src/components/SpaceSwitcher.jsx) en AppBar (solo con >1 espacio); cambiar de espacio remonta las páginas (refetch)
- [SpaceMembersSettings](../src/components/SpaceMembersSettings.jsx): tab "Espacio compartido" en Settings (solo dueño)
- Gating de permisos en Transactions + SyncButton solo dueño + Settings restringido en espacios ajenos
- [CreatedByChip](../src/components/CreatedByChip.jsx): quién registró cada transacción (solo en espacios con >1 participante)
- Caché offline llaveado por espacio (`own|ownerId::key`) y limpiado en logout

## Suites (todas en verde al cierre)
- Unit 26/26 · **API (nueva capa) 14/14** (`npm run test:api`) · E2E 67/67 · pwa-build 7/7

## Verificación en producción (2026-07-18)
Flujo completo con 2 cuentas temporales contra finanzas.rocketflow.cl: invitar → el miembro ve el espacio → lectura 200 → escritura sin permiso 403 → sync como miembro 403. Usuarios de prueba eliminados después. **Pendiente manual:** repetir con las cuentas reales de Rodrigo y su pareja.

## Nota operativa de deploy
El runner `npm run migrate` falla en producción («must be owner of table») porque las tablas históricas pertenecen a `postgres` y no a `finanzas_user`. Las migraciones nuevas se aplicaron directamente: `sudo -u postgres psql -d finanzas_personales -f backend/migrations/02X_*.sql` + `GRANT SELECT, INSERT, UPDATE, DELETE ON space_members TO finanzas_user;`.

---

# PARTE 1 — Épica PWA (completada 2026-07-18)

> Generado al cierre de la implementación (tarea 5.8, 2026-07-18). Documenta lo efectivamente construido en las Fases 0–5 de `tasks.md`, las decisiones tomadas y cómo ejecutar/validar la PWA.

---

## 1. Qué se construyó

### Fase 1 — Infraestructura PWA
- **Service Worker** ([src/service-worker.js](../src/service-worker.js)) con Workbox (InjectManifest nativo de CRA): precache del App Shell, `NetworkFirst` para GETs de `/api/`, `CacheFirst` para assets. **Solo cachea lecturas** — las mutaciones van siempre a la red.
- **Registro** ([src/serviceWorkerRegistration.js](../src/serviceWorkerRegistration.js)): solo en producción; expone `onUpdate` y notifica también si ya había un SW `waiting` al cargar.
- `manifest.json` completo: íconos 72–512px + maskable, shortcuts, `display: standalone`.

### Fase 2 — Offline solo-lectura
- [src/services/readCache.js](../src/services/readCache.js): caché IndexedDB (idb) con `fetchWithCache` (online: red + actualiza caché; offline: sirve caché) y `getStorageEstimate` (advertencia al 80% de quota).
- `useOffline` hook + `OfflineContext` + `OfflineBanner`; botones de escritura y `SyncButton` deshabilitados offline; refresco automático al reconectar.

### Fase 3 — Mobile responsive
- Tablas → cards en < 900px (Transactions, TransactionsIntl, Checking, Installments, Projected), drawer hamburguesa, MonthPicker responsivo.

### Fase 4 — Actualización SW e instalación
- **[src/components/UpdateBanner.jsx](../src/components/UpdateBanner.jsx)**: escucha el evento global `swUpdated` (emitido desde `index.js` vía `onUpdate`); muestra Snackbar "Nueva versión disponible"; "Actualizar" → `postMessage({type:'SKIP_WAITING'})` al worker en espera y recarga en `controllerchange`.
- **[src/components/InstallPrompt.jsx](../src/components/InstallPrompt.jsx)**: intercepta `beforeinstallprompt`, invitación propia con "Instalar" / "Ahora no" (descarte persistido en localStorage, clave `pwa-install-dismissed`).
- **Safe-area** (notch iOS): `GlobalStyles` en `App.js` con `env(safe-area-inset-*)`; `index.html` ya declaraba `viewport-fit=cover` y metas Apple.

### Fase 5 — Optimización y auditoría
- **Code-splitting por ruta** (`React.lazy` + `Suspense` en `App.js`): main bundle **1.2MB → 461KB** + 26 chunks lazy (precacheados por el SW).
- **Google Fonts no bloqueante** (`media="print" onload`): FCP **4.6s → 0.6s**.
- **Lighthouse 12** (build servido local, /login): **Performance 98, Accesibilidad 96, Best Practices 96, SEO 100**. (LH12 eliminó la categoría PWA; la instalabilidad se verifica con Playwright: manifest + SW + caches Workbox.)

---

## 2. Bugs reales encontrados por los tests (TDD pagó)

1. **`Installments.js` crasheaba en mobile**: usaba `<Card>/<CardContent>` sin importarlos (ReferenceError en runtime). Solo se manifestaba al renderizar la vista de cards con datos. Detectado por el E2E mobile; corregido agregando los imports.
2. **En mobile no se podía crear ni importar transacciones**: los botones "Nueva"/"Importar" estaban ocultos con `!isMobile &&` (el spec exige visibles y deshabilitados offline, no ocultos — Req 9.4/9.9). Ahora se muestran siempre.
3. **Cards mobile sin botón Editar**: solo tenían Eliminar; se agregó el IconButton Editar con paridad al desktop.

---

## 3. Cómo ejecutar y validar

```bash
# Unit (Jest + RTL): UpdateBanner, InstallPrompt, useOffline, readCache
npm run test:unit           # 17 tests

# E2E contra dev server (requiere .env.test con E2E_USER_EMAIL/PASSWORD
# y PostgreSQL local; Playwright levanta `npm run dev` si no está corriendo)
npm run test:e2e            # 49 tests × 3 viewports (desktop/375px/768px)

# E2E del build de producción (SW real, manifest, update banner, safe-area)
npm run test:e2e:pwa        # 7 tests — construye y sirve el build

# Lighthouse (opcional)
npx serve -s build -l 3100 &
npx lighthouse http://localhost:3100/login --chrome-flags="--headless=new"
```

Usuario E2E local: definido en `.env.test` (gitignored, ver `.env.test.example`).

### Validar la actualización del SW en producción
1. Desplegar una versión nueva (build cambia hashes → SW nuevo).
2. Abrir la app instalada: debe aparecer "Nueva versión disponible".
3. Pulsar "Actualizar": recarga con la versión nueva sin perder sesión.

---

## 4. Deploy a producción

No existe `scripts/deploy-to-production.sh` (la doc histórica lo menciona pero nunca se versionó). Proceso real:

```bash
ssh root@137.184.12.234
cd /var/www/finanzas-personales
git pull origin main
npm install            # deps nuevas: workbox-*, idb, etc.
npm run build          # genera build con SW + chunks
pm2 restart finanzas-backend
```

Si cambió `Caddyfile.secure` (p.ej. CSP): copiarlo al contenedor Caddy y `caddy reload` (ver DEPLOYMENT.md §Paso 3).

**Pendiente manual (5.5/5.7):** probar instalación en iPhone (Safari → Compartir → Agregar a inicio) y Android Chrome (prompt de instalación), verificar modo standalone y offline read-only con datos reales.

---

## 5. Decisiones y notas

- **Evento `swUpdated` vía CustomEvent**: desacopla el registro del SW (fuera de React) del banner (dentro de React) sin estado global adicional.
- **`React.lazy` para todas las páginas**, incluido Login: los chunks quedan precacheados por Workbox, así que no hay penalización offline.
- **Timeout de expect en Playwright 5s → 10s** (config dev): la primera visita a una ruta descarga su chunk del dev server y bajo carga superaba 5s.
- **Snackbar de MUI se desmonta tras transición**: los tests que verifican desaparición usan `waitFor`.
- En producción Emotion inyecta CSS vía CSSOM (`insertRule`), por lo que el test de safe-area revisa `document.styleSheets`, no solo `<style>`.

*Última actualización: 2026-07-18*
