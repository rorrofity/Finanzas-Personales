# tasks.md — Tareas de Implementación: Finanzas Personales PWA

> **Subordinación:** Este documento está subordinado a `constitution.md`, `spec.md` y `plan.md`. En caso de conflicto, la Constitución tiene prioridad absoluta.
>
> **Alcance:** Implementación de la **Epic 9 (PWA y Adaptación Mobile)**. La conversión es **frontend-only**: no se modifica el backend, la base de datos ni los flujos de negocio existentes. La app debe seguir "operando tal cual", añadiendo capa PWA + optimización mobile + consulta offline (solo lectura).
>
> **Metodología — Test-First obligatorio (TEST-001):** Cada tarea de implementación sigue el ciclo estricto:
> 1. **🔴 RED** — Escribir la prueba (Playwright E2E o unitaria) y ejecutarla para verificar que **FALLA**.
> 2. **🟢 GREEN** — Implementar el mínimo código necesario para que la prueba **PASE**.
> 3. **🔁 VERIFY** — Re-ejecutar la prueba (y la suite completa) para confirmar que pasa sin romper otras.
>
> Una tarea de implementación **no se marca completa** hasta que su prueba asociada pasa. Las tareas `T-*` (test) preceden SIEMPRE a su tarea `I-*` (implementación).
>
> **`walkthrough.md`:** Este documento se generará **únicamente al finalizar la implementación de código**, documentando lo efectivamente construido, decisiones tomadas y cómo ejecutar/validar la PWA. No se crea durante la fase de planificación.
>
> Cada tarea referencia su Req del `spec.md`. Marcar `[x]` al completar.

---

## Leyenda de Estado

- `[ ]` Pendiente
- `[~]` En progreso
- `[x]` Completado
- `[!]` Bloqueado

**Tipos de tarea:**
- `T-*` = **Test** (escribir prueba que debe fallar primero)
- `I-*` = **Implementación** (código que hace pasar la prueba)
- `S-*` = **Setup/Config** (sin prueba directa, p.ej. instalar dependencias)

---

## Fase 0: Setup de Testing (Prerrequisito)

> **Objetivo:** Infraestructura de pruebas lista ANTES de cualquier implementación.

| # | Tarea | Tipo | Estado |
|---|---|---|---|
| 0.1 | Instalar y configurar Playwright (`@playwright/test`) en el proyecto | S | `[x]` |
| 0.2 | Configurar `playwright.config.js` con viewports desktop + mobile (375px, 768px) | S | `[x]` |
| 0.3 | Crear estructura `tests/e2e/` y `tests/unit/` | S | `[x]` |
| 0.4 | Configurar script de test en `package.json` (`test:e2e`, `test:unit`) | S | `[x]` |
| 0.5 | Crear helper de autenticación para tests E2E (login programático) | S | `[x]` |
| 0.6 | Verificar baseline: ejecutar suite vacía y confirmar que el runner funciona | S | `[x]` |

**Criterio de aceptación Fase 0:** `npm run test:e2e` ejecuta Playwright correctamente contra la app local.

---

## Fase 1: Infraestructura PWA Base

> **Objetivo:** App instalable con Service Worker funcionando. **Sin romper** la funcionalidad existente.

| # | Tipo | Tarea | Req | Estado |
|---|---|---|---|---|
| 1.T1 | 🔴 T | E2E: prueba que el `manifest.json` se sirve con campos requeridos (name, icons, display=standalone) — **debe fallar** | 9.2 | `[x]` |
| 1.T2 | 🔴 T | E2E: prueba que el Service Worker se registra y la app es "installable" — **debe fallar** | 9.1 | `[x]` |
| 1.T3 | 🔴 T | E2E (regresión): login + navegación a Dashboard/Transactions funciona igual que hoy | — | `[x]` |
| 1.S1 | S | Instalar deps: `workbox-*`, `idb` (+ `sharp` dev para íconos) | 9.1 | `[x]` |
| 1.S2 | S | Workbox InjectManifest nativo de CRA (detecta `src/service-worker.js`) | 9.1 | `[x]` |
| 1.I1 | 🟢 I | Crear `src/service-worker.js` (precache App Shell + caching GET only) | 9.1, 9.5 | `[x]` |
| 1.I2 | 🟢 I | Crear `src/serviceWorkerRegistration.js` y registrar en `src/index.js` (solo prod) | 9.1 | `[x]` |
| 1.I3 | 🟢 I | Generar íconos PWA (72→512px + maskable) en `public/icons/` vía `scripts/generate-pwa-icons.js` | 9.2 | `[x]` |
| 1.I4 | 🟢 I | Actualizar `public/manifest.json` completo (íconos, shortcuts, theme, standalone) | 9.2, 9.7, 9.11 | `[x]` |
| 1.I5 | 🟢 I | Capturar screenshots (wide + narrow) en `public/screenshots/` | 9.2 | `[ ]` (diferido: opcional, no bloquea instalabilidad) |
| 1.V1 | 🔁 V | Re-ejecutar 1.T1, 1.T2, 1.T3 → todas **deben pasar** | 9.1, 9.2 | `[x]` |

**Criterio de aceptación Fase 1:** Pruebas 1.T* en verde (12/12: 9 dev + 3 build). Build compila con SW. Funcionalidad existente intacta. *Lighthouse pendiente para Fase 5.*

---

## Fase 2: Caché de Lectura y Estado Offline

> **Objetivo:** Consulta de datos sin conexión (solo lectura). Bloquear escritura offline con UI clara.

| # | Tipo | Tarea | Req | Estado |
|---|---|---|---|---|
| 2.T1 | 🔴 T | Unit: `useOffline` reacciona a eventos `online`/`offline` (`src/hooks/__tests__/useOffline.test.js`) | 9.3, 9.12 | `[x]` |
| 2.T2 | 🔴 T | Unit: `fetchWithCache` retorna caché cuando está offline (`src/services/__tests__/readCache.test.js`) | 9.3 | `[x]` |
| 2.T3 | 🔴 T | E2E: en modo offline (Playwright `context.setOffline`) se muestra banner + datos cacheados (`tests/e2e/offline.spec.js`) | 9.3 | `[x]` |
| 2.T4 | 🔴 T | E2E: en offline, botones Nueva/Editar/Eliminar están disabled con tooltip | 9.4 | `[x]` |
| 2.T5 | 🔴 T | E2E: en offline, `SyncButton` disabled con mensaje | 9.4 (borde) | `[x]` |
| 2.T6 | 🔴 T | E2E: al reconectar, los datos se refrescan automáticamente | 9.12 | `[x]` |
| 2.I1 | 🟢 I | Crear `src/services/readCache.js` con idb (`cacheRead`/`getCachedRead`) | 9.3 | `[x]` |
| 2.I2 | 🟢 I | Crear `src/hooks/useOffline.js` | 9.3, 9.12 | `[x]` |
| 2.I3 | 🟢 I | Crear `src/contexts/OfflineContext.jsx` | 9.3 | `[x]` |
| 2.I4 | 🟢 I | Crear `src/components/OfflineBanner.jsx` e integrar en `DashboardLayout` | 9.3 | `[x]` |
| 2.I5 | 🟢 I | Implementar `fetchWithCache` en GETs de Dashboard/Transactions | 9.3 | `[x]` |
| 2.I6 | 🟢 I | Deshabilitar botones de escritura en offline (tooltip "Requiere conexión") | 9.4 | `[x]` |
| 2.I7 | 🟢 I | Deshabilitar `SyncButton` en offline con mensaje inmediato | 9.4 (borde) | `[x]` |
| 2.I8 | 🟢 I | Refresco automático de datos al reconectar | 9.12 | `[x]` |
| 2.I9 | 🟢 I | Advertencia al 80% de quota de IndexedDB (`getStorageEstimate` en readCache.js) | 9.x (borde) | `[x]` |
| 2.V1 | 🔁 V | Re-ejecutar 2.T1–2.T6 → todas **deben pasar** (último run Playwright: passed) | 9.3, 9.4, 9.12 | `[x]` |

**Criterio de aceptación Fase 2:** ✅ CUMPLIDO — Pruebas 2.T* en verde. Sin conexión, el usuario consulta datos; no puede escribir y lo entiende claramente.

---

## Fase 3: Optimización Mobile (Responsive)

> **Objetivo:** Que la app se vea y opere bien en teléfono, manteniendo toda la funcionalidad.

| # | Tipo | Tarea | Req | Estado |
|---|---|---|---|---|
| 3.S1 | S | Auditar cada página en viewports 375px y 768px; documentar problemas | 9.8 | `[x]` |
| 3.T1 | 🔴 T | E2E (375px): Transactions renderiza cards, sin scroll horizontal — **debe fallar** | 9.8, 9.9 | `[x]` |
| 3.T2 | 🔴 T | E2E (375px): TransactionsIntl renderiza cards, sin overflow — **debe fallar** | 9.8, 9.9 | `[x]` |
| 3.T3 | 🔴 T | E2E (375px): Checking/Installments/Projected usables sin scroll horizontal — **debe fallar** | 9.8, 9.9 | `[x]` |
| 3.T4 | 🔴 T | E2E (375px): Dashboard y FinancialHealth apilan secciones, gráficos visibles — **debe fallar** | 9.8 | `[x]` |
| 3.T5 | 🔴 T | E2E (375px): drawer funciona como menú mobile (abre/cierra) — **debe fallar** | 9.8, 9.10 | `[x]` |
| 3.I1 | 🟢 I | Crear `src/components/ResponsiveTable.jsx` (tabla → cards en `< md`) | 9.8 | `[ ]` |
| 3.I2 | 🟢 I | Adaptar `Transactions.js` a cards en mobile | 9.8, 9.9 | `[x]` |
| 3.I3 | 🟢 I | Adaptar `TransactionsIntl.js` a layout mobile | 9.8, 9.9 | `[x]` |
| 3.I4 | 🟢 I | Adaptar `Checking.js`, `Installments.js`, `ProjectedTransactions.js` | 9.8, 9.9 | `[x]` |
| 3.I5 | 🟢 I | Ajustar `Dashboard.js` (alturas gráficos, densidad) | 9.8 | `[x]` |
| 3.I6 | 🟢 I | Ajustar `FinancialHealth.jsx` (multi-columna → stack) | 9.8 | `[x]` |
| 3.I7 | 🟢 I | Adaptar `DashboardLayout` drawer mobile (hamburguesa, swipe to close) | 9.8, 9.10 | `[x]` |
| 3.I8 | 🟢 I | Ajustar gráficos Recharts (ResponsiveContainer, tooltips touch) | 9.8, 9.10 | `[ ]` |
| 3.I9 | 🟢 I | Controles (filtros/selects/botones) accesibles sin scroll horizontal | 9.9 | `[ ]` |
| 3.I10 | 🟢 I | Pull-to-refresh en listados principales | 9.10 | `[ ]` |
| 3.I11 | 🟢 I | Áreas táctiles mínimas (44x44px) en botones e íconos | 9.8 | `[ ]` |
| 3.V1 | 🔁 V | Re-ejecutar 3.T1–3.T5 → todas **deben pasar** | 9.8, 9.9, 9.10 | `[x]` |

**Criterio de aceptación Fase 3:** Pruebas 3.T* en verde. Todas las páginas usables en teléfono sin scroll horizontal.

---

## Fase 4: Actualización SW e Install Prompt

> **Objetivo:** Experiencia de app instalada pulida.

| # | Tipo | Tarea | Req | Estado |
|---|---|---|---|---|
| 4.T1 | 🔴 T | E2E: con SW `waiting`, aparece banner "Nueva versión disponible" — **debe fallar** | 9.6 | `[ ]` |
| 4.T2 | 🔴 T | E2E: pulsar "Actualizar" recarga con nuevo SW activo — **debe fallar** | 9.6 | `[ ]` |
| 4.T3 | 🔴 T | E2E (standalone): viewport completo sin barra de navegador — **debe fallar** | 9.11 | `[ ]` |
| 4.I1 | 🟢 I | Detectar SW `waiting` + banner "Nueva versión" | 9.6 | `[ ]` |
| 4.I2 | 🟢 I | Botón "Actualizar" → `skipWaiting()` + reload | 9.6 | `[ ]` |
| 4.I3 | 🟢 I | Crear `src/components/InstallPrompt.jsx` (`beforeinstallprompt`) contextual | 9.2 | `[ ]` |
| 4.I4 | 🟢 I | Ajustar safe-area-insets (notch iOS) en layout standalone | 9.11 | `[ ]` |
| 4.V1 | 🔁 V | Re-ejecutar 4.T1–4.T3 → todas **deben pasar** | 9.6, 9.11 | `[ ]` |

**Criterio de aceptación Fase 4:** Pruebas 4.T* en verde. Instalable, abre standalone, se actualiza con aviso.

---

## Fase 5: Auditoría, Despliegue y Walkthrough

> **Objetivo:** Validar calidad de la suite completa y desplegar a producción con riesgo mínimo.

| # | Tipo | Tarea | Req | Estado |
|---|---|---|---|---|
| 5.1 | 🔁 V | Ejecutar suite completa (unit + E2E) → todo en verde | Todas | `[ ]` |
| 5.2 | 🔁 V | Test E2E de regresión: funcionalidad existente intacta (CRUD online, N8N sync) | N8N-001 | `[ ]` |
| 5.3 | S | Auditoría Lighthouse PWA (objetivo: installable + score > 90) | Todas | `[ ]` |
| 5.4 | 🟢 I | Optimizar bundle size (code splitting, lazy load de páginas) | 9.5 | `[ ]` |
| 5.5 | S | Pruebas en dispositivos reales: iOS Safari + Android Chrome | 9.7, 9.11 | `[ ]` |
| 5.6 | S | Deploy a producción vía `scripts/deploy-to-production.sh` | — | `[ ]` |
| 5.7 | 🔁 V | Verificación post-deploy: instalar PWA desde `finanzas.rocketflow.cl` | — | `[ ]` |
| 5.8 | S | **Generar `walkthrough.md`** documentando lo construido, decisiones y cómo validar | — | `[ ]` |

**Criterio de aceptación Fase 5:** Suite completa en verde, PWA en producción, sin regresiones, `walkthrough.md` generado.

---

## Mapeo Req → Tareas

| Req (spec.md) | Tareas |
|---|---|
| Req 9.1 (Service Worker) | 1.T2, 1.S1–1.S2, 1.I1–1.I2 |
| Req 9.2 (Manifest + íconos) | 1.T1, 1.I3–1.I5, 4.I3 |
| Req 9.3 (Lectura offline + banner) | 2.T1–2.T3, 2.I1–2.I5 |
| Req 9.4 (Bloquear escritura offline) | 2.T4–2.T5, 2.I6–2.I7 |
| Req 9.5 (Cache App Shell) | 1.I1, 5.4 |
| Req 9.6 (Actualización SW) | 4.T1–4.T2, 4.I1–4.I2 |
| Req 9.7 (Modo standalone) | 1.I4, 5.5 |
| Req 9.8 (Layout mobile) | 3.T1–3.T5, 3.I1–3.I8, 3.I11 |
| Req 9.9 (Controles sin scroll horizontal) | 3.T1–3.T3, 3.I2–3.I4, 3.I9 |
| Req 9.10 (Gestos táctiles) | 3.T5, 3.I7, 3.I8, 3.I10 |
| Req 9.11 (Standalone viewport) | 4.T3, 4.I4 |
| Req 9.12 (Refresco al reconectar) | 2.T6, 2.I2, 2.I8 |

---

## Notas y Riesgos

- **CRA y Workbox:** Create React App tiene soporte PWA limitado. Evaluar en tarea 1.S2 si conviene CRACO, `cra-template-pwa`, o migración futura a Vite. Decisión a confirmar con el usuario antes de implementar.
- **No tocar backend:** Cualquier tarea que sugiera cambios en backend/DB está fuera de alcance de esta épica (ver `plan.md` §6 y §8).
- **Despliegue directo a producción:** No hay staging. Validar exhaustivamente en local antes de 5.6.
- **Prioridad del usuario:** "que siga operando tal cual la aplicación" — las regresiones en funcionalidad existente son inaceptables (pruebas 1.T3 y 5.2 son críticas).
- **Test-First (TEST-001):** Toda tarea `I-*` requiere su prueba `T-*` fallando antes de implementar. No saltarse el ciclo RED→GREEN→VERIFY.
- **walkthrough.md:** Se genera en la tarea 5.8, al final, documentando la implementación real.

---

## Próxima Épica (fuera de este documento)

Tras cerrar las Fases 4–5, la siguiente épica a especificar vía SDD es **Multi-usuario (hogar)**: acceso de dos usuarios (Rodrigo + pareja) a las finanzas compartidas. Requiere primero enmendar `constitution.md` (principio "una persona = un usuario") y el out-of-scope de `spec.md`, y generar nuevos spec/plan/tasks para la épica. Ver `docs/PROJECT_SUMMARY.md` §6.

---

*Versión: 1.1.0*
*Última actualización: 2026-07-18 (estados Fase 2 sincronizados con el código real)*
