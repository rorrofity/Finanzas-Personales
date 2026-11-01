# Auditoría de dashboards — 31 de octubre de 2026

**Resultado:** se recomienda que la evolución mensual por categoría sea la vista principal, apoyada en una matriz de importes exactos y un detalle por categoría y mes. Antes del cambio visual deben alinearse los períodos y las fuentes que usan los distintos indicadores.

**Estado:** auditoría y propuesta. No se implementó ni desplegó un rediseño. No se modificaron gastos, clasificaciones, períodos persistidos, configuración de sincronización ni base de datos. No se ejecutaron migraciones, importaciones, limpieza de registros, login productivo ni suites que escriban en la base existente.

## Alcance y método

- Revisión de `Dashboard`, `FinancialHealth`, componentes de gráficos, indicadores, detalle, selector de período, tema, navegación, caché y permisos; controladores y rutas que los alimentan; pruebas y documentación SDD/TDD.
- Tres análisis independientes: interfaz, contrato de datos/pruebas y operación/despliegue. Los hallazgos de código se contrastaron con render local del frontend compilado, usando únicamente respuestas ficticias interceptadas y sin backend.
- Aplicación manual de la [skill oficial Impeccable](https://github.com/pbakaus/impeccable/blob/main/.agents/skills/impeccable/SKILL.md) y de su [guía audit](https://github.com/pbakaus/impeccable/blob/main/.agents/skills/impeccable/reference/audit.md), versión leída 4.8.0. Modo de superficie: **Operate**, donde importan precisión, comprensión y rapidez de consulta. El launcher y el detector no están instalados: se intentaron `context` y `detect` y ambos terminaron con «No such file or directory». No se atribuyen resultados a un detector automático ni se afirma una certificación de accesibilidad.
- Render local en Chromium, anchos 1440, 768 y 375 px. Se cambiaron pestañas y mes, se abrió el detalle y se revisó Salud Financiera. Todos los endpoints se sustituyeron por fixtures; se bloquearon destinos externos y métodos distintos de GET. Se observaron 57 peticiones API simuladas, cero intentos de escritura y cero errores JavaScript.
- Reproducción de controladores con módulo de BD simulado: 51 consultas en memoria, cero conexiones a PostgreSQL. Está descrita en [la propuesta SDD](../proposals/dashboard-category-evolution.md#reproducción-aislada-realizada).
- Acceso SSH al servidor y comprobaciones productivas exclusivamente de lectura. No se consultaron transacciones reales ni se usaron credenciales de usuarios para crear sesiones.

### Evaluación técnica manual según Impeccable

| Dimensión | Puntuación /4 | Motivo principal |
|---|---:|---|
| Accesibilidad | 2 | MUI aporta controles estándar, pero las categorías clicables no tienen interacción de teclado y el cierre del detalle carece de nombre accesible |
| Rendimiento | 2 | Hay división de código por ruta; las lecturas secuenciales del dashboard y las consultas por mes agregan esperas evitables |
| Tema y consistencia | 2 | Existe un tema central, pero las categorías usan paletas y colores por posición distintos entre vistas |
| Adaptación a pantallas | 2 | No hubo desbordamiento global a 375 px; sí se truncaron importes importantes y nombres de categorías |
| Integridad de la implementación | 1 | Períodos y fuentes diferentes, categorías omitidas y porcentajes que no describen el total esperado |
| **Total orientativo** | **9/20** | **Mejoras importantes pendientes para el objetivo de análisis mensual** |

Esta puntuación corresponde al alcance inspeccionado, sin detector automático, medición de rendimiento real, lector de pantalla ni prueba en dispositivo físico. No es una calificación del resto de la aplicación.

## Hallazgos priorizados

Se documentan **16 hallazgos: 10 P1 y 6 P2**. No se detectó en este alcance una pérdida de datos ni una incidencia P0. Las prioridades expresan impacto en la consulta, no cambios propuestos sobre registros.

| ID | Prioridad / dimensión | Evidencia | Impacto y recomendación |
|---|---|---|---|
| H01 | P1 · Integridad | `src/pages/Dashboard.js:86–95`; `backend/controllers/dashboardController.js:537–545`, `653–661` | Cambiar el mes actualiza overview y claves de caché, pero ambos históricos piden solo `months=6` y el backend toma el reloj actual. Anclar todas las vistas al mes final seleccionado y devolver el alcance aplicado. |
| H02 | P1 · Integridad | `backend/controllers/dashboardController.js:52–76`, `701–713`, `823–831` | Top categorías cuenta TC nacional e internacional; evolución y detalle suman también CC. Importe y participación de una categoría no explican el mismo universo. Reutilizar una selección de registros por período, fuente y espacio. |
| H03 | P1 · Integridad | `docs/constitution.md:172–176`; `docs/spec.md:346`; `backend/controllers/dashboardController.js:19`, `63` | La documentación establece facturación, pero el dashboard agrega por fecha de compra. Definir explícitamente la base temporal en SDD y usar los períodos ya persistidos, sin recalcularlos ni escribirlos. |
| H04 | P1 · Integridad | `src/pages/Dashboard.js:270–272`; evidencia render: 12 categorías suministradas, 10 series dibujadas | Se ocultan categorías después de la décima sin aviso. Mantener todas en la matriz y permitir seleccionar las series; cualquier agrupación visual debe declarar su alcance. |
| H05 | P1 · Integridad | `src/pages/FinancialHealth.jsx:60–69`, `485–487` | Se conservan seis categorías y el porcentaje se calcula sobre esas seis. Si hay más, la distribución aparenta representar el total. Usar el denominador completo y mostrar el resto o cambiar a una lista completa. |
| H06 | P1 · Integridad | `src/pages/FinancialHealth.jsx:147–151`, `424–435` | El texto de compromisos está limitado a 100%; el fixture de $3.350.000 sobre $2.000.000 muestra 100% en vez de 167,5%. Mantener el porcentaje real en el texto; la barra puede saturarse visualmente. Sin ingresos, mostrar «Sin base de ingresos». |
| H07 | P1 · Accesibilidad | `src/components/ui/CategoryBar.jsx:14–23`; `src/components/CategoryDetailDrawer.js:106–108`; DOM local confirma cierre sin etiqueta | La fila clicable es un div sin foco ni activación por teclado; cerrar el detalle depende de un botón sin nombre. Usar un botón semántico por categoría y nombre explícito del cierre. Referencia: [W3C, interacción con teclado](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html). |
| H08 | P1 · Integridad | `backend/controllers/dashboardController.js:397–440`; `backend/controllers/financialHealthController.js:119–124`, `143–154`, `197–208` | El desglose por categoría de Salud Financiera usa período del import y plantillas, mientras los compromisos usan facturación, cuotas y ocurrencias activas. Hacer que el desglose explique el mismo total proyectado; mantenerlo separado del gasto histórico. |
| H09 | P1 · Responsive | `src/components/ui/StatCard.jsx:48–54`; captura `dashboard-375.png` | A 375 px, $1.950.000 con delta se trunca visualmente. Que la página no desborde no garantiza que el importe sea legible. Reservar una línea completa para el monto o mover el delta, probando el propio elemento con importes grandes. |
| H10 | P1 · Accesibilidad / tema | `src/theme.js`; `src/components/ui/TrendDelta.jsx:27–40` | Los deltas pequeños usan verde #10B981 y rojo #EF4444 sobre blanco: contraste calculado 2,54:1 y 3,76:1. Ambos quedan bajo 4,5:1 para texto normal. Crear tonos de texto accesibles y conservar signos/flechas además del color. Referencia: [W3C, contraste mínimo](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). |
| H11 | P2 · Integridad | `backend/controllers/dashboardController.js:45–49`, `619–634` | «Balance» resta TC y CC en overview, pero solo CC en history. No son el mismo concepto. Documentar por separado resultado del período y flujo bancario, y alinear fórmulas cuando compartan etiqueta. |
| H12 | P2 · Jerarquía / tema | `src/pages/Dashboard.js:176–202`, `257–274`; `docs/archive/plan-dashboard.md:37` | La evolución por categoría está en una pestaña secundaria, a media anchura en escritorio, 240 px, apilada y sin leyenda. Los colores se asignan por posición y cambian entre conjuntos. Dar prioridad a matriz y tendencia seleccionable; identidad estable por ID. |
| H13 | P2 · Estados / integridad | `src/pages/Dashboard.js:72–107` | Las lecturas son secuenciales; al cambiar filtros pueden quedar gráficos anteriores visibles. Un fallo limpia overview pero conserva históricos. Añadir estados por sección y descarte de respuestas antiguas; distinguir error, caché y cero. El riesgo de respuestas fuera de orden es inferido del código, no reproducido contra la red real. |
| H14 | P2 · Trazabilidad | `backend/controllers/dashboardController.js:818`; `backend/migrations/17_create_checking.sql:17` | El detalle CC muestra el día 1 fabricado con `make_date`, aunque existe una fecha real. Mostrar `fecha` y el período por separado, sin modificar ninguno. |
| H15 | P2 · Rendimiento | `backend/controllers/dashboardController.js:553–616`, `667–721`; `src/pages/Dashboard.js:72–95` | Para seis meses, history realiza 30 consultas y evolution seis, además de overview. Agregar por rango/mes/categoría y ejecutar lecturas independientes en paralelo. El coste se identificó en código; no se midió latencia productiva. |
| H16 | P2 · Offline / estados | `src/components/CategoryDetailDrawer.js:53–65`; `src/pages/FinancialHealth.jsx:46–58` | El detalle y Salud Financiera usan lecturas directas sin la misma capa `fetchWithCache` del inicio. Documentar y probar disponibilidad de detalle por rango descargado, fecha de caché y mensajes claros cuando falten datos. |

### Patrones comunes

La dificultad principal nace de tres problemas: widgets con definiciones de datos independientes, reducciones silenciosas de categorías y una interfaz que resume el mes sin facilitar la comparación histórica. Mejorar solo colores o tamaños dejaría esos problemas abiertos.

### Qué conviene conservar

- React, MUI y Recharts ya cubren las necesidades; no se necesita cambiar de biblioteca ni rehacer la aplicación.
- Las tarjetas compactas, el desplegable de compromisos y el detalle lateral aportan una base reutilizable.
- La separación de espacios y la caché de lectura ya existen; deben extenderse con los filtros del análisis.
- La división de código por ruta funciona y el build compila. Las 65 pruebas unitarias existentes pasan.

## Recomendación de experiencia

1. **Inicio centrado en gastos por categoría.** Título claro, mes final y ventana 3/6/12 meses. Base «Facturación», fuentes y cobertura visibles. La primera entrega debe mostrar las clasificaciones que ya existen.
2. **Matriz categoría × mes con importes CLP exactos.** Todas las categorías, incluida «Sin categoría»; totales mensuales y variaciones en pesos y porcentaje. Permitir ordenar por gasto o alza sin cambiar los datos subyacentes.
3. **Tendencia para la categoría seleccionada.** Una línea por defecto; comparación de pocas categorías cuando aporte valor. Colores ligados a ID y nombres visibles. El apilado puede quedar como vista complementaria de composición.
4. **Cada importe abre su categoría y su mes.** Mantener rango y fuentes al volver. El usuario debe poder explicar cualquier cambio revisando sus movimientos existentes.
5. **Móvil con números completos.** Priorizar la tendencia individual y una lista legible de categorías; matriz con desplazamiento limitado a su bloque. Evitar que el delta oculte dígitos del monto. Acciones disponibles por toque y teclado.
6. **Salud Financiera para liquidez y compromisos.** Proyección identificada, horizonte explícito y desglose que concilie con su total. El gasto registrado y las obligaciones futuras requieren etiquetas distintas.

La demostración interactiva de esta entrega utiliza datos íntegramente ficticios y sirve para explorar matriz, tendencia y detalle. No consume datos de la aplicación ni representa un rediseño desplegado.

## SDD y TDD antes de implementar

La especificación detallada está en [docs/proposals/dashboard-category-evolution.md](../proposals/dashboard-category-evolution.md). Se mantiene separada porque `docs/plan.md`, `docs/tasks.md`, `docs/spec.md`, `docs/constitution.md` y `docs/walkthrough.md` ya tenían cambios del usuario; el plan activo es Epic 14, conciliación bancaria.

- Al aceptar la nueva experiencia deben enmendarse expresamente los criterios visuales de Req 12.4/12.5. La propuesta no cambia retroactivamente los requisitos ni autoriza debilitar las pruebas existentes.
- Conservar IDs, nombres, tipos, montos y períodos guardados. Resolver la discrepancia de base temporal mediante lecturas y etiquetas, sin reescribir el histórico.
- Un total debe conciliar con la suma de categorías y con su detalle para idénticos filtros. Las cuotas/proyecciones no se suman de nuevo al gasto observado.
- No introducir una deduplicación por parecido de descripción/fecha/monto. Cuando no haya una vinculación existente que pruebe equivalencia entre fuentes, mostrar alcance y limitaciones sin descartar registros.
- Período anterior cero: diferencia absoluta y porcentaje no calculable. Distinguir cero registrado, cobertura desconocida, mes en curso, futuro, error y falta de caché. Un mes pasado no se presume completo únicamente por su fecha.
- `PeriodProvider` elige inicialmente el mes siguiente (`src/contexts/PeriodContext.js:82–95`). Para un análisis histórico debe especificarse si se inicia en el último período con datos o se conserva la selección global, siempre indicando períodos futuros. No modificar globalmente ese comportamiento como efecto secundario.
- Ciclo por fase: escribir y observar fallar la prueba (**RED**), implementar (**GREEN**) y verificar la regresión (**VERIFY**). La auditoría y la demostración no constituyen el RED de una implementación futura.
- E2E visuales con frontend local y todas las API interceptadas; API de integración solamente sobre una base creada y desechada para las pruebas, aislada de los datos actuales.

### Vacíos concretos de cobertura

`tests/e2e/dashboard-redesign.spec.js:95–102` denomina un caso «tabs alternan», pero solo comprueba que las pestañas sean visibles. No las pulsa ni valida series, meses o totales. Los fixtures actuales usan un único mes. Las pruebas API de overview no contrastan conjuntamente TC, internacional y CC.

Añadir pruebas para el rango terminado en un mes histórico, enero/diciembre, categorías nulas y más de diez, nombres largos, importe grande con delta, selección de una celda de otro mes, fuentes coherentes, porcentajes con cero y >100%, ACL/caché, offline y respuestas fuera de orden.

## Servidor y despliegue

### Comprobado durante esta auditoría

| Comprobación | Resultado |
|---|---|
| SSH con autenticación existente y host conocido | Conexión exitosa, solo lectura |
| Ruta remota | `/var/www/finanzas-personales` |
| SHA remoto | `23c3e188b4ed2588f372d2bbf6fce11ee861d120` |
| SHA local al inicio | `7d168fc` — diferencia local de documentación en el último commit |
| Estado remoto | Archivo no versionado `.env.production`; se preservó y no se leyó su contenido |
| Coincidencia de fuentes | SHA-256 idénticos en Dashboard.js, FinancialHealth.jsx y ambos controladores respectivos |
| PM2 | `finanzas-backend` online, Node 18.20.8 |
| App pública | GET `/` → 200 HTML |
| Protección del dashboard | GET `/api/dashboard/overview` sin sesión → 401 JSON |

Estas comprobaciones acreditan acceso y servicio, no validan la exactitud de importes reales ni la salud de PostgreSQL. El endpoint `/api/health` puede quedar sombreado por el catch-all HTML, según `docs/walkthrough.md:51` y `backend/server.js:118–139`; no debe usarse como única señal de salud.

### Documentación operativa que necesita corrección

- `DEPLOYMENT.md`, `README.md` y `scripts/README.md` mencionan `scripts/deploy-to-production.sh` y `DEPLOYMENT_PROCESS.md`, pero no existen.
- `scripts/README.md:35–37` describe recrear la base; esa instrucción no corresponde a este trabajo y contradice expresamente la protección solicitada.
- El procedimiento real está en `docs/walkthrough.md:181–194`: actualizar código en el servidor, construir frontend allí y reiniciar el proceso si corresponde. No incluye ejecutar migraciones automáticamente.
- Las suites API cargan `.env` y realizan INSERT/DELETE (`tests/api/helpers/db.js`, `tests/api/dashboard-overview.spec.js`). No se ejecutaron. Las variables de destino permiten apuntar a hosts externos sin una guardia técnica suficiente.
- El verificador de entorno presupone exactamente doce columnas y `backend/.env`, condiciones que no reflejan toda la evolución actual. No sirve como garantía de preservación.

### Procedimiento propuesto para una futura entrega

1. Completar y revisar especificación, pruebas fallando, implementación y verificaciones locales. Commit limitado a los archivos de esta mejora, sin incorporar cambios previos ajenos.
2. En el servidor, registrar SHA, estado del checkout y proceso, y preservar el build vigente para rollback. Respetar `.env` y `.env.production` sin sobrescribirlos.
3. Actualizar únicamente código/build de la mejora y construir **en el servidor**. Instalar dependencias solo si cambian y se revisa el lockfile. Para este alcance no se necesitan nuevas dependencias ni migraciones.
4. Si solo cambia frontend, servir el build con el procedimiento que preserve la disponibilidad. Si cambian lecturas backend, reiniciar únicamente `finanzas-backend` con la ventana operativa adecuada. No activar sync ni alterar sus horarios para probar el dashboard.
5. Comprobar procesos, assets, API de lectura y actualización de PWA. Las suites se ejecutan en local; no crear usuarios o transacciones de prueba en producción.
6. Ante fallo, recuperar únicamente código/build anteriores y reiniciar lo necesario. No restaurar, recrear ni sobrescribir la base para revertir una mejora de dashboards.

No se ejecutó este procedimiento durante la auditoría: la entrega solicitada es una recomendación y no hay todavía un rediseño implementado que desplegar.

## Verificaciones y evidencias

| Verificación | Resultado |
|---|---|
| `CI=true npm run test:unit -- --runInBand` | 15 suites, 65 pruebas, todas pasan |
| Build aislado del frontend actual | Compilación correcta; salida temporal fuera del build de trabajo |
| Controladores con BD simulada | Período desalineado y fórmulas distintas reproducidos; 51 lecturas simuladas, cero conexiones reales |
| Render actual 1440/768/375 px | Sin overflow global y sin errores JS; omisión de categorías, cifra truncada y porcentaje saturado confirmados |
| Demo interactiva 320/375/736 px | Interacciones, sumas, detalle y teclado verificados; sin errores ni overflow global |
| SSH y hashes de fuentes | Conexión correcta; cuatro archivos principales iguales entre local y servidor |

La compilación informó antigüedad de la base de Browserslist y las pruebas mostraron advertencias de cambios futuros de React Router; no se actualizaron dependencias como efecto secundario.

Evidencias del frontend actual, siempre con datos ficticios:

- [Dashboard escritorio](dashboard-2026-10-31/dashboard-1440.png) y [móvil](dashboard-2026-10-31/dashboard-375.png).
- [Categorías escritorio](dashboard-2026-10-31/categorias-1440.png) y [móvil](dashboard-2026-10-31/categorias-375.png).
- [Detalle escritorio](dashboard-2026-10-31/detalle-1440.png) y [móvil](dashboard-2026-10-31/detalle-375.png).
- [Salud Financiera escritorio](dashboard-2026-10-31/salud-1440.png) y [móvil](dashboard-2026-10-31/salud-375.png).
- [Peticiones simuladas y mediciones](dashboard-2026-10-31/evidence.json). También se incluyen capturas de 768 px en esa carpeta.

## Orden recomendado de trabajo

1. **P1 · `$impeccable shape` / `$impeccable clarify`:** cerrar la definición del período, fuentes, cobertura, gasto y proyección en SDD.
2. **P1 · `$impeccable harden`:** corregir contratos de lectura, denominadores y estados, con pruebas previas.
3. **P1 · `$impeccable layout` / `$impeccable adapt`:** matriz y tendencia como contenido principal, cifras completas y categorías operables con teclado y toque.
4. **P2 · `$impeccable optimize`:** reducir consultas y esperas secuenciales conservando los mismos resultados.
5. **P1/P2 · `$impeccable audit`:** repetir revisión visual y técnica sobre la implementación terminada, con pruebas de negocio además de las visuales.
6. **`$impeccable polish`:** ajuste final de espaciado, etiquetas y consistencia.

Los comandos anteriores describen etapas recomendadas; no se ejecutaron sus acciones de modificación. La siguiente entrega debe partir de los requisitos propuestos y del ciclo TDD, con el despliegue final al servidor existente.
