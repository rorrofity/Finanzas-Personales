# Plan HRO — acceso seguro de lectura al hogar

[Contrato previo al código](household-readonly-contract.md). Esta enmienda sustituye la activación automática de invitaciones por email de Epic 11: el dueño debe entregar un enlace privado y la persona debe aceptarlo con la cuenta invitada. La web no envía correos.

## Cambios

Google Auth Library oficial 10.9.1, compatible con Node 18 productivo; firma, audiencia, emisor, caducidad y correo verificado antes de acceder a usuarios. Nueva versión privada de sesión invalida tokens anteriores sin rotar claves bancarias. Invitaciones con token aleatorio de 32 bytes, hash SHA-256, plazo de siete días y consumo atómico, incluyendo carreras de aceptación, renovación y límite de dos miembros.

Frontend `/invite` con token en fragmento eliminado de URL, conservación temporal por pestaña y limpieza al aceptar/salir. Validación de correo antes de mostrar metadatos, aceptación explícita y selección del hogar recién agregado. Caches vaciados al cambiar de identidad antes de activar la nueva sesión; respuestas tardías de membresías no pueden reemplazar una selección más reciente.

Saldo, estado/revisión bancaria guardados y cartolas guardadas admiten lectura del dueño del espacio autorizado. Proveedor y sincronización siguen siendo acciones del titular. Todas las escrituras requieren permisos en servidor y UI; incluye estado de alertas, edición/categorización/importación/eliminación en cuenta corriente, internacionales, categorías, proyecciones, cuotas y duplicados. Revisiones compartidas no exponen identificadores privados del proveedor.

Canal N8N protegido por header privado en webhook, callback y mapping; account ID restringido al titular configurado. Un usuario en su espacio propio no puede utilizar el Gmail bancario del titular. Transformación versionada cambia exclusivamente tres nodos, manteniendo parsing, conexiones, credenciales Gmail y acuse de procesados. Se eliminan logs con montos, compras e identificadores de correos. No se ejecutará el flujo real como prueba.

## Validación

TDD RED→GREEN en cada componente, pruebas criptográficas con biblioteca oficial y certificados RSA ficticios, integración HTTP/PostgreSQL local con socket privado sin TCP, migraciones 026/036 idempotentes y verificación de filas financieras ficticias. Casos: registro sin acceso, aceptación de cuenta existente/nueva, correo distinto, token vencido/renovado/reutilizado, concurrencia y revocación inmediata; rechazo de escrituras antes del handler.

Frontend: permisos en todas las páginas, enlace/copia/retorno tras login y registro, cambio de identidad/caché, carreras de selección y lecturas compartidas. Navegador con APIs ficticias en escritorio/móvil/tableta; servidor de fixtures sin .env/backend ni conexión bancaria. Regresión de dashboards, saldo, cartolas y PWA contra el build final.

## Despliegue

1. Guardar copias privadas de .env, PostgreSQL y SQLite/versión N8N, además de build/commit. Capturar huellas de 11 tablas financieras, identidades/preferencias y membresías. No incluir claves/datos reales en Git.
2. Desplegar commit probado e instalar la dependencia fijada. Construir frontend en servidor; aplicar exclusivamente 036 con propietario adecuado y timeout de locks. Ninguna migración financiera/global.
3. Crear credencial headerAuth privada N8N, publicar la transformación probada del workflow existente y comparar otros workflows. Activar cuatro valores privados: AUTH_SESSION_VERSION, N8N_SYNC_SECRET, N8N_SYNC_OWNER_USER_ID y APP_PUBLIC_URL. Mantener claves/configuración bancaria restante intactas.
4. Reiniciar solo backend para cargar seguridad; verificar disponibilidad autenticada antes de publicar build y conservar assets previos. No detener N8N ni alterar horarios de sincronización/respaldos.
5. Verificar producción mediante lecturas, sesión anterior rechazada, actor sin membresía rechazado, invitación desconocida y credenciales Google inválidas rechazadas; ingesta sin clave denegada y cuerpo inválido con clave rechazado antes de SQL. Nunca crear una invitación real o datos financieros de prueba en el hogar. Comparar huellas nuevamente.
6. Actualizar documentación/evidencia y repo/servidor. El dueño vuelve a iniciar sesión, abre Configuración → Espacio compartido, prepara invitación con edición/eliminación apagadas, copia enlace y lo entrega a su pareja. Ella ingresa con ese correo y acepta.

## Límites

Los datos ya descargados para consulta offline no se pueden retirar remotamente mientras un dispositivo permanece desconectado; revocación se valida al recuperar conexión y caché se limpia al salir. Los enlaces son credenciales temporales de acceso: no publicarlos ni adjuntarlos a Git. La clave del banco y las credenciales de proveedores permanecen exclusivas del titular.

## Evidencia local

RED observado antes de cada implementación: identidad/sesión/invitaciones, lecturas de miembros, permisos, canal N8N, logs, caché por identidad, enlaces renovados y carreras de selección. Fábrica N8N: primer RED de módulo ausente y luego RED de callback externo, GREEN 12/12; dry-run contra copia del workflow productivo cambió exactamente Webhook, HTTP Request y Fetch Card Mapping, sin publicar ni ejecutar.

Regresión final local: 810 pruebas backend en 42 suites y 342 frontend en 41 suites aprobadas, build CI final correcto. Siete pruebas criptográficas usan la biblioteca oficial y RSA real con certificados ficticios, sin red. Integración PostgreSQL/HTTP aislada aprobada tras los ajustes finales de validación; conserva datos financieros ficticios y retira clúster temporal. Prueba nueva de navegador de aceptación primero falló contra la versión anterior; después 21/21 escenarios nuevos en escritorio/móvil/tableta aprobados, con sesión caducada, copia privada, aceptación explícita, lectura de saldo y controles bloqueados, sin scroll lateral global.

Auditoría cruzada del backend y flujo de token sin bloqueos. Campos de permisos no booleanos y origen público incorrecto se rechazan antes de crear/renovar; la aceptación consume el hash bajo lock y revalida identidad/estado/vencimiento. Otra cuenta propia no puede usar el Gmail bancario del titular. La migración solo añade tres columnas y un índice de metadatos, sin reescribir registros de membresías ni tablas financieras.

Regresión de navegador final: 171 escenarios aprobados y 13 omisiones previstas por viewport; siete pruebas PWA aprobadas. Ambas verificaciones usan builds locales del mismo código, sin credenciales reales, y no ejecutan imports de producción. El caso nuevo de sesión caducada recupera el token de la pestaña y retorna a aceptación tras login. Pruebas antiguas de acceso a saldo/cartolas se adaptaron a la nueva autorización de lectura manteniendo prohibidas las llamadas al proveedor y toda escritura.

## Refuerzo de privacidad de registros

La revisión de despliegue detectó que el log HTTP privado de Caddy guardaba la cabecera personalizada en las comprobaciones de ingesta. Se añade un filtro del campo canonical/lowercase al encoder JSON del sitio, conservando rutas y otros dominios. Los ocho valores de las sondas se redaccionan en el archivo activo mediante reemplazo de igual longitud; no se alteran registros financieros ni se conserva una copia del log con el secreto. Se valida y recarga Caddy de forma gradual, sin reiniciar backend/N8N, y se comprueba con una cabecera ficticia que no vuelva a guardarse.

También se deshabilita la retención de payloads/headers en ejecuciones exitosas, fallidas, manuales y progreso del workflow de emails. Esta es la única modificación adicional de settings sobre la transformación de los tres nodos de autenticación. RED→GREEN específico: dos fallos de retención antes del cambio y después 13/13 de la fábrica N8N; 11/11 para filtro Caddy con transformaciones idempotentes, rutas preservadas y configuración desconocida rechazada. Ningún flujo real bancario se ejecuta para probar.
