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

---

# PARTE 5 — Epic15: evolución de gastos por categoría (2026-10-31)

Implementada y desplegada en `finanzas.rocketflow.cl`, código `9993630426605f4bf7efdb1df83fc973aacbc8bf`. El dashboard ahora muestra matriz completa categoría×mes, tendencia seleccionable, ventanas3/6/12, fuentes explícitas y detalle paginado de la celda elegida, usando períodos de facturación persistidos e importes exactos. La caché se aísla por usuario, espacio y alcance, con fecha de consulta, offline y protección frente a respuestas tardías o revocación. Salud Financiera presenta composición del mismo resumen de compromisos y porcentajes reales superiores a100%.

**SDD/TDD:** enmienda de Req12.4/12.5 y requisitos DCE-01–21, con RED observado antes de GREEN y VERIFY. Resultado:101 pruebas frontend,67 backend,59 E2E y7 PWA pasan;2 E2E se omiten por tamaño de pantalla. Integración SQL/API sobre PostgreSQL efímero: totales/detalle/permisos y ausencia de mutaciones comprobados. Capturas con datos ficticios en [QA](implementation/dashboard-category-evolution-qa/evidence.json).

**Despliegue real al servidor:** actualización desde Git, construcción nueva en `/var/www/finanzas-personales`, conservación del build anterior y reinicio únicamente de `finanzas-backend`. App/assets/SW públicos200 y API401 sin sesión. Lecturas autenticadas en el servidor verificaron cuatro alcances de fuente y conciliación matriz/detalle.

**Datos preservados:** comparación de huellas de nueve tablas financieras antes/después:0 registros modificados,0 eliminados y0 añadidos. Sin migraciones, nuevas dependencias, login, registro, importaciones ni sincronizaciones. Rollback limitado a código/build, con respaldo en `/var/backups/finanzas/dashboard-20261031-9993630`.

Contrato, pruebas y detalle operativo en [el plan de Epic15](implementation/dashboard-category-evolution-plan.md). La conciliación bancaria de Epic14 y los cambios documentales previos permanecen independientes de esta entrega.

---

# PARTE 6 — Epic16: apariencia y lectura móvil (2026-10-31)

Desplegada la interfaz `134d065d3716e8a7313d3640388f3b139c439672` en `finanzas.rocketflow.cl`. Modo Claro, Oscuro y Automático por dispositivo, accesible desde navegación e inicio de sesión. En móvil, lista completa de categorías con importe y variación e historial mensual vertical; la matriz queda en escritorio. Se compactaron filtros, resumen y detalles de cobertura y se preserva la categoría al cambiar la ventana.

**SDD/TDD:** AP-01–05 y MOB-01–09, con RED observado para apariencia, lista vertical, selección y contraste. Verificación final: 124 pruebas frontend, 67 backend, 72 E2E y 7 PWA pasan; 7 E2E se omiten por ancho de pantalla. Capturas con datos ficticios y evidencia en [QA](implementation/appearance-mobile-qa/evidence.json).

**Servidor:** construcción de frontend en el servidor, respaldo del build anterior y conservación de assets para clientes sin actualizar. Backend con el mismo PID y tiempo de inicio, sin reiniciar ni modificar scheduler. App/assets/SW responden 200 y API mantiene 401 sin autenticación. Comparación de nueve tablas financieras: 0 modificaciones, 0 eliminaciones y 0 inserciones.

La sincronización de cuenta corriente quedó como [propuesta](proposals/checking-daily-sync.md), ajustada a persona natural y costo cero. No se conectó el banco, contrató un proveedor, activó una programación o modificó el importador. [Plan y despliegue de Epic16](implementation/appearance-mobile-plan.md).

---

# PARTE 7 — Epic17: consulta privada mediante Fintoc (2026-10-31)

Conector `5000d516758057c14bae3f40db7f11970a11c5a4` desplegado en producción. El dueño dispone de panel de consulta de movimientos por mes, separado de su cartola registrada, con compatibilidad móvil y Claro/Oscuro. El servidor restringe banco, cuenta, moneda y propietario; controla paginación, fechas e importes y devuelve errores seguros. Los movimientos no se guardan en caché offline ni en la base de datos.

**SDD/TDD:** contrato FRO-01–12 previo al código, RED observado y 409 pruebas aprobadas: 148 frontend, 166 backend, 88 navegador y 7 PWA; 9 omisiones de navegador por ancho. Revisión independiente corrigió una inconsistencia de paginación con nuevos casos RED/GREEN. [Plan y evidencia](implementation/fintoc-readonly-plan.md).

**Producción:** compilación en servidor, respaldo del build anterior, reinicio de backend y verificación de rutas privadas/no-store. Las huellas de nueve tablas financieras permanecen idénticas: cero modificaciones, eliminaciones o inserciones. Sin migraciones, dependencias nuevas o cambios de scheduler.

**Conexión bancaria pendiente:** el titular todavía no tiene cuenta Fintoc. Conector deshabilitado, sin credenciales ni peticiones al proveedor. El acceso real exige alta autorizada, habilitación live y confirmación de costo cero. No importa movimientos, actualiza saldo ni activa sincronización diaria. [Guía de activación privada](implementation/fintoc-readonly-activation.md).


## PARTE 8 — Epic18: cuenta corriente diaria mediante Fintoc

**Entrega verificada el 2026-11-01 a las 00:22:29 America/Santiago.** [Contrato previo FDS-01–14](implementation/fintoc-daily-sync-contract.md), [plan y pruebas](implementation/fintoc-daily-sync-plan.md), [evidencia de producción](implementation/fintoc-daily-sync-deployment.json).

Los términos canónicos de Fintoc confirman el servicio gratuito hasta cinco cuentas personales; se utiliza la cuenta Individual vinculada, sin planes pagados ni Refresh Intents. La lectura real y el baseline de tres meses terminaron completos. La historia inicial queda referenciada o visible en revisión, sin reimportarla. Corte 2026-11-01: novedades confirmadas posteriores e inequívocas pueden añadirse sin categoría/notas, preservando todas las clasificaciones existentes.

El proceso independiente consulta a las 07:00 America/Santiago, con fecha de consulta y actualización bancaria separadas. La web muestra estado y pendientes en ambos temas y móvil, sin caché bancaria. Solo cuenta corriente CLP Banco de Chile; las compras de tarjeta mantienen su flujo TC/N8N.

SDD y TDD RED→GREEN: 186 pruebas frontend, 280 backend, 101 navegador y 7 PWA; 11 omisiones previstas por viewport. PostgreSQL efímero adicional verifica inmutabilidad campo a campo, idempotencia, multiplicidad, rollback, carrera con cartola, pendientes que se confirman, reemisiones de referencias eliminadas y ejecuciones antiguas/errores tardíos. Reauditoría independiente aprobada. Capturas usan exclusivamente datos ficticios.

Código publicado y construido en el servidor. Solo migración aditiva 031; tres tablas nuevas. PM2 online y cron real registrado. API dueño 200/no-store, otro usuario 403 y anónimo 401; app, módulo y service worker 200. Comparación antes/después de nueve tablas financieras idéntica: cero registros añadidos, modificados o eliminados durante el despliegue y baseline. Respaldos y datos reales permanecen privados. Los cambios previos del usuario se preservaron separados.


## PARTE 9 — Conciliación inicial Fintoc

**Verificada el 2026-11-01 a las 00:35:32 America/Santiago.** [Contrato FHR previo al código](implementation/fintoc-initial-reconciliation-contract.md), [plan y pruebas](implementation/fintoc-initial-reconciliation-plan.md), [evidencia de producción](implementation/fintoc-initial-reconciliation-deployment.json).

A solicitud expresa del titular se compararon los pendientes iniciales con todo el historial de cuenta corriente y posibles coincidencias de tarjetas. Un preview privado revisado y su huella recalculada bajo el lock permitieron insertar únicamente faltantes inequívocos; los futuros quedaron pendientes. Categoría y notas nulas en los nuevos movimientos; todos los campos originales y las otras ocho tablas financieras idénticos.

TDD: 49 pruebas del motor y 13 de CLI; regresión backend completa 342/15 suites. Integración en PostgreSQL efímero verifica inmutabilidad, rollback, multiplicidad, fechas, tombstones, planes obsoletos y concurrencia con cartola/otro apply. Reauditoría independiente aprobada. Ningún dato real se incorporó a fixtures o repo.

Herramienta publicada e instalada, sin migraciones, build, reinicio, cambios de configuración ni consultas nuevas a Fintoc. Fecha bancaria, corte, última consulta y cron diario conservados. Repetir preview o evaluar el cron con los IDs conciliados produce cero nuevas inserciones. API autenticada y web de producción verificadas; respaldos y detalles reales solo en el servidor privado.


## PARTE 10 — Saldo bancario exacto y clasificación por historial

**Verificado el 2026-11-01 a las 01:04:09 America/Santiago.** [Contrato previo FBA/FHC](implementation/fintoc-balance-classification-contract.md), [plan y pruebas](implementation/fintoc-balance-classification-plan.md), [evidencia sin valores financieros](implementation/fintoc-balance-classification-deployment.json).

La web muestra disponible bancario exacto, contable, fecha bancaria y diferencia frente al cálculo histórico identificado. El snapshot separado se capturó mediante GET autorizado y se actualiza por el cron existente tras lotes completos. No se usa la línea de crédito ni se alteran saldos de cartolas para forzar una igualdad. UI clara en móvil/ambos temas y aislamiento por sesión/espacio, sin caché bancaria.

Se clasificaron únicamente importados aún NULL con descripción completa/tipo y categoría histórica unánime del titular; contradicciones o falta de antecedentes permanecen sin categoría. Se excluyen inferencias previas del aprendizaje. Solo category_id y updated_at autorizados cambiaron; todos los demás campos originales y las otras ocho tablas financieras permanecen idénticos. Nueva ejecución no añade asignaciones duplicadas.

SDD→TDD: 451 pruebas backend, 217 frontend, 113 navegador y 7 PWA; 11 omisiones previstas de viewport. PostgreSQL efímero verifica ambos flujos, monotonicidad, rollback, preservación, cron completo/incompleto y planes obsoletos. Reauditoría independiente corrigió respuestas antiguas demoradas y descripciones truncadas; QA móvil corrigió etiquetas cortadas, con 4 pruebas de Checking, 15 recorridos específicos y 7 PWA sobre el build final.

Código construido y desplegado en el servidor, únicamente migración aditiva 032. API, web, assets y cron real verificados; configuración, estado diario y TC/N8N conservados. Los valores reales, planes e IDs permanecen exclusivamente en el servidor. Repo actualizado y cambios previos del usuario preservados separados.


## PARTE 11 — Estados Visa y Mastercard desde Gmail

**Verificado el 2026-11-01 a las 02:47:50 America/Santiago.** [Contrato CSR-01–16 previo al código](implementation/card-statement-reconciliation-contract.md), [plan y pruebas](implementation/card-statement-reconciliation-plan.md), [despliegue](implementation/card-statement-reconciliation-deployment.json) y [recorrido N8N](implementation/card-statement-reconciliation-n8n.json).

Nuevo flujo independiente con remitente y asunto exactos autorizados. Reutiliza la conexión Gmail existente, descarga cada PDF, lo descifra con configuración privada del servidor y lee texto nativo localmente, sin IA/OCR externo. Ambos ejemplos contienen secciones nacional CLP e internacional USD. Sondeo cada minuto y recorrido real de descarga/ingesta verificados. No modifica mensajes ni los workflows anteriores.

La web incorpora Estados de tarjetas, por mes de vencimiento y solo para el titular. Compara en vivo con el historial y distingue coincidencias, faltantes, revisión e informativos. Identidades insuficientes y cuotas ambiguas permanecen para revisión. No inserta, actualiza ni elimina gastos, categorías, cuotas, períodos o saldos para forzar una conciliación.

SDD→TDD y revisión independiente: 975 pruebas únicas aprobadas, más integración PostgreSQL efímera que verifica idempotencia, concurrencia, rollback e inmutabilidad. QA móvil Claro/Oscuro sin desplazamiento lateral. Prueba RED→GREEN adicional cubre el requisito instalado de descarga explícita de adjuntos; 17 casos finales del workflow aprobados.

Aplicación construida en el servidor, migración aditiva033 y lector aislado. Permisos y assets actuales/anteriores verificados, reenvío sin duplicación y nueve tablas financieras idénticas antes/después de toda la operación. Clave PDF y credencial de ingesta privadas; datos reales fuera del repo y retención N8N deshabilitada. Repositorio y servidor actualizados; cambios previos del usuario preservados separados.


## PARTE 12 — Cartolas por la noche y gastos faltantes

**Verificado el 2026-11-01 a las 16:53:15 America/Santiago.** [Contrato CSN-01–19 previo al código](implementation/card-statement-nightly-settlement-contract.md), [plan y pruebas](implementation/card-statement-nightly-settlement-plan.md), [despliegue](implementation/card-statement-nightly-settlement-deployment.json), [N8N](implementation/card-statement-nightly-settlement-n8n.json) y [Gmail](implementation/card-statement-nightly-settlement-gmail.json).

A solicitud del titular se sustituyó el polling por una ejecución a las 23:00 de Chile, del 25 al 30. Consulta todos los correos autorizados de 40 días y procesa un PDF por vez, acumulando ambos resultados. Otros flujos y mensajes conservados. Backend automático verificado mediante el recorrido real, con repetición sin nuevos cargos y sin retención de ejecuciones.

La autorización nueva permite incorporar exclusivamente faltantes inequívocos, sin categoría/notas. Preview/digest revalidado, transacción y bitácora persistente protegen originales, multiplicidad, referencias eliminadas y posibles ediciones. Locks al inicio del lote de avisos y barrera de INSERT para importadores previenen duplicación tardía. Solo INSERT nuevos: ninguna fecha, importe, período, nota o categoría anterior se sobrescribe. Contexto de aplicación interno y local a la transacción, no falsificable mediante metadata.

La web muestra total oficial literal del documento separado de consumos, cobertura y diferencias, con cargos extra identificables. No cierra si faltan identidades, cuotas u otras comprobaciones aunque la diferencia neta sea cero. USD permanece en moneda original sin inventar conversión; vistas de transacciones, liquidez y salud advierten importes CLP parciales. No se crean gastos de ajuste para igualar saldos.

SDD→TDD: 1109 pruebas aprobadas (651 backend, 270 frontend, 141 navegador, 7 PWA y 40 lector), 13 omisiones previstas por viewport; además dos integraciones PostgreSQL temporales. Esquema auténtico sin columna notas, Unicode, rollback, carrera con escritores legacy, snapshots antiguos, contexto transaccional, tombstones y réplicas verificados. QA ficticia móvil/temas sin escrituras, errores o desplazamiento lateral.

Build realizado en el servidor y únicamente migraciones 034/035 con propietario adecuado. Huellas originales en nueve tablas financieras, imports y tarjetas intactas; nuevas filas cotejadas con evidencia bancaria. Permisos, guards de duplicados con rol real, assets actuales/anteriores y configuración privada conservados. Fuente y evidencia públicas actualizadas; datos reales y respaldos solo privados. Cambios previos del usuario preservados separados.


## PARTE 13 — Filtro de movimientos sin categoría

**Verificado el 2026-11-01 a las 18:19:33 America/Santiago.** [Contrato UCF previo al código](implementation/uncategorized-filter-contract.md), [plan](implementation/uncategorized-filter-plan.md), [QA ficticia](implementation/uncategorized-filter-qa/evidence.json) y [producción](implementation/uncategorized-filter-deployment.json).

Las tres páginas de transacciones incorporan un acceso rápido Sin categoría con contador. Activa/desactiva con un clic y compone tarjeta, tipo y desestimados. Cuenta corriente también ofrece la opción en su selector existente y mantiene saldo/totales mensuales de referencia. Filtra en memoria el mes cargado; no añade consultas ni escrituras. La selección masiva se limita a resultados filtrados y se ajusta al retirar filas.

TDD RED→GREEN y revisión independiente; 306 pruebas unitarias, 150 navegador y 7 PWA aprobadas, 13 omisiones previstas por viewport. Móvil/escritorio/tableta, ambos temas, teclado, paginación, vacío y categorización explícita simulada. Datos exclusivamente ficticios en pruebas y capturas.

Build construido y publicado en servidor conservando los assets anteriores. Tres rutas verificadas y nueve tablas financieras idénticas en huellas READ ONLY, sin escrituras ni migraciones. Backend y sincronizaciones sin cambios; ningún reinicio. Fuente/documentación publicadas y modificaciones previas del usuario preservadas.


## PARTE 14 — Sincronización horaria y espacio recuperado

**Verificado el 2026-11-01 a las 21:06 America/Santiago.** [Contrato HSM previo al código](implementation/hourly-sync-maintenance-contract.md), [plan y TDD](implementation/hourly-sync-maintenance-plan.md) y [producción](implementation/hourly-sync-maintenance-deployment.json).

Emails de cargos de tarjetas: cada hora desde las 08:00 hasta las 00:00 inclusive, 17 oportunidades diarias en America/Santiago. Conciliación mensual: días 25–30 a las 23:10. Fintoc diario sigue a las 07:00. Mismo importador y preferencias; registro idempotente, callback esperado y noOverlap, concurrencia N8N uno. Interfaz de Automatización actualizada y configuración de ejemplo versionada.

TDD RED→GREEN observado antes del código; 657 pruebas backend y 309 frontend aprobadas, builds local/servidor correctos. Despliegue con assets anteriores conservados, PM2 online y comprobaciones autenticadas de lectura. Otros workflows intactos; ninguna carga real usada como prueba. Once tablas financieras comparadas fila por fila mediante huellas privadas: todos los gastos, clasificaciones, notas, fechas y saldos idénticos. Sin migraciones.

Limpieza limitada a respaldos SQLite comprimidos y páginas libres de N8N: ~7,3 GB netos recuperados y ~9,1 GB disponibles. Ambos originales recuperables con SHA-256 verificado; base operativa de 4,07 GB a 933.888 bytes, 61 tablas/esquema preservados y pausa de 2,134 segundos. No se borraron PDFs, otros respaldos, workflows ni credenciales. Pruebas desechables de compactación y restauración por fallo aprobadas. Configuración privada y respaldos quedan solamente en el servidor; documentación preexistente del usuario conservada.


## PARTE 15 — Respaldo diario y alerta de espacio

**Verificado el 2026-11-01 a las 21:54 America/Santiago.** [Contrato DBK previo al código](implementation/daily-backup-contract.md), [plan y pruebas](implementation/daily-backup-plan.md), [guía de recuperación](../automation/backups/README.md) y [evidencia productiva](implementation/daily-backup-deployment.json).

Timer diario a las 03:30 de Chile, servicio independiente sin detener web/N8N. Captura consistente individual de PostgreSQL y SQLite, configuración/clave de cifrado y entorno Docker; archivo privado tar.gz con SHA-256, validación completa del gzip/tar, integridad SQLite y lectura del dump. Publicación atómica, bloqueo y reserva adaptativa. Máximo 7 diarios y 4 semanales por primera copia de semana ISO; históricos fuera de rotación. Repetición del mismo día no acumula copias.

Avisos Web Push al dueño desde 85 % de uso, revisado diariamente, y por fallos de respaldo. Deduplicación/reintento/pending seguro, sin modificar suscripciones ni divulgar datos. Sin costos nuevos. Los respaldos residen en el mismo servidor y requieren copia externa adicional para cubrir pérdida total del host.

SDD→TDD: 678 pruebas backend, 21 Python y cinco casos adversariales independientes aprobados. PostgreSQL 14 temporal sin TCP validó dump y restauración ficticia; luego el primer archivo real de 451.603 bytes se restauró en una base temporal aislada y sus once tablas financieras coincidieron exactamente. Clúster retirado, ninguna restauración productiva, importación o migración. Fuente/configuración/unidades desplegadas, primer diario/semanal verificados y próxima ejecución 2026-11-02 03:30 Chile. Todas las filas financieras, preferencias y workflows originales preservados, con servicios disponibles sin reiniciar. Documentación previa del usuario conservada separada.


## PARTE 16 — Hogar compartido seguro y solo lectura

**Verificado el 2026-11-02 a las 01:47 America/Santiago.** [Contrato HRO](implementation/household-readonly-contract.md), [plan, pruebas e instrucciones](implementation/household-readonly-plan.md) y [producción](implementation/household-readonly-deployment.json).

Google validado por biblioteca oficial compatible con Node 18 y versión privada de sesión para rechazar tokens previos. Invitación pendiente tanto para cuentas nuevas como existentes; token de 32 bytes guardado solo como SHA-256, siete días, consumo atómico y límite concurrente de dos miembros. No hay activación por registrar correo. El dueño prepara/copía enlace, lo comparte manualmente, y la pareja acepta con el correo invitado. Fragmento retirado de URL, token temporal por pestaña y limpieza al aceptar/salir. Caché vaciado antes de cambiar identidad y selección del hogar protegida de respuestas tardías.

Lectura de dashboards, gastos/ingresos, cuenta corriente, saldo Fintoc guardado, revisiones y cartolas guardadas; proveedor y automatización reservados al titular. UI y servidor bloquean escrituras sin permiso, incluidos estados de alertas. Proyecciones de meses nuevos se calculan sin crear filas para miembros sin edición, conservando overrides/inactivas. Header privado y cuenta configurada en N8N webhook/callback/mapping; ningún usuario puede importar correos del titular desde su espacio propio. No se guardan payloads de ejecuciones ni claves en logs del proxy.

SDD→TDD: 847 pruebas backend, 342 frontend, 171 navegador y siete PWA aprobadas; 13 omisiones de viewport previstas. RSA real con certificados ficticios e integración HTTP/PostgreSQL temporal validan identidad, aceptación/renovación/vencimiento/concurrencia/revocación y lectura sin DML. En producción: solo 036 aditiva, metadatos/permisos comprobados, controller de proyecciones ejecutado con datos reales dentro de transacción READ ONLY sin escrituras, rutas/actores inválidos rechazados y once tablas financieras idénticas. Cero cuentas/invitaciones reales creadas para probar; sin importaciones ni consultas de movimientos al banco. Horarios, demás workflows y respaldo automático intactos. Repositorio/servidor actualizados; documentación previa del usuario preservada.

---

# PARTE 17 — División de gastos por categoría (2026-11-02)

[Contrato ESP previo al código](implementation/expense-splits-contract.md), [plan/TDD y uso](implementation/expense-splits-plan.md), [evidencia de producción](implementation/expense-splits-deployment.json).

Desde transacciones nacionales, internacionales con CLP o cargos elegibles de cuenta corriente: Dividir gasto abre una barra con separadores arrastrables y de dos a cincuenta partes. Cada parte tiene categoría arriba y monto CLP abajo, ambos montos se actualizan mientras se mueve el separador o se escribe un importe. Se pueden añadir/quitar partes o repartir por igual; confirmar exige suma exacta. Guardar/editar/deshacer actúan solo sobre un desglose asociado, con control de versión y confirmación explícita al retirar. La categoría original queda preservada y reaparece al deshacer.

Conciliación/importación sigue usando el cargo bancario completo y sus identificadores. Los dashboards atribuyen importes a las partes sin duplicar totales ni compras; varias partes de la misma categoría se agrupan. Sin categoría encuentra partes pendientes y muestra su importe. Solo lectura consulta el desglose sin escritura; permisos, offline, caché por espacio y protección de campos del original se mantienen.

RED observado antes de implementar; 917 pruebas backend, 374 frontend, 198 navegador y siete PWA aprobadas, con 13 omisiones previstas por viewport. Integraciones temporales HTTP/PostgreSQL comprueban preservación byte a byte, tres fuentes, conflictos/ABA, permisos y sumas exactas. Reimportar los tres tipos de compra omite la repetición sin cambiar padre o reparto; cartola con una parte sin categoría produce matched=1/link=1/insert=0.

Producción verificada el 2026-11-02 a las 21:13 America/Santiago: migración 037 aditiva, tablas nuevas vacías, grants y guardas comprobados, once tablas financieras y clasificaciones exactamente idénticas al respaldo previo, configuración/usuarios/membresías conservados. Backend e interfaz publicados desde `6d24d7e`; lecturas válidas 200 y escrituras inválidas/ajenas rechazadas, sin operaciones bancarias reales de prueba. Respaldo comprimido privado verificado, assets anteriores conservados, N8N y timer de respaldo activos. Repo y servidor actualizados con evidencia pública sin información bancaria.
