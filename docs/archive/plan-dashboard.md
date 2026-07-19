# plan.md — Plan de Arquitectura Técnica: Rediseño del Dashboard (Epic 12)

> **Subordinación:** subordinado a `constitution.md` v1.1 y `spec.md` v1.2.0 (Epic 12).
> Planes anteriores archivados en `archive/` (PWA, Espacio Compartido).

---

## 1. Diseño de la vista (mobile-first)

```
┌─────────────────────────────────┐
│ [Período ▾]        [⟳ Sync]    │  ← header compacto en una fila
├─────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐        │
│ │ BALANCE │ │ GASTOS  │        │  ← stat-cards 2×2 (mobile)
│ │ $520.000│ │ $1.8M   │        │    número h5 + delta ▲▼ + label
│ │ ▲ 12%   │ │ ▼ 5%    │        │    (K1, K2, K3, K6) máx 96px
│ └─────────┘ └─────────┘        │
│ ┌─────────┐ ┌─────────┐        │
│ │ AHORRO  │ │DISPONIBLE│       │
│ └─────────┘ └─────────┘        │
├─────────────────────────────────┤
│ ▸ Compromisos próximos  $2.1M  │  ← K5 colapsable (Accordion denso)
├─────────────────────────────────┤
│ EN QUÉ SE VA (Top categorías)  │  ← K7: barras horizontales
│ Cuentas        ████████░ 38%   │    tap → drill-down existente
│ Compras casa   █████░░░░ 22%   │
│ ...                            │
├─────────────────────────────────┤
│ [Evolución] [Por categoría]    │  ← tabs segmentados, UN gráfico
│ ┌───────────────────────────┐  │    altura ≤260px mobile
│ │   gráfico activo          │  │
│ └───────────────────────────┘  │
└─────────────────────────────────┘
```

Desktop: stat-cards 4×1, compromisos y top categorías lado a lado (Grid md=6), zona de gráfico full-width.

## 2. Backend — un solo endpoint agregado

`GET /api/dashboard/overview?year&month` (`dashboardController.getOverview`):
- Reusa las queries existentes (summary, categorías, historia) + compromisos (misma lógica de financialHealth) en UNA respuesta:
```json
{
  "period": {"year":2026,"month":8},
  "balance": {"value":520000,"deltaPct":12.3},
  "gastos": {"value":1800000,"deltaPct":-5.1},
  "ingresos": {"value":2300000},
  "tasaAhorro": 0.22,
  "burnRate": {"dailyAvg":58000,"projectedClose":1950000},
  "disponibleHoy": 1031242,
  "compromisos": {"total":2100000,"tcNoFacturado":1200000,"cuotas":600000,"proyectados":300000},
  "topCategorias": [{"id":1,"name":"Cuentas","total":700000,"pct":0.38,"deltaPct":4.0}]
}
```
- Montado tras `auth` + `resolveSpace` (funciona en espacio compartido). Deltas contra el período anterior; divisor 0 → `deltaPct: null`.
- Sin migraciones. Endpoints existentes intactos (Req 12.12).

## 3. Frontend — sistema de diseño compacto

| Componente nuevo | Rol |
|---|---|
| `src/components/ui/StatCard.jsx` | Card compacta: label caption + valor h5 + `TrendDelta` + estado vacío/skeleton integrados |
| `src/components/ui/TrendDelta.jsx` | ▲/▼ + % con color semántico (para gasto: bajar=verde) y `null` → "—" |
| `src/components/ui/SectionCard.jsx` | Contenedor de sección con título overline y padding denso |
| `src/components/ui/CategoryBar.jsx` | Fila categoría: nombre + barra % + monto, clickeable |
| `src/components/ui/ChartTabs.jsx` | Tabs segmentados que alternan el gráfico visible |

- `Dashboard.js` se reescribe consumiendo `fetchWithCache('dashboard:overview:<periodo>', …)` (offline + espacio ✓, Req 12.8).
- Drill-down de categoría se conserva (reusa `CategoryDetailDrawer`).
- Req 12.10: `Transactions/TransactionsIntl/Checking/Projected` reemplazan sus 3 cards de totales por `<StatCard>` en grid 3 columnas (una fila), sin tocar su lógica de datos.
- Skeletons: `@mui/material Skeleton` dentro de StatCard/SectionCard con la misma geometría (Req 12.7).

## 4. Estrategia de Pruebas (TEST-001)

| Capa | Cobertura |
|---|---|
| API (Playwright request) | overview: shape completo, deltas correctos con datos sembrados, delta null con período anterior 0, 403 espacio ajeno sin membresía, 200 como miembro |
| Unit (Jest/RTL) | StatCard (valor/delta/vacío/skeleton), TrendDelta (signos, colores, null), CategoryBar (%), ChartTabs (alternancia) |
| E2E | Dashboard renderiza stat-cards con datos mockeados; tabs alternan gráficos; top categorías navega al drill-down; ancho ≤ viewport en 375 (patrón absoluto de mobile-responsive-fixes); regresión de páginas con nuevos totales compactos |

## 5. Fases (detalle en tasks.md)

0. Tests API de overview (RED) → 1. Backend `getOverview` (GREEN)
2. Componentes UI base con unit tests (RED→GREEN)
3. Rediseño de `Dashboard.js` + E2E (actualizando los E2E que asuman el layout viejo — nunca debilitados, reescritos para el nuevo contrato)
4. Req 12.10: totales compactos en las 4 páginas de transacciones + regresión completa
5. Deploy + verificación en producción + walkthrough

**Riesgos:** (a) los E2E existentes de Dashboard asumen el layout viejo — se actualizan en Fase 3 junto al cambio; (b) el cálculo de compromisos duplica lógica de financial-health → extraer a helper compartido `backend/utils/commitments.js` para no divergir.

---

*Versión: 3.0.0 (épica Rediseño Dashboard)*
*Última actualización: 2026-07-18*
