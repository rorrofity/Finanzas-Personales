# Epic17 — Plan y evidencia de conexión Fintoc

**Estado al 2026-11-01:** Epic17 implementado y desplegado; vínculo personal live y configuración privada completos. La gratuidad publicada hasta cinco cuentas personales quedó confirmada y la primera lectura real fue exitosa sin escrituras financieras. Epic18 tiene implementación y pruebas listas, con despliegue próximo; su activación final se registra en el [plan diario](fintoc-daily-sync-plan.md). Contrato original: [FRO-01–12](fintoc-readonly-contract.md), ampliado por [FDS-01–14](fintoc-daily-sync-contract.md).

Las secciones siguientes conservan la evidencia cronológica de Epic17: las condiciones pendientes y banderas deshabilitadas descritas en cada verificación corresponden a ese momento, no al estado actual de habilitación y costo.

## Secuencia SDD/TDD de Epic17

1. Especificar contrato y modo privado de activación antes del código.
2. RED de servicio/rutas con transporte ficticio; RED de componente; RED de política NetworkOnly y navegador sobre el build anterior.
3. Implementar cliente Movements con versión fija, controles por dueño/banco/cuenta y lotes completos; panel responsive con limpieza por identidad/período; exclusión de caché.
4. Verificar unidades, regresiones de interfaz, E2E ficticio y build PWA; no cargar .env ni usar la base existente en pruebas.
5. Publicar en repo y construir en servidor con Fintoc deshabilitado por defecto. Respaldar código/build, comparar nueve tablas financieras y comprobar autenticación, estado pendiente y ausencia de activación de proveedor.

## Límites operativos y transición a Epic18

Al iniciar el desarrollo el usuario todavía no tenía cuenta Fintoc. Después creó su cuenta y completó personalmente su vinculación bancaria; la preparación privada posterior se registra al final. La gratuidad de las consultas del alcance actual ya está confirmada por los términos canónicos de Chile, 2.3 y QUINTO(a), para hasta cinco cuentas personales. No se ha contratado un instrumento pagado. La frecuencia de refresco desde el banco depende de la modalidad y no se promete una actualización bancaria nueva cada 24 horas.

La [guía](fintoc-readonly-activation.md) enlaza el procedimiento vigente de Epic18: baseline sin insertar historia, metadatos separados, novedades inequívocas posteriores al corte y proceso a las 07:00 America/Santiago independiente de TC/N8N. Conserva multiplicidad, categorías, notas e identidad de registros actuales, sin escribir saldos ni forzar refrescos pagos. El preview público continúa sin persistir movimientos.

## Evidencia histórica de Epic17

- Frontend: 26 suites, **148 pruebas pasan**; incluye 20 casos del panel y cuatro garantías adicionales de política de caché.
- Backend: 8 suites, **166 pruebas pasan**, incluidas 99 nuevas del conector y rutas. RED observado antes de crear módulos; una revisión independiente detectó un caso de paginación contradictoria. Nueve casos RED reprodujeron el problema y diez pruebas adicionales verifican la corrección: no se declara completo un mes si los enlaces anuncian páginas faltantes.
- Navegador: **88 pruebas pasan**, con 9 omisiones por ancho de pantalla, sobre frontend estático y API ficticia. Incluye 16 nuevos casos de Fintoc entre escritorio, móvil y tablet; RED observado sobre el build anterior por ausencia del panel.
- PWA: **7 pruebas pasan** sobre el mismo build, con servidor estático de loopback independiente. Compilación de producción correcta.
- **Total: 409 pruebas pasan**. No se ejecutaron las pruebas API que cargan la base existente.
- [Revisión visual](fintoc-readonly-qa/evidence.json): estado pendiente claro en 375 px, preview ficticio oscuro en 375 px y escritorio 1440 px; ancho del documento igual al viewport, sin desbordamiento en panel. Cero errores JS, peticiones API inesperadas o escrituras.

Comandos principales: `CI=true npm run test:unit -- --runInBand`, `npm run test:backend -- --runInBand`, `CI=true GENERATE_SOURCEMAP=false BUILD_PATH=/private/tmp/finanzas-fintoc-final npm run build`, `DASHBOARD_BUILD_DIR=/private/tmp/finanzas-fintoc-final npm run test:dashboard`. PWA usa los siete casos existentes de `tests/pwa-build`, servidos localmente desde ese mismo build.

## Despliegue e integridad de Epic17 — histórico

Código `5000d516758057c14bae3f40db7f11970a11c5a4` publicado en `origin/main`, construido en el servidor `/var/www/finanzas-personales` y verificado el **2026-10-31 a las 22:47:06 America/Santiago**. Se conservó el build anterior y 17 assets previos para clientes todavía sin actualizar. Se reinició únicamente `finanzas-backend` para cargar las rutas nuevas; permanece online.

App, JS principal, módulo Fintoc, service worker y JS anterior responden 200. Las dos rutas Fintoc responden 401 sin autenticación y `Cache-Control:no-store`. El servicio en producción informa `disabled`; no hay cuenta de proveedor creada, credenciales configuradas ni conexión bancaria activada. No se realizaron peticiones a Fintoc. El archivo privado `.env` permaneció idéntico; no se instalaron dependencias ni se ejecutaron migraciones o cambios de scheduler.

Las huellas de nueve tablas financieras son idénticas antes y después: **0 registros modificados, 0 eliminados y 0 añadidos**. La consulta de huellas se ejecutó en transacciones PostgreSQL de solo lectura. Los detalles permanecen exclusivamente en el servidor; la [evidencia pública del despliegue](fintoc-readonly-deployment.json) no contiene movimientos ni credenciales.

Rollback: código anterior `319518babaa78bbfec249de584d75d8f54c0f8d6` y build en `/var/backups/finanzas/fintoc-readonly-20261031-5000d51/build`. Revertir únicamente código/build y reiniciar el proceso, sin restaurar ni modificar la base de datos.

Los cambios previos del usuario en constitución, plan, tareas y documentación de recuperación se preservan separados. En aquel despliegue seguían pendientes el alta y la habilitación personal gratuita; ambos puntos se resolvieron posteriormente, como registra la actualización al final.

## Vinculación del titular y preparación privada posterior — histórico

El titular completó la vinculación Banco de Chile Individual en el Dashboard live. Se observó Link creado, estado Activo y una cuenta, con la primera actualización todavía en curso. Autorizó expresamente guardar el token y una clave API existente en su servidor privado, manteniendo deshabilitada la consulta hasta confirmar costo cero.

El Link Token se guardó en el `.env` privado del servidor con permisos 0600 y se eliminó la copia local temporal. Las banderas de habilitación y gratuidad permanecen false. El panel de API keys solo tenía una clave pública; no se usó como secreto ni se creó o rotó una clave. La clave secreta y la configuración completa de cuenta/propietario siguen pendientes. No se consultó la API de movimientos desde nuestro servidor.

Se corrigió mediante TDD la aceptación de sufijos URL-safe en tokens y claves secretas: RED previo con datos exclusivamente ficticios, validación positiva del transporte simulado y rechazo de prefijo público, modo incorrecto, espacios, controles y caracteres inválidos. Regresión completa: **8 suites y 185 pruebas backend pasan**. La corrección modifica únicamente validación de configuración; no altera frontend, consultas de gastos o persistencia.

Corrección `cdef63663b64c4ddf1b18f954c7ce0ff6c6b53da` desplegada y verificada el **2026-10-31 a las 23:35:36 America/Santiago**, mediante actualización del backend y reinicio del proceso, sin reconstruir el frontend. App responde 200 y ruta Fintoc mantiene 401 y no-store. Nueve tablas financieras idénticas antes y después: cero filas modificadas, eliminadas o añadidas. [Evidencia sin credenciales](fintoc-private-setup-verification.json).

### Configuración completa posterior

El titular creó una clave secreta existente para su aplicación y autorizó su almacenamiento privado. Se configuraron clave live, token, única cuenta corriente seleccionada desde el Dashboard y UUID del dueño verificado contra su usuario existente mediante SELECT de solo lectura. El archivo `.env` tiene permisos 0600; los valores no están en este repositorio. Se eliminaron los archivos locales temporales y el payload de transferencia del servidor.

La configuración se validó con transporte bloqueado y `getStatus` puro; una copia temporal de banderas en memoria acreditó configuración sintácticamente completa, sin habilitar el proceso ni ejecutar peticiones externas. Las banderas reales permanecen false. La autenticación del proveedor y la primera lectura de movimientos no están verificadas todavía.

Verificado el **2026-10-31 a las 23:42:02 America/Santiago**: backend online, web 200, API anónima 401/no-store y nueve tablas financieras idénticas antes y después. No hubo migraciones, cambios de scheduler ni peticiones de la aplicación a Fintoc. La vista de configuración del proveedor no ofreció información de facturación consultable; los términos gratuitos publicados no se interpretaron como una confirmación de la tarifa particular de este acceso.

## Resolución posterior y continuación en Epic18 — 2026-11-01

Se verificaron los términos canónicos de Chile seleccionando Para desarrolladores: Servicios incluye Conciliación Bancaria; 2.3 y QUINTO(a) establecen gratuidad hasta cinco cuentas personales. La cuenta vinculada es Individual, está dentro de ese límite y no se contrató un instrumento pagado. La habilitación live y la primera lectura real completa fueron exitosas; se usó configuración temporal en memoria y no se escribieron datos financieros. Las respuestas reales permanecen solo en el servidor privado.

La incertidumbre previa sobre costo y habilitación de este acceso queda resuelta; no se exige una aclaración escrita adicional para las lecturas autorizadas. No se autorizaron planes, pagos ni Refresh Intents. La cuenta corriente CLP es el alcance confirmado; la sincronización de compras de tarjeta sigue a cargo de TC/N8N.

Epic18 especificó antes del código y completó implementación y pruebas del lector de estados, motor de conciliación, bloqueo compartido, scheduler independiente, estado diario y pendientes móviles Claro/Oscuro. El despliegue productivo es el próximo paso y no se declara realizado en esta actualización. Consultar el [contrato diario](fintoc-daily-sync-contract.md) y su [plan y evidencia](fintoc-daily-sync-plan.md) para verificaciones y resultado definitivo.
