# Epic 15 — Evolución de gastos por categoría: plan SDD/TDD

**Estado:** implementada, verificada y desplegada en producción el 2026-10-31. **Datos y clasificaciones:** conservados sin modificaciones. **Epic14:** permanece independiente, sin activar conciliación ni migraciones.

Especificación: DCE-01–21 de [la propuesta aceptada](../proposals/dashboard-category-evolution.md). Contrato exacto: [API e interfaz](dashboard-category-evolution-contract.md). La selección de fuentes se inicia en TC nacional y conserva el período global; meses futuros y cobertura desconocida se identifican expresamente.

## Arquitectura

- Servicio de lectura específico y controladores GET detrás de auth/resolveSpace. CTE parametrizada con fuentes reales y períodos persistidos; agregación por período/categoría, sin una consulta por mes. Categorías por ID y fechas reales en detalle paginado.
- Vista principal de matriz y tendencia; montos y variaciones calculados desde un único alcance. Selector de categoría, fuente y ventana; cada celda lleva al detalle de ese mes. Saldo y compromisos anteriores quedan secundarios y etiquetados, sin mezclar su fórmula con el gasto analizado.
- Caché explícita de lectura por usuario, espacio y filtros; detalle también por categoría y página. Antigüedad visible, falta de caché diferenciada, errores sin convertir en ceros y respuestas antiguas descartadas.
- MUI y Recharts existentes. Sin bibliotecas nuevas ni cambio de base de datos. Interacción semántica, montos completos a 375px y desplazamiento horizontal limitado a la matriz.
- Salud Financiera conserva proyección como magnitud propia: su composición se obtiene del mismo resumen de compromisos, sin reutilizar una distribución histórica con otro universo. Porcentaje real visible aunque supere100%; ingreso cero identificado sin porcentaje inventado.

## Secuencia obligatoria

| Fase | RED | GREEN | VERIFY |
|---|---|---|---|
| Contrato/backend | Validación, período histórico, categorías completas, fuentes, exclusiones, precisión, detalle, soloSELECT y errores | Servicio/endpoint de lectura según contrato | Unitarias backend + SQL sobre cluster efímero; suma matriz=detalle |
| Lectura/frontend | Caché por identidad/filtros, offline con/sin datos, error y respuesta antigua | Servicio de lectura y gestión de estado | Unitarias sin red real ni .env |
| Interfaz | Matriz, selección y detalle, importes grandes, botón categorías, carga/errores | Componentes MUI y gráfica de línea | Unitarias frontend y E2E con todas las API interceptadas |
| Salud Financiera | Composición de compromisos mismo resumen, porcentaje>100%, ausencia de ingresos | Presentación consistente del mismo contrato existente | Unitarias específicas, sin cambios de registros |
| Integración | Pantalla nueva ausente falla con fixture | Build del cambio | E2E1440/768/375, rangos/teclado/offline/latencia, capturas, PWA pertinentes |
| Repositorio/despliegue | Guardias, destinos y rollback verificables | Commit/push de archivos propios y actualización del servidor | Pruebas verdes previas, hashes/HTTP/PM2 y lecturas en producción |

Un fallo de permisos de navegador o infraestructura no acredita RED: se resuelve y se repite hasta observar el fallo de comportamiento esperado. Las pruebas previas no se debilitan. Las que describían el antiguo layout se actualizan para comprobar la nueva experiencia y preservar permisos, detalle, vacíos y ausencia de desbordamiento.

## Protección y aislamiento

- Unitarias sustituyen la BD antes de cargar módulos. E2E sirven solo frontend y abortan API no simulada, mutaciones y destinos externos.
- SQL real se prueba únicamente con cluster PostgreSQL recién creado bajo /private/tmp, puerto55439 y nombre de prueba exclusivo; fixtures sintéticos, sin usar .env ni conectar bases existentes.
- Producción: no ejecutar migraciones, seeds, importaciones, sincronización, registro/login de prueba o suites que escriban. Consultas de comprobación únicamente SELECT. No alterar configuración del scheduler.
- Mantener cambios previos de los documentos de Epic14 fuera del commit de esta implementación. Registrar los archivos propios y la evidencia de RED/GREEN/VERIFY.
- El servidor construye el frontend y actualiza únicamente el código autorizado. Mantener SHA/build anteriores para rollback; nunca restaurar la BD para revertir este cambio.

## Evidencia RED → GREEN → VERIFY

- RED E2E observado contra build anterior: falta el encabezado «Evolución de gastos» (fallo funcional, después de habilitar el navegador local).
- RED frontend observado: categoría sin botón semántico y monto exacto marcado `noWrap`, que impide la garantía de legibilidad completa.
- Backend de servicio:38 pruebas fallaron primero por comportamiento no implementado. GREEN38/38. Controlador/rutas:11 pruebas fallaron primero y4 garantías de autenticación ya pasaban; GREEN15/15. VERIFY de backend completo:6 suites,67 pruebas pasan.
- Frontend: RED de matriz/controles, lectura/caché, respuestas tardías, detalle paginado, centavos y timeout. Pruebas adicionales reprodujeron el cierre interceptado por AppBar, encabezados sin fijar y fallback de liquidez ante403; se corrigieron antes de congelar código. VERIFY:21 suites,101 pruebas pasan.
- Salud Financiera:3 pruebas nuevas fallaron primero por porcentaje limitado a100%, composición con universo distinto y ausencia de mensaje de ingresos cero. GREEN4/4, incluida recuperación de error.
- Workbox: RED mostró NetworkFirst para nuevos endpoints y luego overview, capaz de eludir caché por identidad. GREEN5/5: estas lecturas usan NetworkOnly y delegan offline al caché por usuario/espacio; las demás estrategias permanecen iguales.
- SQL/API: `npm run test:dashboard:integration` pasó en PostgreSQL14 efímero. Ventana histórica,18 categorías, total211,20, detalle176,20 paginado2+2, períodos persistidos, fechas reales, exclusiones,401/403/200 y parámetros400 verificados. La instantánea SHA256 de todas las tablas ficticias fue idéntica antes/después.8 consultas SELECT/WITH para endpoints; cluster eliminado.
- Build final: `CI=true BUILD_PATH=/private/tmp/finanzas-dashboard-implementation-final REACT_APP_API_BASE_URL='' npm run build` compila correctamente.
- E2E sobre ese build: `DASHBOARD_BUILD_DIR=/private/tmp/finanzas-dashboard-implementation-final npm run test:dashboard` →59 pasan,2 omitidas por alcance exclusivo móvil,0 fallos. Cubre1440/768/375, fuentes, ventanas/cruce de año, categoría/celda, teclado, offline, respuestas tardías, errores, porcentajes, geometría de encabezados y las4 regresiones de totales compactos.
- PWA sobre el mismo build en loopback3106:7/7 pasan (manifest, instalación/activación de SW, caché Workbox, banner de actualización/SKIP_WAITING y safe-area).
- Revisión independiente detectó y permitió corregir formato de centavos, aislamiento de caché de liquidez y encabezados; la verificación final incluye esas correcciones.

**Total verificado:**234 pruebas automatizadas pasan, además de integración SQL/API;2 E2E se omiten en tamaños donde no corresponden. No se ejecutaron suites contra bases existentes ni pruebas de escritura en producción.

## Ejecución y despliegue

Código publicado en `origin/main`: **9993630426605f4bf7efdb1df83fc973aacbc8bf**. Construido **en el servidor** `/var/www/finanzas-personales`, en una carpeta nueva, antes de reemplazar el build activo. No se instalaron dependencias ni se ejecutaron migraciones. Se reinició únicamente `finanzas-backend`; PM2 confirmó estado online.

**Verificación productiva:** 2026-10-31 21:43:49 America/Santiago. App pública, JS principal y Service Worker responden200; ambos endpoints nuevos responden401 sin autenticación. Las lecturas autenticadas, con credencial breve confinada al servidor y sin login, confirmaron las cuatro selecciones de fuente, seis meses y conciliación matriz/total/detalle. No se ejecutaron registros de usuarios, imports ni sincronizaciones.

**Integridad:** huellas por llave primaria y contenido de nueve tablas financieras, guardadas antes/después exclusivamente en el servidor: `categories`, `transactions`, `intl_unbilled`, `checking_transactions`, `checking_balances`, `installment_plans`, `installment_occurrences`, `projected_templates`, `projected_occurrences`. Resultado: **0 registros modificados,0 eliminados,0 añadidos**. No se copiaron datos financieros al repositorio ni a las evidencias locales.

**Rollback disponible:** código anterior `23c3e188b4ed2588f372d2bbf6fce11ee861d120` y build anterior en `/var/backups/finanzas/dashboard-20261031-9993630/build`. La carpeta conserva logs y comprobaciones de integridad con acceso restringido. Un rollback de esta entrega recupera solo código/build; nunca restaura la base.

La evidencia pública del procedimiento, sin importes ni registros reales, está en [deployment.json](dashboard-category-evolution-deployment.json). Las capturas de escritorio/móvil y Salud Financiera en [QA](dashboard-category-evolution-qa/evidence.json) usan exclusivamente datos ficticios. Los cambios documentales previos de Epic14 y recuperación operativa se conservaron fuera de los commits de esta tarea.
