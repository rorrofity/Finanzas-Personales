# Evolución de gastos por categoría — contrato de implementación

Estado: implementado y validado localmente el 2026-10-31 por instrucción del usuario; ver [evidencia de pruebas y despliegue](dashboard-category-evolution-plan.md). Subordinado a la constitución y a los requisitos DCE-01–21 de [la propuesta](../proposals/dashboard-category-evolution.md). Esta iniciativa es independiente de Epic 14: no implementa conciliación ni cambia registros financieros.

## Decisiones adoptadas

- Base temporal exclusiva `billing`: TC nacional usa `billing_year`/`billing_month`, internacional `period_year`/`period_month`, cuenta corriente `year`/`month`. Sin respaldo inventado por fecha. Fecha real en detalle.
- Fuente inicial `tc_nacional`; selector permite nacional, internacional, cuenta corriente o todas. Las fuentes se conservan separadas en la respuesta; seleccionar varias muestra «Suma de registros de las fuentes seleccionadas» y advierte que no hay consolidación verificada entre fuentes.
- Se conserva la selección global del período, incluido su inicio actual en el mes siguiente; los meses futuros se identifican. No se cambia `PeriodProvider` como efecto secundario.
- Todas las categorías globales y del dueño permanecen accesibles, además del grupo de lectura `uncategorized` («Sin categoría»). IDs de categorías serializados como strings. Ninguna clasificación se modifica.
- Se excluyen pagos/desestimados/proyecciones y los cargos CC de pago de TC según la regla vigente, sin ampliar heurísticas ni deduplicar por similitud.
- Cobertura siempre declarada desconocida: no existe evidencia suficiente para certificar que un mes está completo. Diferencias describen registros disponibles, no una conclusión sobre el gasto bancario total.
- Nuevos endpoints GET; los anteriores conservan contrato. Las fuentes y el período se validan con allowlists y enteros completos.

## GET /api/dashboard/expense-evolution

Parámetros: `endYear` (2020–2050), `endMonth` (1–12), `months` (3, 6 o 12; por defecto 6), `basis=billing`, `sources` (lista separada por comas de `tc_nacional`, `tc_internacional`, `cuenta_corriente`; por defecto `tc_nacional`). Consultar también el mes anterior a la ventana para calcular variaciones sin alterar la ventana visible.

```json
{
  "scope": {"endYear":2026,"endMonth":10,"months":6,"basis":"billing","sources":["tc_nacional"]},
  "generatedAt":"2026-10-31T12:00:00.000Z",
  "months":[{
    "key":"2026-10","year":2026,"month":10,"label":"oct 2026",
    "status":"current","coverage":"unknown","total":400000,"count":2,
    "previousTotal":300000,"delta":100000,"deltaPct":33.33333333333333,
    "bySource":{"tc_nacional":{"total":400000,"count":2}}
  }],
  "categories":[{
    "id":"1","name":"Alimentación","total":400000,
    "currentTotal":400000,"previousTotal":300000,"delta":100000,"deltaPct":33.33333333333333,
    "values":[{"month":"2026-10","total":400000,"count":2}]
  }],
  "summary":{
    "total":400000,"count":2,"currentTotal":400000,"previousTotal":300000,
    "delta":100000,"deltaPct":33.33333333333333,
    "largestIncrease":{"categoryId":"1","name":"Alimentación","delta":100000}
  },
  "exclusions":{"missingPeriodCount":0,"missingCLPCount":0},
  "coverage":{
    "status":"unknown","consolidation":"single-source",
    "message":"Importes de movimientos registrados; cobertura bancaria no verificada.",
    "warnings":[]
  }
}
```

El ejemplo abrevia la matriz a un mes: la respuesta real devuelve exactamente `months` meses ordenados y un valor por mes para cada categoría. `summary.total/count` abarcan la ventana; `currentTotal` se refiere al mes final y `previousTotal` al mes inmediatamente anterior. `largestIncrease` es null si ninguna categoría aumenta. `deltaPct` es null con denominador cero. Los ceros son importes registrados, no pruebas de cobertura. `status` es `past`, `current` o `future` en America/Santiago. Para varias fuentes `consolidation` es `unverified` y se emite una advertencia explícita.

`missingPeriodCount` informa registros elegibles sin período válido en las fuentes seleccionadas, en todo el histórico (no se pueden ubicar en una ventana). `missingCLPCount` informa internacionales del rango visible con conversión persistida ausente. No se inventa una conversión ni se modifica el registro. El cliente identifica estos alcances al presentar las exclusiones.

## GET /api/dashboard/expense-evolution/transactions

Parámetros: `year`, `month`, `categoryId` (ID decimal positivo o `uncategorized`), `basis=billing`, `sources` como arriba; `limit` (1–200; por defecto100), `offset` (entero no negativo; por defecto0).

```json
{
  "scope":{"year":2026,"month":10,"categoryId":"1","basis":"billing","sources":["tc_nacional"]},
  "generatedAt":"2026-10-31T12:00:00.000Z",
  "category":{"id":"1","name":"Alimentación"},
  "total":400000,"count":2,"limit":100,"offset":0,"hasMore":false,
  "transactions":[{"id":"uuid","source":"tc_nacional","fecha":"2026-09-12","descripcion":"Movimiento registrado","amount":200000}]
}
```

El ejemplo abrevia movimientos. `total/count` describen todo el detalle elegible de esa celda; `transactions` es una página ordenada por fecha, fuente e ID. Misma selección canónica que la matriz, fecha real de movimiento, identidad fuente+ID. Una categoría ajena/no existente se rechaza sin revelar nombres. Todas las lecturas están detrás de auth + resolveSpace.

## Interfaz y compatibilidad

- Título «Evolución de gastos», selector «Ventana», selector «Fuente», selector «Categoría», tabla accesible «Gastos por categoría y mes». Una celda identifica categoría y mes en su nombre accesible y abre detalle con botón «Cerrar detalle».
- Matriz completa, totales mensuales, orden por importe o variación y tendencia de la categoría seleccionada; importes CLP completos, sin truncado a 375 px.
- Gasto, delta y categorías usan exclusivamente el nuevo contrato. Información de saldo/compromisos del overview anterior puede permanecer secundaria, identificada como tal; balance/ahorro históricos anteriores no se mezclan con el alcance nuevo.
- Req12.4/12.5 quedan enmendados por esta iniciativa: matriz y tendencia principal sustituyen la prioridad Top5/pestañas. Se conservan las garantías de consulta, detalle, compactación, permisos y accesibilidad y se amplían las pruebas.
- Caché incluye identidad autenticada, espacio, período, ventana, fuentes y base; detalle incluye categoría, período y página. La fecha de obtención se conserva, los fallos no se transforman en ceros y las respuestas tardías no reemplazan la consulta actual.
- El caché de Workbox no intercepta con fallback por URL los dos endpoints nuevos ni overview: usa NetworkOnly para estas lecturas. El servicio de la aplicación maneja su caché aislada, rechaza401/403 sin fallback y aplica timeout15s.
- El formato nuevo `formatCLPExact` conserva hasta dos decimales almacenados; la agregación conserva centavos antes de sumar. Los formatos existentes de otras páginas no se alteran.

## TDD y protección

Antes de cada implementación se registra su RED con comportamiento ausente, luego GREEN y VERIFY. Unitarias con módulos DB simulados antes de cargar los controladores; E2E con frontend aislado y API ficticia. Integración SQL solo con cluster PostgreSQL efímero en /private/tmp y puerto propio, nunca usando .env ni bases existentes. Producción: exclusivamente consultas SELECT y comprobaciones HTTP de lectura; cero migraciones/imports/sync/tests con escrituras. El despliegue actualiza código/build en el servidor y conserva rollback de código sin restaurar BD.
