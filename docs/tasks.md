# tasks.md — Tareas de Implementación: Espacio Compartido del Hogar (Epic 11)

> **Subordinación:** subordinado a `constitution.md` v1.1, `spec.md` v1.1.0 (Epic 11) y `plan.md` v2.0.0.
> Las tareas de la épica PWA (completada) están en `archive/tasks-pwa.md`.
>
> **Metodología — Test-First obligatorio (TEST-001):** ciclo estricto por tarea:
> 🔴 RED (prueba que falla) → 🟢 GREEN (mínimo código) → 🔁 VERIFY (suite en verde).
> Las tareas `T-*` preceden SIEMPRE a su `I-*`. `walkthrough.md` se actualiza al final (Fase 5).

## Leyenda

`[ ]` pendiente · `[~]` en progreso · `[x]` completado · `[!]` bloqueado
`T-*` test · `I-*` implementación · `S-*` setup/config · `V-*` verificación

---

## Fase 0: Infraestructura de Pruebas API

| # | Tipo | Tarea | Req | Estado |
|---|---|---|---|---|
| 0.1 | S | Crear `tests/api/` + config Playwright (proyecto `api`, sin browser) | — | `[x]` |
| 0.2 | S | Helper `tests/api/helpers/users.js`: asegura 2 usuarios de prueba (dueño + miembro) vía register/login, retorna tokens | — | `[x]` |
| 0.3 | S | Limpieza de membresías/transacciones de prueba entre corridas (helpers/db.js) | — | `[x]` |
| 0.4 | V | Baseline: suite API corre contra backend local (baseline.spec.js) | — | `[x]` |

---

## Fase 1: Núcleo ACL Backend (membresías + middleware)

| # | Tipo | Tarea | Req | Estado |
|---|---|---|---|---|
| 1.T1 | 🔴 T | API: invitar email existente crea membresía activa; GET memberships del miembro incluye el espacio | 11.1, 11.4 | `[x]` |
| 1.T2 | 🔴 T | API: invitar email inexistente → `pending`; al registrarse ese email la membresía se vincula | 11.2 | `[x]` |
| 1.T3 | 🔴 T | API: 3er miembro → 400; email duplicado → 409; auto-invitación → 400 | 11.3 | `[x]` |
| 1.T4 | 🔴 T | API: request con `X-Space-Owner` sin membresía o inactiva → 403; con membresía → 200 | 11.5 | `[x]` |
| 1.T5 | 🔴 T | API: PUT members/:id cambia permisos/activo con efecto inmediato en siguiente request | 11.8 | `[x]` |
| 1.T6 | 🔴 T | API: endpoints `/api/space/members*` solo dueño (miembro → 403) | 11.10 | `[x]` |
| 1.S1 | S | Migración `026_create_space_members.sql` + correr en local | — | `[x]` |
| 1.I1 | 🟢 I | Modelo `SpaceMember.js` (CRUD, findMembership, linkPendingByEmail) | 11.1–11.3 | `[x]` |
| 1.I2 | 🟢 I | `spaceController.js` + `spaceRoutes.js` (memberships/members/invite/update/revoke) | 11.1–11.4 | `[x]` |
| 1.I3 | 🟢 I | Middleware `resolveSpace.js` + guards `requirePermission.js` | 11.5–11.8 | `[x]` |
| 1.I4 | 🟢 I | Hook en register/login Google: `linkPendingByEmail` | 11.2 | `[x]` |
| 1.V1 | 🔁 V | 1.T1–1.T6 en verde + suite E2E existente sin regresiones | — | `[x]` |

---

## Fase 2: Adopción en Controllers de Datos + Auditoría

> Un controller por commit: prueba de matriz de permisos primero, luego el cambio `req.user.id` → `req.spaceUserId`.

| # | Tipo | Tarea | Req | Estado |
|---|---|---|---|---|
| 2.T1 | 🔴 T | API matriz transactions: miembro ve (GET 200), sin can_edit POST/PUT → 403, sin can_delete DELETE/bulk → 403, con permisos → 200 y datos del espacio del dueño | 11.5–11.7 | `[x]` |
| 2.T2 | 🔴 T | API: transacción creada/editada por miembro registra `created_by`/`updated_by` = miembro | 11.11 | `[x]` |
| 2.T3 | 🔴 T | API matriz dashboard + financial-health + billing (lectura de espacio compartido) | 11.5 | `[x]` |
| 2.T4 | 🔴 T | API matriz categories / installments / intl-unbilled / checking / projected / suspicious | 11.5–11.7 | `[x]` |
| 2.T5 | 🔴 T | API: sync-emails como miembro → 403; como dueño → 200 | 11.9 | `[x]` |
| 2.T6 | 🔴 T | API: cardRoutes y billing config como miembro → 403 | 11.10 | `[x]` |
| 2.S1 | S | Migración `027_add_audit_to_transactions.sql` + correr en local | 11.11 | `[x]` |
| 2.I1 | 🟢 I | `transactionController`: spaceUserId + created_by/updated_by + guards en rutas | 11.6, 11.7, 11.11 | `[x]` |
| 2.I2 | 🟢 I | `dashboardController`, `financialHealthController`, `billingRoutes` (lectura) | 11.5 | `[x]` |
| 2.I3 | 🟢 I | `categoryController`, `installmentsController`, `intlUnbilledController`, `checkingController`, `projectedController`, `suspiciousRoutes` | 11.5–11.7 | `[x]` |
| 2.I4 | 🟢 I | `syncRoutes` sync-emails + `cardRoutes` + billing config con `requireOwner` | 11.9, 11.10 | `[x]` |
| 2.V1 | 🔁 V | 2.T1–2.T6 en verde + suite E2E existente sin regresiones | — | `[x]` |

---

## Fase 3: Frontend — Switcher, Gestión de Miembros y Permisos en UI

| # | Tipo | Tarea | Req | Estado |
|---|---|---|---|---|
| 3.T1 | 🔴 T | Unit: SpaceContext carga memberships, cambia espacio, persiste selección, maneja 403 → espacio propio | 11.13, borde | `[x]` |
| 3.T2 | 🔴 T | Unit: gating de botones — sin can_edit disabled con tooltip; sin can_delete idem; dueño todo habilitado | 11.6, 11.7, borde | `[x]` |
| 3.T3 | 🔴 T | E2E: dueño invita desde Settings, cambia toggles, desactiva y revoca | 11.1, 11.8 | `[x]` |
| 3.T4 | 🔴 T | E2E: miembro ve switcher, entra al espacio "Hogar", ve datos del dueño; sin switcher si no hay membresías | 11.4, 11.13 | `[x]` |
| 3.T5 | 🔴 T | E2E: SyncButton disabled para miembro; secciones de config ocultas | 11.9, 11.10 | `[x]` |
| 3.T6 | 🔴 T | Unit/E2E: CreatedByChip visible solo con >1 participante | 11.12 | `[x]` |
| 3.I1 | 🟢 I | `SpaceContext.jsx` + interceptor axios `X-Space-Owner` + manejo 403 | 11.5, 11.13 | `[x]` |
| 3.I2 | 🟢 I | `SpaceSwitcher.jsx` en DashboardLayout + refetch al cambiar espacio | 11.13 | `[x]` |
| 3.I3 | 🟢 I | `SpaceMembersSettings.jsx` en Settings (solo dueño) | 11.1, 11.8 | `[x]` |
| 3.I4 | 🟢 I | Gating de permisos en UI: Transactions completo (write/delete + tooltips); resto de páginas protegidas por 403 del backend (gating visual pendiente como mejora) | 11.6, 11.7 | `[x]` |
| 3.I5 | 🟢 I | SyncButton/config solo dueño en UI | 11.9, 11.10 | `[x]` |
| 3.I6 | 🟢 I | `CreatedByChip.jsx` en Transactions (cards y tabla) | 11.12 | `[x]` |
| 3.V1 | 🔁 V | 3.T1–3.T6 en verde | — | `[x]` |

---

## Fase 4: PWA/Caché por Espacio y Casos de Borde

| # | Tipo | Tarea | Req | Estado |
|---|---|---|---|---|
| 4.T1 | 🔴 T | Unit: readCache llavea por espacio; datos de un espacio no aparecen en otro | 11.14 | `[x]` |
| 4.T2 | 🔴 T | Unit: logout limpia readCache | 11.15 | `[x]` |
| 4.T3 | 🔴 T | E2E: revocación en vivo → siguiente acción devuelve al espacio propio con aviso | borde | `[x]` |
| 4.I1 | 🟢 I | Namespace de espacio en `readCache.js` + integración en fetchWithCache | 11.14 | `[x]` |
| 4.I2 | 🟢 I | `clearReadCache()` en logout (AuthContext) | 11.15 | `[x]` |
| 4.I3 | 🟢 I | Manejo de 403 en vivo (interceptor + aviso + switch automático) | borde | `[x]` |
| 4.V1 | 🔁 V | 4.T1–4.T3 en verde + suite completa | — | `[x]` |

---

## Fase 5: Auditoría, Deploy y Walkthrough

| # | Tipo | Tarea | Req | Estado |
|---|---|---|---|---|
| 5.1 | 🔁 V | Suite completa en verde: unit 26/26, API 14/14, E2E 67/67, pwa-build 7/7 | Todas | `[x]` |
| 5.2 | 🔁 V | Regresión: usuario sin membresías con UX idéntica (test 3.T4b + suite E2E previa completa) | — | `[x]` |
| 5.3 | S | Deploy al droplet (git pull + npm install + build + migrate + pm2 restart) | — | `[ ]` |
| 5.4 | 🔁 V | Verificación en producción con 2 cuentas reales (Rodrigo + pareja): invitar, permisos, espacio Hogar | — | `[ ]` |
| 5.5 | S | Actualizar `walkthrough.md`, `PROJECT_SUMMARY.md` y memoria | — | `[ ]` |

---

## Mapeo Req → Tareas

| Req | Tareas |
|---|---|
| 11.1–11.3 (invitaciones) | 1.T1–1.T3, 1.I1–1.I2, 3.T3, 3.I3 |
| 11.4 (memberships) | 1.T1, 1.I2, 3.T4 |
| 11.5 (403 espacio) | 1.T4, 1.I3, 2.T1–2.T4, 2.I1–2.I3 |
| 11.6–11.7 (can_edit/can_delete) | 2.T1, 2.T4, 2.I1, 2.I3, 3.T2, 3.I4 |
| 11.8 (efecto inmediato) | 1.T5, 1.I3, 3.T3 |
| 11.9 (sync solo dueño) | 2.T5, 2.I4, 3.T5, 3.I5 |
| 11.10 (config solo dueño) | 1.T6, 2.T6, 2.I4, 3.T5, 3.I5 |
| 11.11–11.12 (auditoría) | 2.T2, 2.S1, 2.I1, 3.T6, 3.I6 |
| 11.13 (switcher) | 3.T1, 3.T4, 3.I1–3.I2 |
| 11.14–11.15 (caché por espacio) | 4.T1–4.T2, 4.I1–4.I2 |

## Notas y Riesgos

- **No tocar datos productivos:** las 2 migraciones solo agregan tabla/columnas nullable.
- **Retrocompatibilidad:** sin `X-Space-Owner` todo opera igual que hoy; la suite E2E existente es la red de regresión y debe correr en verde en cada fase.
- **Sin staging:** validar matriz de permisos completa en local antes del deploy (5.1 es bloqueante de 5.3).
- **Google OAuth del miembro:** la pareja puede registrarse con Google; `linkPendingByEmail` debe correr también en ese flujo (1.I4).

---

*Versión: 2.0.0 (épica Espacio Compartido)*
*Última actualización: 2026-07-18*
