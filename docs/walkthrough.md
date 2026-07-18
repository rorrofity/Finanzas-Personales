# walkthrough.md — Épica PWA: lo construido y cómo validarlo

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
