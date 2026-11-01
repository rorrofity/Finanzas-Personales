# Epic16 — Apariencia y lectura móvil del dashboard

**Estado:** autorizado para implementación el 2026-10-31. Responde al pedido de modo claro/oscuro y a la dificultad de lectura y desplazamiento lateral en móvil. El estudio de sincronización bancaria se registra aparte como propuesta; no activa conexiones ni procesos de importación.

Subordinación: constitución, protección de datos y TDD del proyecto; conserva DCE-01–21 y los endpoints de Epic15. Esta enmienda reemplaza la concesión de matriz con desplazamiento lateral en móvil por una presentación nativa vertical. El escritorio conserva su matriz completa.

## Requisitos de apariencia

| ID | Criterio EARS |
|---|---|
| AP-01 | Cuando se elija Claro, Oscuro oAutomático, toda la aplicación debe aplicar la apariencia seleccionada y guardar la preferencia únicamente en el dispositivo, sin escribir en la base de datos. |
| AP-02 | Mientras Automático esté seleccionado, la apariencia debe seguir el modo del sistema y actualizarse cuando este cambie. Si la preferencia guardada es inválida o el almacenamiento falla, debe seguir funcionando con el valor predeterminado. |
| AP-03 | Cuando se use escritorio o móvil, el selector Apariencia debe ser accesible con teclado y toque desde la navegación; la pantalla pública de inicio de sesión también debe permitir elegir apariencia. |
| AP-04 | Mientras se use modo oscuro, fondos, superficies, texto, bordes, gráficos, detalles y controles deben conservar jerarquía y contraste legibles, usando tokens del tema. Los controles no deben solaparse a 320 px. |
| AP-05 | Cuando cambie el modo, color-scheme y el color de interfaz de la PWA deben reflejar el modo efectivo; recargar debe restaurar la preferencia. |

## Requisitos de lectura móvil

| ID | Criterio EARS |
|---|---|
| MOB-01 | Mientras el dashboard se use a menos de 900 px, debe presentar categorías mediante una lista vertical legible y no exigir desplazamiento lateral, ni global ni dentro del bloque de categorías. |
| MOB-02 | Cuando se abra la vista móvil, deben verse el importe del período, su variación y las categorías como contenido prioritario; filtros y explicaciones no deben desplazar esos datos mediante grandes bloques repetidos. |
| MOB-03 | Cuando se consulte una categoría, deben mostrarse nombre completo, importe exacto, variación en pesos y porcentaje calculable; la jerarquía debe distinguir cifras, nombres y contexto mediante tipografía, espaciado y superficies del tema. |
| MOB-04 | Cuando se expanda una categoría en móvil, su historial debe mostrar los meses verticalmente, con importe y acceso al detalle del mes correcto, conservando fuentes, período y clasificaciones existentes. |
| MOB-05 | Cuando se elija Tendencia en móvil, debe poderse consultar y cambiar categoría; Categorías debe ser la vista inicial. Cambiar entre ambas presentaciones no debe alterar el alcance ni las lecturas financieras. |
| MOB-06 | Cuando se consulte la vista a 900 px o más, debe conservarse la matriz completa de todas las categorías, selección y detalle por celda, con encabezados fijos. |
| MOB-07 | Mientras haya información de cobertura o exclusiones, debe permanecer visible un resumen comprensible y debe poderse abrir su detalle. Agrupar explicaciones no debe ocultar incidencias ni convertir ausencia de datos en gasto cero. |
| MOB-08 | Mientras se use320/375/768 px, nombres largos e importes hasta999.999.999,99 deben quedar completos y legibles, sin clipping, controles superpuestos ni hover obligatorio. Las acciones deben admitir teclado y toque. |
| MOB-09 | Mientras se cambie la presentación, deben conservarse las garantías de caché aislada, offline, cancelación de consultas, permisos y ausencia de escrituras de Epic15. |

## TDD y verificación

1. Escribir y observar fallar pruebas de preferencia, sistema y control antes del proveedor de tema y paletas.
2. Escribir y observar fallar pruebas de lista móvil,historial vertical y ausencia de tabla lateral antes de cambiar la interfaz. Los criterios de matriz anteriores se mantienen en escritorio; en móvil se sustituyen por comprobaciones equivalentes de todas las categorías y meses, no se elimina su cobertura.
3. Ejecutar unitarias y E2E con fixtures: claro, oscuro,automático, persistencia, login, 320/375/768/1440, selección/fuentes/ventanas, teclado, detalle, offline y respuesta tardía. Comprobar geometría de todos los contenedores móviles, no solo el viewport.
4. Renderizar y revisar visualmente ambas apariencias. Usar exclusivamente datos ficticios en capturas y pruebas locales.
5. Commit y publicación de archivos de esta tarea, preservando cambios previos. Construcción en el servidor existente, respaldo del build anterior y actualización exclusivamente de interfaz/documentos; no migraciones, imports,sync ni cambios de gastos/clasificaciones.

## Sincronización bancaria — alcance independiente

El usuario confirmó cuenta personal Banco de Chile,sin cartolas ni avisos por correo. Acepta evaluar un proveedor externo solamente si es factible,seguro y sin costo. La propuesta debe verificar cobertura real,precio de producción,reautenticación y condiciones de privacidad con fuentes oficiales. No se habilitará una suscripción de pago ni se considerará sandbox/prueba gratuita como conexión productiva gratuita. Cualquier integración futura conserva el importador actual y requiere reglas explícitas de identidad/idempotencia que mantengan las clasificaciones existentes.
