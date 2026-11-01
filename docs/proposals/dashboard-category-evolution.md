# Propuesta — Evolución mensual de gastos por categoría

**Estado:** Implementada, verificada y desplegada por instrucción del usuario el 2026-10-31; resultados registrados en [el plan](../implementation/dashboard-category-evolution-plan.md). Ver [contrato definitivo](../implementation/dashboard-category-evolution-contract.md).
**Fecha:** 2026-10-31.
**Identificadores:** `DCE-*`, provisionales y exclusivos de esta propuesta; no asignan una nueva épica ni modifican Epic 14.
**Subordinación:** [constitution.md](../constitution.md), [spec.md](../spec.md), [tests/README.md](../../tests/README.md). El plan y las tareas actuales corresponden a conciliación bancaria y permanecen intactos.

## 1. Problema y objetivo

La vista actual permite ver importes y distribuciones puntuales, pero dificulta responder: **qué categorías aumentaron, cuánto cambiaron y en qué meses ocurrió**. Además de la jerarquía visual, existen inconsistencias entre períodos, fuentes y fórmulas que deben resolverse en el contrato de lectura antes de rediseñar los gráficos.

El objetivo propuesto es una vista principal con evolución por categoría y una matriz categoría × mes, conciliables con su detalle. Todo se calcula sobre los registros y clasificaciones existentes. No se autoriza modificar datos, categorías, tipos, períodos persistidos ni esquema de la base de gastos.

## 2. Diagnóstico confirmado

| Hallazgo | Evidencia en el código actual | Consecuencia |
|---|---|---|
| El histórico ignora el período seleccionado | `src/pages/Dashboard.js:86–94` pide solamente `months: 6`; `backend/controllers/dashboardController.js:537–545` y `653–661` generan los meses desde `new Date()` | Tarjetas y gráficos pueden describir períodos distintos |
| Top categorías usa TC nacional + internacional; evolución y detalle agregan CC | `dashboardController.js:52–76`, `701–713`, `823–831` | Una categoría puede mostrar un total en la barra y otro al abrirla; sus porcentajes no representan el mismo universo |
| El mismo término «balance» tiene dos fórmulas | `dashboardController.js:45–49` resta TC y CC; `619–634` resta solamente CC | No se pueden conciliar indicadores con el histórico |
| El gráfico de categorías omite categorías después de la décima | `src/pages/Dashboard.js:270–271` | Se ocultan gastos sin una fila «Otros» ni acceso equivalente a todas las categorías |
| El detalle de CC reemplaza la fecha real por el día 1 | `dashboardController.js:818`; la tabla sí tiene `fecha` en `backend/migrations/17_create_checking.sql:17` | El detalle pierde trazabilidad temporal |
| La distribución de Salud Financiera y sus compromisos usan universos distintos | `dashboardController.js:397–440` usa período del import y plantillas; `financialHealthController.js:119–124`, `143–154`, `197–208` usa período de facturación, cuotas y ocurrencias activas | El gráfico no explica el total proyectado |
| La distribución de Salud Financiera corta a seis categorías | `src/pages/FinancialHealth.jsx:60–68` | Las proporciones del gráfico representan solo el subconjunto visible |
| Los criterios escritos hablan de facturación, pero el dashboard agrega por fecha calendario | `constitution.md:172–176`, `spec.md:233`, `346`; filtros de `dashboardController.js:19`, `63` | Debe explicitarse la base temporal antes de interpretar una tendencia |

Estos hallazgos provienen del código local. No equivalen a una validación de importes reales ni a una comprobación autenticada de la versión desplegada.

### Reproducción aislada realizada

Se cargaron los controladores existentes sustituyendo `backend/config/database` por un módulo simulado en memoria. Se fijó el reloj a `2026-10-31T12:00:00Z`. Cada consulta simulada devolvió una fila sintética con `total: "100"`, `saldo: "1000"`, `name: "Servicios"` y `categoria: "Servicios"`. Se invocaron `getMonthlyHistory`, `getCategoryEvolution` y `getOverview` con `year=2025`, `month=2`, `months=6`.

Resultado observado y comprobado mediante aserciones:

```json
{
  "clock": "2026-10-31",
  "selectedPeriod": { "year": 2025, "month": 2 },
  "historyLabels": ["May 2026", "Jun 2026", "Jul 2026", "Ago 2026", "Sep 2026", "Oct 2026"],
  "evolutionLabels": ["May 2026", "Jun 2026", "Jul 2026", "Ago 2026", "Sep 2026", "Oct 2026"],
  "syntheticIdenticalMonthlyValues": {
    "overviewBalance": -200,
    "historyBalance": 0,
    "overviewExpenses": 300,
    "overviewCategorySum": 100
  },
  "mockedReadQueries": 51,
  "actualDatabaseConnections": 0
}
```

Las 51 operaciones se verificaron como textos que comenzaban con `SELECT` o `WITH`; ninguna alcanzó PostgreSQL. Son resultados de un diagnóstico con valores sintéticos, no importes del hogar. **Esta reproducción no constituye la fase RED de una nueva implementación**: al comenzar cada tarea deberán escribirse y observarse fallar sus pruebas de aceptación específicas.

## 3. Alcance y definiciones de negocio

### 3.1 Período de facturación y registros existentes

La vista propuesta usa **período de facturación**, conforme a la constitución. El selector identifica el mes final de la ventana; una ventana de seis meses terminada en febrero de 2025 comprende septiembre de 2024 a febrero de 2025, independientemente de la fecha actual.

- TC nacional: utilizar los campos persistidos `billing_year` y `billing_month` cuyo significado contractual sea facturación.
- TC internacional: utilizar `period_year` y `period_month`, documentados como mes de facturación.
- CC: utilizar su período registrado `year`/`month` y explicar que se trata del cargo bancario del mes, no de una compra facturada en TC.
- Si un registro no tiene período de facturación utilizable, no inferir silenciosamente uno desde su fecha ni recategorizarlo. Informar su exclusión del rango por período no determinado. Cualquier respaldo basado en `imports.period_*` requiere demostrar primero que representa la misma definición; no asumirlo por similitud de nombre.
- Mostrar la fecha real del movimiento en el detalle, independientemente del período al que se imputa.

El posible modo «mes de compra/calendario» queda fuera de la primera implementación. Incorporarlo requeriría un criterio SDD propio, etiquetas visibles y pruebas independientes; no debe cambiar el significado del selector existente de forma implícita.

`PeriodProvider` inicia actualmente en el mes siguiente. La futura especificación deberá decidir si esta vista histórica inicia en el último período con datos o conserva la selección global; no se cambiará el valor global como efecto secundario. Un período futuro debe identificarse como tal, sin presentarlo como gasto observado cero ni mezclarlo con proyecciones.

### 3.2 Tres magnitudes diferentes

| Magnitud | Definición propuesta | Exclusiones y etiqueta |
|---|---|---|
| Gasto registrado del período | Movimientos reales clasificados como gasto en las fuentes seleccionadas y cargos CC elegibles, imputados al período definido arriba | Excluir `pago`, `desestimar`, pagos CC de tarjeta identificados por la regla vigente, ingresos y proyecciones. Mostrar fuentes incluidas |
| Flujo de cuenta corriente | Abonos CC menos cargos CC del mes, incluyendo la salida por pago de tarjeta cuando se presenta como flujo bancario | No denominarlo «balance de gastos» ni sumarlo al gasto TC; el pago de tarjeta reduce caja, pero no crea una segunda compra |
| Proyección/compromisos | Obligaciones previstas de TC, cuotas activas y ocurrencias proyectadas activas, con sus reglas documentadas de pagos | Presentarla en Salud Financiera y etiquetarla como proyección; no sumarla a la evolución histórica de gastos reales |

Para los gastos, la diferencia ingresos menos gasto elegible puede presentarse como «resultado del período» únicamente si comparte período, fuentes y cobertura explícitos. «Disponible hoy» es un dato de saldo con su fecha de referencia; no constituye un resultado histórico del mes seleccionado.

No ampliar en este trabajo la regla vigente de reconocimiento de pagos de tarjeta por descripción. No introducir deduplicación heurística por fecha, monto, descripción o similitud.

### 3.3 Doble conteo y alcance verificable

Una fila se identifica por `(fuente, id)`; no basta un ID aislado. Cuando dos fuentes representan el mismo cargo, solo una vinculación persistida existente y verificable puede demostrar esa identidad. Esta propuesta no crea vínculos, no elimina filas y no implementa la conciliación pendiente de Epic 14.

Si no existe esa vinculación, no se puede prometer un total consolidado sin duplicados. La implementación deberá mostrar el alcance por fuente y permitir inspeccionar sus registros. En ese caso, la presentación inicial separará fuentes; una suma de fuentes se denominará **suma de registros de las fuentes seleccionadas**, con cobertura y limitación visibles. No se describirá como gasto único verificado del hogar ni se descartarán movimientos sospechosos automáticamente.

La exclusión vigente de pagos CC de tarjeta evita una duplicación conocida de caja y compra; no demuestra ausencia de todas las duplicidades entre capturas, importaciones y distintas tablas.

## 4. Requisitos funcionales propuestos — EARS

| ID | Criterio de aceptación |
|---|---|
| DCE-01 | **Cuando** se seleccione un período de facturación y una ventana 3/6/12, el sistema **debe** mostrar exactamente esa ventana cronológica terminada en el período seleccionado, incluyendo cruces de año. |
| DCE-02 | **Mientras** se consulte la evolución, el sistema **debe** mostrar la base temporal «Facturación», las fuentes incluidas y las limitaciones de cobertura. |
| DCE-03 | **Cuando** un registro carezca de período de facturación utilizable, el sistema **debe** declararlo como no imputable sin modificar sus campos ni asignarle un período inventado. |
| DCE-04 | **Cuando** se calculen gasto, categorías, evolución o detalle para un mismo alcance, el sistema **debe** aplicar idénticos filtros de período, fuente, espacio y tipo. |
| DCE-05 | **Mientras** se calcule gasto, el sistema **debe** excluir pagos, desestimados y proyecciones; los cargos CC de pago TC identificados por la regla vigente **deben** excluirse de gasto y permanecer explicables en el flujo CC. |
| DCE-06 | **Si** no existe una vinculación persistida que permita reconocer un cargo entre fuentes, el sistema **debe** mantener la identidad fuente+registro, explicitar el alcance y evitar presentar el consolidado como libre de duplicados. |
| DCE-07 | **Cuando** se rendericen categorías, el sistema **debe** conservar los IDs y nombres existentes, incluir «Sin categoría» como grupo de lectura identificable y mantener colores estables por identidad. No cambiará clasificaciones persistidas. |
| DCE-08 | **Cuando** se abra la vista, el sistema **debe** permitir consultar todas las categorías mediante una matriz categoría × mes con montos CLP exactos y totales. Un subconjunto gráfico **debe** identificar su alcance y dar acceso a las restantes. |
| DCE-09 | **Cuando** se seleccione una categoría o una celda categoría × mes, el sistema **debe** abrir su evolución o sus movimientos respectivamente, conservando período, fuentes y espacio. El detalle **debe** mostrar fechas reales y procedencia. |
| DCE-10 | **Si** el mes anterior tiene gasto registrado cero, el sistema **debe** mostrar variación absoluta y porcentaje no calculable (`null`, «Sin base previa»); nunca infinito. De cero a cero mostrará diferencia absoluta cero sin inventar porcentaje. |
| DCE-11 | **Si** los datos no permiten comparar dos meses por cobertura ausente o incompleta, el sistema **debe** indicarlo y evitar presentar su diferencia como una conclusión fiable sobre el gasto real. |
| DCE-12 | **Cuando** no existan movimientos elegibles registrados, el sistema **debe** distinguir importe registrado cero de ausencia de cobertura; **si** el período está en curso o tiene incidencias conocidas, **debe** mostrar su condición. No presumirá que un mes pasado está completo por su antigüedad. |
| DCE-13 | **Mientras** se consulten gastos históricos, flujo CC y proyección, el sistema **debe** utilizar etiquetas y fórmulas distintas y documentadas, sin reutilizar «balance» para cálculos diferentes. |
| DCE-14 | **Cuando** cambien filtros o período, el sistema **debe** actualizar coordinadamente resumen, gráfico, matriz y detalle; una respuesta anterior tardía no **debe** reemplazar el estado de una consulta posterior. |
| DCE-15 | **Mientras** se use un espacio compartido, el sistema **debe** verificar su autorización por request y mantener la caché separada por usuario, espacio, período, ventana, fuentes y base temporal. |
| DCE-16 | **Mientras** no haya conexión, el sistema **debe** permitir solo lectura del alcance cacheado, indicar antigüedad y ausencia de rangos no descargados y volver a consultar al reconectarse. |
| DCE-17 | **Cuando** falle una lectura, el sistema **debe** presentar error o dato cacheado identificado; no convertir el fallo en gasto cero ni conservar silenciosamente un gráfico de otro período. |
| DCE-18 | **Mientras** se use la vista en escritorio o a 375 px, el sistema **debe** permitir comparar meses, identificar categorías y abrir su detalle con teclado o toque, sin depender de hover ni de color exclusivamente. La matriz podrá desplazarse dentro de su contenedor sin desbordar toda la página. |
| DCE-19 | **Cuando** se consulten montos internacionales sin conversión CLP persistida utilizable, el sistema **debe** declarar la exclusión o cobertura incompleta; no asumir CLP cero ni recalcular el histórico con un cambio actual. |
| DCE-20 | **Mientras** se implemente o despliegue esta mejora, el sistema **debe** conservar datos, categorías y contratos existentes; no se ejecutarán migraciones, importaciones, sincronizaciones ni escrituras financieras como parte de la mejora. |
| DCE-21 | **Mientras** se presenten indicadores y montos exactos a 375 px, el sistema **debe** mantener legible el importe CLP completo junto con su variación, sin truncarlo con puntos suspensivos ni exigir hover para conocerlo. **Si** el espacio compartido no alcanza, el sistema **debe** redistribuir valor y variación preservando su lectura. |

## 5. Experiencia propuesta

Esta experiencia cambia la prioridad visual fijada por Req 12.4/12.5 (Top 5 y gráficos bajo pestañas). Al aceptar la propuesta deberán enmendarse explícitamente esos criterios en la especificación vigente y actualizarse las pruebas para verificar el nuevo comportamiento, sin debilitarlas ni eliminar cobertura. Hasta entonces, esta propuesta no reemplaza los requisitos existentes.

1. Encabezado: «Evolución de gastos», período final y selector 3/6/12 meses. Debajo, base temporal, fuentes y cobertura.
2. Resumen del mismo alcance: gasto registrado del período, diferencia absoluta frente al anterior y categoría que más explica la variación. Los porcentajes y comparaciones respetan DCE-10/11.
3. Gráfico de evolución con selección de categoría y comparación opcional acotada. Ejes legibles; etiquetas y montos accesibles sin hover. Evitar diez segmentos apilados sin leyenda como vista principal.
4. Matriz de todas las categorías por mes, ordenable por gasto o variación. Primera columna y encabezados visibles al desplazarse. Cada celda abre movimientos del mes correspondiente.
5. Detalle de movimientos: importe exacto, fecha real, fuente y período imputado; conserva la posibilidad de volver al mismo contexto.

En móvil, priorizar categoría seleccionada y meses consecutivos, con selector accesible de categorías. La matriz sigue disponible con desplazamiento interno y etiquetas claras. Salud Financiera conserva una vista dedicada a compromisos, sin competir por el espacio principal de evolución histórica.

## 6. Contrato técnico de lectura propuesto

Para respetar Req 12.12 se recomienda un endpoint adicional, por ejemplo:

```text
GET /api/dashboard/expense-evolution
    ?endYear=2025&endMonth=2&months=6
    &basis=billing&sources=tc_nacional,tc_internacional
```

El nombre y formato final se fijarán al aceptar la especificación. No se propone editar ahora los endpoints actuales.

La respuesta deberá incluir:

- Alcance solicitado y aplicado: espacio resuelto, base temporal, fuentes y ventana.
- Meses con claves `YYYY-MM`, estado de período y cobertura declarada.
- Categorías con ID estable y nombre de presentación; grupo sin categoría con identificador reservado que no dependa del nombre del usuario.
- Celdas con mes, ID de categoría, importe registrado, cantidad de movimientos y estado de cobertura.
- Totales mensuales y por fuente, diferencias absolutas y porcentajes calculables.
- Exclusiones conocidas por período no determinado o conversión CLP ausente; no revelar filas fuera del espacio autorizado.
- Estado de consolidación entre fuentes y limitaciones verificables.
- Fecha real de obtención para distinguir caché de lectura reciente; no confundirla con fecha del último movimiento bancario.

Las categorías deben ser objetos identificados por ID, no propiedades dinámicas del objeto de mes. Esto evita colisiones con `year`, `month` o `label` y problemas con nombres que contienen puntos.

La misma selección canónica de registros debe sustentar los totales y el endpoint de detalle. Se evaluará una agregación acotada por mes/categoría/fuente para reducir consultas, sin introducir migraciones de índices ni tablas en esta propuesta. Los montos conservarán la precisión almacenada y usarán una política documentada de presentación CLP; no se redondearán filas antes de totalizar.

## 7. Invariantes que deben probarse

1. Para un alcance y mes: suma de celdas de categoría = total de registros elegibles del mes = suma del detalle correspondiente, con igual precisión.
2. Para cada celda: sus movimientos pertenecen al mismo espacio, fuentes, categoría y período; su suma y cantidad coinciden con la celda.
3. Cada registro se cuenta una vez por `(fuente, id)`; no hay exclusiones por coincidencias heurísticas. La ausencia de vínculos entre fuentes se comunica según DCE-06.
4. Categoría nula no desaparece; más de diez categorías no reduce el total visible en la matriz. Cambiar su nombre de presentación no cambia su identidad.
5. Pagos, desestimados y proyecciones no contribuyen al gasto histórico; un pago de tarjeta puede contribuir al flujo CC bajo su propia definición.
6. Ventana y detalle no dependen del reloj actual, salvo estados de período en curso, calculados en `America/Santiago`.
7. Cero registrado, cobertura desconocida, período incompleto, error y falta de caché son estados distintos.
8. Ninguna lectura dispara una mutación financiera o una sincronización; ningún dato de otro espacio llega a respuesta o caché.

## 8. Plan TDD propuesto

La tabla conserva el plan TDD aceptado. La ejecución y los resultados RED/GREEN/VERIFY están en [el plan de implementación](../implementation/dashboard-category-evolution-plan.md); los fallos de infraestructura no se contabilizaron como RED funcional.

| Fase | RED — prueba previa | GREEN — implementación mínima posterior | VERIFY — evidencia necesaria |
|---|---|---|---|
| DCE-F0: aislamiento | Pruebas de configuración que rechazan URL productiva/remota y una BD que no sea desechable y explícita; prueba que rechaza llamadas de red no simuladas en E2E de fixtures | Guardias de ejecución y configuración local exclusiva; fixtures sintéticos versionados | Ejecutar guardias contra valores de ejemplo rechazados; cero conexiones a datos existentes |
| DCE-F1: contrato y cálculo | Unitarias con DB simulada: ventana histórica, año nuevo/bisiesto, tipos excluidos, categorías nulas y >10, CLP ausente, cobertura, variación con divisor cero, identidades y conciliación de totales | Contrato y funciones de lectura para el modelo definido, sin cambios de persistencia | Invariantes en verde con datos sintéticos de TC, internacional y CC; revisión de consultas y ausencia de escrituras |
| DCE-F2: API y permisos | API sobre BD desechable: resumen/matriz/detalle concilian, fechas reales CC, períodos persistidos, parámetros inválidos, miembro autorizado y extraño rechazado | Endpoint adicional GET y detalle compatible; reutilizar autenticación y resolución de espacio | Suite API aislada en verde; ninguna conexión a BD local histórica ni productiva; contratos previos conservados |
| DCE-F3: experiencia | E2E con todos los endpoints interceptados, sin backend: cambiar período/ventana/fuente/categoría, matriz y celda del mes correcto, teclado/toque, importes y cobertura, errores y respuesta tardía. Para DCE-21, comprobar a 375 px el valor exacto y su geometría: `scrollWidth <= clientWidth` en el elemento del importe, junto a un delta grande y una categoría de nombre largo | Componentes de evolución/matriz y gestión coordinada de carga/errores; distribución de importe y delta que conserve su lectura completa | Escritorio y 375 px en verde, todas las categorías accesibles, sin desbordamiento global ni truncado del importe dentro de su propia caja; revisión visual con fixtures. La medida del viewport por sí sola no acredita legibilidad |
| DCE-F4: caché y regresión | Unitarias/E2E con fixtures: aislamiento por espacio, offline con/sin rango cacheado, antigüedad visible, reconexión y revocación | Extensión acotada de caché de lectura y estados | Pruebas de caché, ACL, PWA y regresión pertinentes en verde; build local correcto |
| DCE-F5: servidor | Antes de desplegar, pruebas locales del artefacto compilado y comprobación del procedimiento que excluye migraciones/escrituras | Despliegue exclusivo de código/build en el servidor del proyecto, después de completar el cambio revisable y sus verificaciones | Estado de procesos y respuestas HTTP de lectura; rollback de código disponible; no correr suites productivas ni crear datos de prueba |

### Fixtures de aceptación mínimos

- Ventana septiembre 2024–febrero 2025 con febrero bisiesto probado en un caso separado de 2024.
- Una categoría con TC, internacional y CC; cada registro con procedencia e ID diferentes, sin presumir duplicidad entre ellos.
- Dos registros idénticos en monto/fecha/descripción pero sin vínculo: permanecen identificables; no se descarta ninguno por heurística.
- Compra y pago de tarjeta, ingreso y desestimado; cada uno contribuye solo a la magnitud definida.
- Categoría nula, nombres largos, nombres `year`/`month` y nombres con puntos; doce o más categorías.
- Indicador de `$1.950.000` y caso extremo de `$999.999.999`, cada uno junto con una variación grande como `+999,9%` y categoría de nombre largo, a 375 px; verificar contenido exacto, ausencia de truncado y dimensiones del propio elemento del importe.
- Mes cero registrado, mes sin evidencia de cobertura, mes en curso, registro sin período y monto internacional sin CLP.
- Período anterior cero, período actual cero y cobertura no comparable.
- Dos espacios con permisos diferentes; cachés distintos para idénticos filtros.
- Proyecciones y cuotas activas/inactivas para verificar que el histórico no las incorpora y Salud Financiera conserva un contrato propio.

## 9. Guardias de protección de datos y despliegue

- Las E2E visuales deben servir exclusivamente el frontend local e interceptar todas las rutas API con fixtures; una ruta sin interceptar debe fallar, no alcanzar un backend por omisión.
- Las pruebas unitarias del cálculo y controladores deben sustituir el módulo de base de datos antes de cargarlo. No cargar `.env` real para esas pruebas.
- Las pruebas de API requieren una base desechable distinta de la base existente, con conexión explícita y verificación de host/nombre. Un nombre «test» por sí solo no demuestra aislamiento; debe verificarse el destino y que el entorno se creó para esa ejecución.
- Los helpers API actuales cargan `.env` y hacen `INSERT`/`DELETE`; no deben ejecutarse sobre los datos existentes como baseline de esta propuesta. Referencias: `tests/api/helpers/db.js:12–24`, `tests/api/dashboard-overview.spec.js:18–59`.
- No ejecutar `npm run migrate`, scripts de conciliación, imports, sync ni limpieza de registros como parte del trabajo de dashboards. Tampoco crear usuarios de prueba en producción.
- El despliegue, si se implementa, se realiza al servidor del proyecto siguiendo la documentación operativa verificada. No publicar los datos ni esta aplicación en un servicio alternativo.
- Comprobar el estado del checkout remoto, preservar cambios ajenos y preparar rollback del código antes de reemplazar la versión. El procedimiento no debe restaurar ni sobrescribir la base.
- Las comprobaciones productivas se limitan a lecturas; las suites con fixtures y las suites API se ejecutan localmente en sus entornos aislados.
- Si reiniciar procesos puede activar sincronizaciones programadas existentes, debe elegirse y documentarse un procedimiento que mantenga la mejora dentro del alcance de solo lectura; no disparar una sincronización para probar el dashboard.

## 10. Criterio de cierre de una futura implementación

La mejora estará completa cuando permita comparar todas las categorías entre meses del período elegido, sus celdas concilien con el detalle del mismo alcance, las limitaciones de cobertura y consolidación estén visibles, y las verificaciones locales pertinentes estén en verde tras el ciclo RED → GREEN → VERIFY. Deberá existir evidencia del despliegue al servidor y de sus lecturas posteriores, sin cambios en los datos financieros ni en sus clasificaciones.

La implementación autorizada se registra en los documentos de ejecución enlazados al inicio. La protección de registros y clasificaciones permanece vigente durante implementación, pruebas y despliegue.
