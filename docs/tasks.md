# tasks.md — Tareas de Implementación: Rediseño del Dashboard (Epic 12)

> **Subordinación:** subordinado a `constitution.md` v1.1, `spec.md` v1.2.0 (Epic 12) y `plan.md` v3.0.0.
> Tareas de épicas anteriores en `archive/`.
>
> **Metodología — Test-First obligatorio (TEST-001):** 🔴 RED → 🟢 GREEN → 🔁 VERIFY.
> Los E2E que asuman el layout viejo del Dashboard se REESCRIBEN para el nuevo contrato en la misma fase (nunca se debilitan ni eliminan sin reemplazo).

## Leyenda

`[ ]` pendiente · `[~]` en progreso · `[x]` completado · `[!]` bloqueado

---

## Fase 0: API Overview (backend)

| # | Tipo | Tarea | Req | Estado |
|---|---|---|---|---|
| 0.T1 | 🔴 T | API: `GET /api/dashboard/overview` retorna shape completo (K1–K7) con datos sembrados del período | 12.1 | `[ ]` |
| 0.T2 | 🔴 T | API: deltas correctos vs período anterior; período anterior en 0 → `deltaPct: null` | 12.1, borde | `[ ]` |
| 0.T3 | 🔴 T | API: overview con `X-Space-Owner` — miembro 200 (datos del dueño), extraño 403 | 12.1 | `[ ]` |
| 0.I1 | 🟢 I | Helper `backend/utils/commitments.js` (extraído de financial-health, sin divergencia) | 12.1 | `[ ]` |
| 0.I2 | 🟢 I | `dashboardController.getOverview` + ruta con `auth`+`resolveSpace` | 12.1 | `[ ]` |
| 0.V1 | 🔁 V | 0.T1–0.T3 en verde + suite API previa sin regresiones | — | `[ ]` |

## Fase 1: Sistema de diseño compacto (componentes UI)

| # | Tipo | Tarea | Req | Estado |
|---|---|---|---|---|
| 1.T1 | 🔴 T | Unit: `StatCard` — valor formateado, label, estado vacío "Sin datos del período", skeleton | 12.2, 12.6, 12.7 | `[ ]` |
| 1.T2 | 🔴 T | Unit: `TrendDelta` — ▲/▼, color semántico invertible (gasto baja=verde), null → "—" | 12.2, borde | `[ ]` |
| 1.T3 | 🔴 T | Unit: `CategoryBar` — % de barra, monto, onClick | 12.4 | `[ ]` |
| 1.T4 | 🔴 T | Unit: `ChartTabs` — alterna el contenido visible | 12.5 | `[ ]` |
| 1.I1 | 🟢 I | `src/components/ui/`: StatCard, TrendDelta, SectionCard, CategoryBar, ChartTabs | 12.9 | `[ ]` |
| 1.V1 | 🔁 V | 1.T1–1.T4 en verde | — | `[ ]` |

## Fase 2: Dashboard rediseñado

| # | Tipo | Tarea | Req | Estado |
|---|---|---|---|---|
| 2.T1 | 🔴 T | E2E: Dashboard muestra 4 stat-cards con valores del overview mockeado (2 col en 375px, alto ≤96px) | 12.2 | `[ ]` |
| 2.T2 | 🔴 T | E2E: compromisos colapsados por defecto; tap expande el detalle | 12.3 | `[ ]` |
| 2.T3 | 🔴 T | E2E: top categorías como barras; tap navega al drill-down | 12.4 | `[ ]` |
| 2.T4 | 🔴 T | E2E: tabs alternan evolución/categorías; solo un gráfico visible; alto ≤260px en mobile | 12.5 | `[ ]` |
| 2.T5 | 🔴 T | E2E: skeletons con misma geometría durante carga; período vacío → CTA | 12.6, 12.7 | `[ ]` |
| 2.T6 | 🔴 T | E2E: ancho ≤ viewport físico en 375 (patrón mobile-responsive-fixes) | 12.11 | `[ ]` |
| 2.I1 | 🟢 I | Reescribir `Dashboard.js` (overview + fetchWithCache por espacio + componentes ui/) | 12.2–12.8 | `[ ]` |
| 2.I2 | 🟢 I | Actualizar E2E existentes que asumían el layout viejo del Dashboard (offline.spec, mobile-responsive.spec, space.spec si aplica) | 12.12 | `[ ]` |
| 2.V1 | 🔁 V | 2.T1–2.T6 + suite E2E completa en verde | — | `[ ]` |

## Fase 3: Totales compactos en páginas de datos (Req 12.10)

| # | Tipo | Tarea | Req | Estado |
|---|---|---|---|---|
| 3.T1 | 🔴 T | E2E: Transactions muestra fila de 3 StatCards compactas (una fila en 375px) en lugar de cards gigantes | 12.10 | `[ ]` |
| 3.I1 | 🟢 I | `Transactions.js` → StatCards | 12.10 | `[ ]` |
| 3.I2 | 🟢 I | `TransactionsIntl.js`, `Checking.js`, `ProjectedTransactions.js` → StatCards | 12.10 | `[ ]` |
| 3.V1 | 🔁 V | Suite E2E completa (incluye mobile-responsive-fixes) en verde | 12.11, 12.12 | `[ ]` |

## Fase 4: Deploy y verificación

| # | Tipo | Tarea | Req | Estado |
|---|---|---|---|---|
| 4.1 | 🔁 V | Suite completa: unit + API + E2E + pwa-build en verde | Todas | `[ ]` |
| 4.2 | S | Deploy al droplet (pull + build + pm2; sin migraciones) | — | `[ ]` |
| 4.3 | 🔁 V | Verificación visual en producción (viewport móvil) + confirmación de Rodrigo en su teléfono | — | `[ ]` |
| 4.4 | S | Actualizar walkthrough.md, PROJECT_SUMMARY.md y memoria | — | `[ ]` |

## Mapeo Req → Tareas

| Req | Tareas |
|---|---|
| 12.1 (overview API) | 0.T1–0.T3, 0.I1–0.I2 |
| 12.2 (stat-cards) | 1.T1–1.T2, 2.T1, 2.I1 |
| 12.3 (compromisos) | 2.T2, 2.I1 |
| 12.4 (top categorías) | 1.T3, 2.T3, 2.I1 |
| 12.5 (tabs de gráficos) | 1.T4, 2.T4, 2.I1 |
| 12.6–12.7 (vacío/skeleton) | 1.T1, 2.T5 |
| 12.8 (período/sync/offline/espacio) | 2.I1 (fetchWithCache), suite Epic 11 |
| 12.9 (sistema de diseño) | 1.I1 |
| 12.10 (páginas de datos) | 3.T1, 3.I1–3.I2 |
| 12.11 (ancho viewport) | 2.T6, 3.V1 |
| 12.12 (sin regresiones) | 2.I2, 3.V1, 4.1 |

## Notas y Riesgos

- **Formato CLP consistente**: reutilizar el formateador existente (Intl es-CL); montos grandes abreviados en stat-cards ($1,8M) con monto completo en tooltip.
- **Colores semánticos de delta**: para GASTOS, bajar es verde; para BALANCE/INGRESOS, subir es verde — TrendDelta recibe `positiveIsGood`.
- **No tocar** treemap/drill-down backend: el drawer de detalle de categoría se reusa tal cual.
- **Deploy sin migraciones** — riesgo bajo; el rollback es revertir el commit y rebuild.

---

*Versión: 3.0.0 (épica Rediseño Dashboard)*
*Última actualización: 2026-07-18*
