# Epic16 — ejecución de apariencia y lectura móvil

**Estado:** implementada y verificada localmente; publicación y despliegue pendientes. Fecha: 2026-10-31. Especificación: [AP-01–05 y MOB-01–09](appearance-mobile-contract.md). Datos, clasificaciones, backend, importador y sincronizaciones existentes permanecen fuera del alcance de modificación.

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

No se añadieron dependencias ni se modificaron backend o esquema. El despliegue construirá en el servidor, conservará el build previo y actualizará únicamente el frontend, sin reiniciar el backend ni tocar el scheduler. Se compararán huellas de las nueve tablas financieras antes y después y se verificará entrega de assets y PWA.

## Resultado de verificación local

- **Frontend:** 25 suites, **124 pruebas pasan**. Incluye contraste medido en ambas apariencias; se reprodujo RED de 4,2815:1 sobre el resumen claro y se corrigieron únicamente sus dos textos secundarios.
- **Backend:** 6 suites, **67 pruebas pasan**; código backend sin modificaciones.
- **Navegador:** **72 pruebas pasan**, 7 se omiten por su alcance de tamaño de pantalla. Se conservan ventanas, fuentes, todas las categorías, detalle, importes completos, offline y respuestas tardías, junto a apariencia, Login, persistencia, sistema, 320 px y espacio compartido.
- **PWA:** **7 pruebas pasan** sobre el mismo build final: manifest, registro/activación de SW, caché, actualización/SKIP_WAITING y safe-area.
- **Build final:** `/private/tmp/finanzas-appearance-mobile-final`, compilación correcta.
- **Revisión visual:** móvil de 375 px claro/oscuro y escritorio de 1440 px oscuro, más comprobación geométrica a 320/768 px. Lista e historial móviles tienen `scrollWidth == clientWidth`; cero errores JavaScript, peticiones API inesperadas o escrituras. Datos íntegramente ficticios.

**Total: 270 pruebas pasan**, además de las comprobaciones visuales. Las 7 omisiones de navegador no corresponden a fallos. Los comandos principales son `npm run test:unit -- --runInBand`, `npm run test:backend -- --runInBand` y `DASHBOARD_BUILD_DIR=/private/tmp/finanzas-appearance-mobile-final npm run test:dashboard`; PWA se ejecutó con configuración local sobre el mismo build.

El commit y resultado del despliegue se completarán al publicar. Los cambios documentales previos de Epic14 y recuperación operativa se preservan separados. La propuesta de cuenta corriente refleja el requisito definitivo de alta como persona natural y costo cero; ninguna conexión o programación bancaria nueva se activa con esta entrega.
