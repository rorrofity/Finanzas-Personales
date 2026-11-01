# Epic16 — ejecución de apariencia y lectura móvil

**Estado:** implementada, verificada y desplegada en producción. Fecha: 2026-10-31. Especificación: [AP-01–05 y MOB-01–09](appearance-mobile-contract.md). Datos, clasificaciones, backend, importador y sincronizaciones existentes se conservaron sin modificaciones.

## Decisiones de producto

- Preferencia por dispositivo: Claro, Oscuro y Automático, guardada solo en localStorage; Automático sigue el sistema. Selector accesible desde AppBar e inicio de sesión. Los cambios se reflejan también en color-scheme y metadatos de la PWA.
- En menos de 900 px, categorías como lista vertical con importe, diferencia en pesos y porcentaje, y nombre completo. La categoría se expande para mostrar meses verticales y abrir su detalle. No se dibuja la tabla de escritorio ni se exige desplazamiento lateral.
- Categorías es la vista móvil inicial; Tendencia se consulta aparte. El escritorio conserva matriz y gráfica. La categoría seleccionada se mantiene al cambiar la ventana del análisis.
- Resumen destacado, filtros compactos y detalle de cobertura agrupado, manteniendo incidencias visibles. Colores semánticos, superficies y gráficos adaptados a ambos modos.
- Sincronizar cuenta corriente es una propuesta independiente: [evaluación bancaria](../proposals/checking-daily-sync.md). El usuario exige alta como persona natural y costo cero; no se habilitan proveedores ni se contratan servicios en esta entrega.

## Evidencia TDD

| Área | RED observado | GREEN / verificación |
|---|---|---|
| Apariencia |11 fallos por falta de proveedor, selector yfactory; 2 garantías anteriores ya pasaban. Caso adicional de preferencia desde sessionStorage se rechazó con prueba previa | Preferencia local válida/inválida, almacenamiento bloqueado, sistema/cambio de sistema, almacenamiento de otra pestaña, control accesible, color de PWA y contraste |
| Lectura móvil |4 fallos por tabla lateral, ausencia de historial/tabs y resumen de incidencias | Lista de todas las categorías,historial vertical,detalle del mes,claro/oscuro,semántica y cifras exactas |
| Selección | La categoría elegida volvía a la inicial al cambiar ventana | Selección elevada al Dashboard y preservada por ID |
| E2E nuevo | La versión previa no tenía botón Apariencia ni lista móvil | Claro/oscuro/automático,persistencia,Login, 320 px,espacio compartido y ausencia de scroll lateral interno |
| Regresión DCE | Pruebas de matriz anteriores se adaptaron a escritorio o lista equivalente según ancho | Se conserva comprobación de todas las categorías,meses, fuentes,detalle,ceros,permisos,offline y respuestas tardías |

Las pruebas de porcentajes sin base se adaptaron para consultar las tarjetas de Categorías, donde se presenta esa variación en móvil; la vista Tendencia mantiene los importes mensuales y no duplica los indicadores de cada tarjeta. No se eliminó la comprobación de la condición de base cero.

## Entorno y datos

Las pruebas de navegador usan únicamente `127.0.0.1`, frontend estático y respuestas ficticias explícitas. Se bloquean peticiones API inesperadas, escrituras y destinos externos. Capturas: [QA](appearance-mobile-qa/evidence.json), exclusivamente con datos ficticios.

No se añadieron dependencias ni se modificaron backend o esquema. El despliegue construyó en el servidor, conservó el build previo y actualizó únicamente el frontend, sin reiniciar el backend ni tocar el scheduler. Se compararon huellas de las nueve tablas financieras antes y después y se verificó entrega de assets y PWA.

## Resultado de verificación local

- **Frontend:** 25 suites, **124 pruebas pasan**. Incluye contraste medido en ambas apariencias; se reprodujo RED de 4,2815:1 sobre el resumen claro y se corrigieron únicamente sus dos textos secundarios.
- **Backend:** 6 suites, **67 pruebas pasan**; código backend sin modificaciones.
- **Navegador:** **72 pruebas pasan**, 7 se omiten por su alcance de tamaño de pantalla. Se conservan ventanas, fuentes, todas las categorías, detalle, importes completos, offline y respuestas tardías, junto a apariencia, Login, persistencia, sistema, 320 px y espacio compartido.
- **PWA:** **7 pruebas pasan** sobre el mismo build final: manifest, registro/activación de SW, caché, actualización/SKIP_WAITING y safe-area.
- **Build final:** `/private/tmp/finanzas-appearance-mobile-final`, compilación correcta.
- **Revisión visual:** móvil de 375 px claro/oscuro y escritorio de 1440 px oscuro, más comprobación geométrica a 320/768 px. Lista e historial móviles tienen `scrollWidth == clientWidth`; cero errores JavaScript, peticiones API inesperadas o escrituras. Datos íntegramente ficticios.

**Total: 270 pruebas pasan**, además de las comprobaciones visuales. Las 7 omisiones de navegador no corresponden a fallos. Los comandos principales son `npm run test:unit -- --runInBand`, `npm run test:backend -- --runInBand` y `DASHBOARD_BUILD_DIR=/private/tmp/finanzas-appearance-mobile-final npm run test:dashboard`; PWA se ejecutó con configuración local sobre el mismo build.

## Despliegue e integridad

Código publicado en `origin/main`: **134d065d3716e8a7313d3640388f3b139c439672**. Construido en `/var/www/finanzas-personales` y verificado el **2026-10-31 a las 22:21:52 America/Santiago**. Se reemplazó el build de forma acotada, conservando los assets anteriores necesarios para pestañas y PWAs todavía no actualizadas.

El proceso `finanzas-backend` permaneció online con el mismo PID y tiempo de inicio; no se reinició ni se modificó su programación. App, JS principal, módulo de categorías móviles y SW públicos responden 200. Los endpoints del dashboard conservan 401 sin autenticación. La apariencia y la lista vertical están presentes en los assets activos.

Se compararon huellas por llave primaria y contenido de `categories`, `transactions`, `intl_unbilled`, `checking_transactions`, `checking_balances`, `installment_plans`, `installment_occurrences`, `projected_templates` y `projected_occurrences`. Resultado: **0 registros modificados, 0 eliminados y 0 añadidos**. Las huellas completas permanecen únicamente en el servidor; la [evidencia de despliegue](appearance-mobile-deployment.json) no contiene movimientos reales.

Rollback: código anterior `b92104db5fc2c828bac1ded63d7fcb4dea085f14` y build en `/var/backups/finanzas/appearance-mobile-20261031-134d065/build`. Revertir esta entrega requiere únicamente código/build, nunca restaurar la base.

Los cambios documentales previos de Epic14 y recuperación operativa se preservan separados. La propuesta de cuenta corriente refleja el requisito definitivo de alta como persona natural y costo cero; ninguna conexión o programación bancaria nueva se activó con esta entrega.
