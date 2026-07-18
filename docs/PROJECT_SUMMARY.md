# 📋 Resumen del Proyecto — Finanzas Personales

> Documento de contexto general del proyecto. Generado a partir de la revisión completa del código y la documentación (julio 2026). Complementa a `constitution.md`, `spec.md`, `plan.md` y `tasks.md` (metodología Spec-Driven Development).

---

## 1. ¿Qué es?

**Finanzas Personales** es una aplicación web (PWA) self-hosted para el control integral de finanzas personales: gastos, cargos de tarjeta de crédito, cuenta corriente, compras en cuotas, proyecciones y salud financiera.

- **Producción**: https://finanzas.rocketflow.cl (Droplet Digital Ocean, IP 137.184.12.234)
- **N8N (automatización)**: https://rocketflow.cl
- **Repositorio**: https://github.com/rorrofity/Finanzas-Personales
- **Autor**: Rodrigo Pizarro
- **Origen**: desarrollado íntegramente con vibe coding; desde junio 2026 el proyecto se rige por **Spec-Driven Development (SDD)** + **Test-Driven Development (TDD)**.

---

## 2. Funcionalidades Principales

### 2.1 Autenticación
- Login local (email/password con bcrypt) + **Google OAuth 2.0**.
- JWT con expiración de 24 horas; middleware de autenticación en todas las rutas de escritura.

### 2.2 Transacciones de Tarjeta de Crédito (no facturadas)
- CRUD completo con categorización inline, tipos: `ingreso`, `gasto`, `pago`, `desestimar`.
- **Período de facturación**: regla de negocio central — compras con día >= 22 facturan 2 meses después; día < 22, mes siguiente. Configurable vía `BillingPeriodConfig`.
- Filtros por tarjeta (Visa/Mastercard), tipo y período. Cards de totales por página.
- Gestión de tarjetas de crédito en Settings (mapeo dinámico últimos 4 dígitos → tarjeta, usado también por N8N).

### 2.3 Importación de Archivos
- Soporta CSV y Excel (.xls/.xlsx) de cartolas bancarias (Banco de Chile, plantillas configurables en `backend/config/fileTemplates.js`).
- Historial de archivos subidos (`uploads_history/`), registro en tabla `imports`.
- **Detección de duplicados**: firma fecha + ABS(monto) + descripción normalizada (con fix de timezone). Duplicados exactos se omiten; coincidencias parciales van a revisión manual.

### 2.4 Sincronización de Emails vía N8N (✅ funcional)
- Botón "Sincronizar Emails" (on-demand, nunca automático — principio N8N-001).
- Flujo: Frontend → `POST /api/sync/sync-emails` → webhook N8N → Gmail API busca correos de cargos del Banco de Chile → parseo JS del snippet → `POST /api/sync/sync-save` → dedup por `email_id` en metadata JSONB → resultado `{imported, skipped}`.
- Detalles del workflow en `EMAIL_SYNC.md` y `EMAIL_SYNC_PROGRESS.md`.

### 2.5 Cuenta Corriente (Checking)
- Importación de cartola Excel del Banco de Chile (parseo desde fila 23: Fecha, Descripción, Cargos, Abonos, Saldo).
- Saldo conocido ("known balance") extraído de la cartola; listado de últimos 6 meses; dedup propio.

### 2.6 Compras en Cuotas
- Planes de cuotas (`installment_plans`) con generación automática de ocurrencias mensuales futuras.
- Pago individual de cuotas, edición y eliminación selectiva (solo pendientes o plan completo).

### 2.7 Transacciones Internacionales
- Compras en USD con `exchange_rate` y conversión a CLP (`intl_unbilled`), asociadas a período de facturación.

### 2.8 Transacciones Proyectadas
- Plantillas de gastos/ingresos recurrentes (`projected_templates`) con ocurrencias proyectadas por mes (`projected_occurrences`).

### 2.9 Dashboard
- Estadísticas por período de facturación, treemap de gastos por categoría con **drill-down interactivo**, comparación mensual, gastos TC por fecha calendario, toggle de cuenta corriente.

### 2.10 Salud Financiera
- Resumen: saldo cuenta corriente + compromisos TC (facturado/no facturado/cuotas/internacional) + proyecciones.
- `health_score` 0–100 con estados critical/warning/healthy/excellent; snapshots diarios (`financial_snapshots`); sistema de alertas descartables.

### 2.11 Detección de Duplicados Sospechosos
- Tabla `suspicious_duplicates` con estado pending/resolved, badge de pendientes en menú, UI de resolución (eliminar uno o mantener ambos).

### 2.12 PWA + Mobile (épica actual, mayormente implementada)
- Service Worker con Workbox (`src/service-worker.js`, InjectManifest de CRA): precache App Shell, NetworkFirst para GETs de API, CacheFirst para assets. Solo cachea lecturas.
- `manifest.json` completo (íconos 72→512 + maskable, shortcuts, standalone).
- **Offline solo-lectura**: `readCache.js` (IndexedDB vía idb) + `fetchWithCache`, hook `useOffline`, `OfflineContext`, `OfflineBanner`; escritura y sync deshabilitados sin conexión.
- Optimización mobile: tablas → cards en < 900px, drawer hamburguesa, MonthPicker responsivo (v1.2.0-mobile).

---

## 3. Stack y Arquitectura

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Material-UI 6 + Recharts + React Router 6, CRA (react-scripts 5) |
| PWA | Workbox 7 + idb (IndexedDB) |
| Backend | Node.js + Express 4, patrón MVC (routes → controllers → models) |
| Base de datos | PostgreSQL 14+ (~30 migraciones SQL en `backend/migrations/`) |
| Auth | JWT (jsonwebtoken) + bcryptjs + @react-oauth/google |
| Automatización | N8N en Docker (workflows Gmail → parseo → API) |
| Infraestructura | Digital Ocean Droplet + Caddy (SSL/reverse proxy) + PM2 |
| Testing | Playwright (E2E + PWA build) + Jest/RTL (unit) + fake-indexeddb |

```
Caddy (80/443, SSL Let's Encrypt)
  ├── finanzas.rocketflow.cl → Backend Express :3001 (PM2) → sirve build React + API
  └── rocketflow.cl → N8N :5678 (Docker)
PostgreSQL :5432 (finanzas_personales)
```

### API REST (prefijo `/api/`)
`/auth`, `/transactions`, `/dashboard`, `/projected`, `/categories`, `/installments`, `/intl-unbilled`, `/checking`, `/sync`, `/suspicious`, `/financial-health`, `/billing`, `/cards`.

### Tablas principales
`users`, `categories`, `transactions` (con `metadata` JSONB, `billing_year/month`), `imports`, `installment_plans` + occurrences, `intl_unbilled`, `checking` (+ known_balance), `projected_templates` + `projected_occurrences`, `financial_snapshots`, `suspicious_duplicates`, `credit_cards`, `billing_periods`.

---

## 4. Metodología de Trabajo (desde junio 2026)

- **SDD**: `docs/constitution.md` (principios innegociables) → `docs/spec.md` (requerimientos EARS por épica) → `docs/plan.md` (arquitectura) → `docs/tasks.md` (tareas RED→GREEN→VERIFY).
- **TDD obligatorio (TEST-001)**: ninguna implementación sin prueba que falle primero. Tareas `T-*` preceden a `I-*`.
- **Sin staging**: deploy directo a producción (`scripts/deploy-to-production.sh`); la validación exhaustiva local + suite de tests es crítica.
- Comandos: `npm run dev` (local), `npm run test:e2e`, `npm run test:e2e:pwa`, `npm run test:unit`, `npm run migrate`.

---

## 5. Estado Actual (julio 2026)

| Área | Estado |
|---|---|
| Core (transacciones, cuotas, intl, checking, dashboard, salud financiera) | ✅ En producción |
| Sync emails N8N | ✅ Funcional |
| PWA Fase 0–1 (setup tests, SW, manifest, íconos) | ✅ Completa |
| PWA Fase 2 (offline solo-lectura) | ✅ Implementada e integrada (pendiente actualizar checklist en tasks.md) |
| PWA Fase 3 (mobile responsive) | ✅ Mayormente completa (v1.2.0-mobile) |
| PWA Fase 4 (banner actualización SW, install prompt) | ⏳ Pendiente |
| PWA Fase 5 (Lighthouse, deploy PWA, walkthrough) | ⏳ Pendiente |

Hay trabajo sin commitear en `main` (PWA/offline/mobile) al momento de esta revisión.

---

## 6. Roadmap / Próximas Funcionalidades

1. ✅ **Épica PWA completada y desplegada a producción** (2026-07-18).
2. 🚧 **Espacio Compartido del Hogar (Epic 11)** — *épica actual, especificada el 2026-07-18*: el dueño invita (in-app, sin emails) hasta 2 miembros con permisos granulares (ver / crear+editar / eliminar) activables al instante. Modelo ACL sobre la cuenta del dueño (sin migrar datos), header `X-Space-Owner` + middleware `resolveSpace` (principio ACL-001), auditoría `created_by/updated_by`, sync N8N exclusivo del dueño, caché offline llaveado por espacio. El principio "una persona = un usuario" se mantiene; la enmienda constitucional v1.1 redefinió solo el alcance single-user. Ver spec.md Epic 11, plan.md v2 y tasks.md v2.
3. Mantener el droplet y el dominio actuales como plataforma productiva.

---

## 7. Documentación de Referencia

| Archivo | Contenido |
|---|---|
| `docs/constitution.md` | Principios, arquitectura, decisiones de diseño |
| `docs/spec.md` | Especificación funcional por épicas (notación EARS) |
| `docs/plan.md` | Plan técnico de la épica PWA |
| `docs/tasks.md` | Checklist de tareas TDD por fase |
| `SETUP.md` / `CONFIGURATION.md` | Configuración local y producción |
| `DEPLOYMENT.md` | Deploy al droplet |
| `EMAIL_SYNC.md` / `EMAIL_SYNC_PROGRESS.md` | Integración N8N + Gmail |
| `DUPLICATE_DETECTION.md` | Lógica de deduplicación |
| `FINANCIAL_HEALTH_SPEC.md` | Especificación de salud financiera |
| `NETSKOPE_BYPASS.md` | Túnel SSH para acceso desde red corporativa |
| `RULES.md` | Reglas de negocio |

---

*Última actualización: 2026-07-18*
