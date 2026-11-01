# Epic17 — Plan y evidencia de conexión Fintoc

**Estado:** conector implementado y desplegado; vínculo personal en Fintoc live y configuración privada completa. La consulta desde nuestra web permanece deshabilitada y pendiente de confirmar gratuidad y probar el acceso del proveedor. Contrato previo: [FRO-01–12](fintoc-readonly-contract.md). Alcance: consulta por acción explícita y vista previa separada, sin alterar datos existentes ni programaciones.

## Secuencia SDD/TDD

1. Especificar contrato y modo privado de activación antes del código.
2. RED de servicio/rutas con transporte ficticio; RED de componente; RED de política NetworkOnly y navegador sobre el build anterior.
3. Implementar cliente Movements con versión fija, controles por dueño/banco/cuenta y lotes completos; panel responsive con limpieza por identidad/período; exclusión de caché.
4. Verificar unidades, regresiones de interfaz, E2E ficticio y build PWA; no cargar .env ni usar la base existente en pruebas.
5. Publicar en repo y construir en servidor con Fintoc deshabilitado por defecto. Respaldar código/build, comparar nueve tablas financieras y comprobar autenticación, estado pendiente y ausencia de activación de proveedor.

## Límites operativos

Al iniciar el desarrollo el usuario todavía no tenía cuenta Fintoc. Después creó su cuenta y completó personalmente su vinculación bancaria; la preparación privada posterior se registra al final. No existe promesa de refresco diario o acceso API gratuito, porque depende de habilitación y modalidad del proveedor. La consulta preparada no se presenta como sincronización ya operativa.

La activación está documentada en [guía](fintoc-readonly-activation.md), con variables privadas del servidor, bandera de gratuidad y sin importar los movimientos. La sincronización diaria requiere la conciliación inicial CSYNC para proteger multiplicidad, categorías e identidad de registros actuales.

## Evidencia

- Frontend: 26 suites, **148 pruebas pasan**; incluye 20 casos del panel y cuatro garantías adicionales de política de caché.
- Backend: 8 suites, **166 pruebas pasan**, incluidas 99 nuevas del conector y rutas. RED observado antes de crear módulos; una revisión independiente detectó un caso de paginación contradictoria. Nueve casos RED reprodujeron el problema y diez pruebas adicionales verifican la corrección: no se declara completo un mes si los enlaces anuncian páginas faltantes.
- Navegador: **88 pruebas pasan**, con 9 omisiones por ancho de pantalla, sobre frontend estático y API ficticia. Incluye 16 nuevos casos de Fintoc entre escritorio, móvil y tablet; RED observado sobre el build anterior por ausencia del panel.
- PWA: **7 pruebas pasan** sobre el mismo build, con servidor estático de loopback independiente. Compilación de producción correcta.
- **Total: 409 pruebas pasan**. No se ejecutaron las pruebas API que cargan la base existente.
- [Revisión visual](fintoc-readonly-qa/evidence.json): estado pendiente claro en 375 px, preview ficticio oscuro en 375 px y escritorio 1440 px; ancho del documento igual al viewport, sin desbordamiento en panel. Cero errores JS, peticiones API inesperadas o escrituras.

Comandos principales: `CI=true npm run test:unit -- --runInBand`, `npm run test:backend -- --runInBand`, `CI=true GENERATE_SOURCEMAP=false BUILD_PATH=/private/tmp/finanzas-fintoc-final npm run build`, `DASHBOARD_BUILD_DIR=/private/tmp/finanzas-fintoc-final npm run test:dashboard`. PWA usa los siete casos existentes de `tests/pwa-build`, servidos localmente desde ese mismo build.

## Despliegue e integridad

Código `5000d516758057c14bae3f40db7f11970a11c5a4` publicado en `origin/main`, construido en el servidor `/var/www/finanzas-personales` y verificado el **2026-10-31 a las 22:47:06 America/Santiago**. Se conservó el build anterior y 17 assets previos para clientes todavía sin actualizar. Se reinició únicamente `finanzas-backend` para cargar las rutas nuevas; permanece online.

App, JS principal, módulo Fintoc, service worker y JS anterior responden 200. Las dos rutas Fintoc responden 401 sin autenticación y `Cache-Control:no-store`. El servicio en producción informa `disabled`; no hay cuenta de proveedor creada, credenciales configuradas ni conexión bancaria activada. No se realizaron peticiones a Fintoc. El archivo privado `.env` permaneció idéntico; no se instalaron dependencias ni se ejecutaron migraciones o cambios de scheduler.

Las huellas de nueve tablas financieras son idénticas antes y después: **0 registros modificados, 0 eliminados y 0 añadidos**. La consulta de huellas se ejecutó en transacciones PostgreSQL de solo lectura. Los detalles permanecen exclusivamente en el servidor; la [evidencia pública del despliegue](fintoc-readonly-deployment.json) no contiene movimientos ni credenciales.

Rollback: código anterior `319518babaa78bbfec249de584d75d8f54c0f8d6` y build en `/var/backups/finanzas/fintoc-readonly-20261031-5000d51/build`. Revertir únicamente código/build y reiniciar el proceso, sin restaurar ni modificar la base de datos.

Los cambios previos del usuario en constitución, plan, tareas y documentación de recuperación se preservan separados. El alta de Fintoc y la habilitación personal gratuita siguen siendo requisitos externos para la primera consulta real.

## Vinculación del titular y preparación privada posterior

El titular completó la vinculación Banco de Chile Individual en el Dashboard live. Se observó Link creado, estado Activo y una cuenta, con la primera actualización todavía en curso. Autorizó expresamente guardar el token y una clave API existente en su servidor privado, manteniendo deshabilitada la consulta hasta confirmar costo cero.

El Link Token se guardó en el `.env` privado del servidor con permisos 0600 y se eliminó la copia local temporal. Las banderas de habilitación y gratuidad permanecen false. El panel de API keys solo tenía una clave pública; no se usó como secreto ni se creó o rotó una clave. La clave secreta y la configuración completa de cuenta/propietario siguen pendientes. No se consultó la API de movimientos desde nuestro servidor.

Se corrigió mediante TDD la aceptación de sufijos URL-safe en tokens y claves secretas: RED previo con datos exclusivamente ficticios, validación positiva del transporte simulado y rechazo de prefijo público, modo incorrecto, espacios, controles y caracteres inválidos. Regresión completa: **8 suites y 185 pruebas backend pasan**. La corrección modifica únicamente validación de configuración; no altera frontend, consultas de gastos o persistencia.

Corrección `cdef63663b64c4ddf1b18f954c7ce0ff6c6b53da` desplegada y verificada el **2026-10-31 a las 23:35:36 America/Santiago**, mediante actualización del backend y reinicio del proceso, sin reconstruir el frontend. App responde 200 y ruta Fintoc mantiene 401 y no-store. Nueve tablas financieras idénticas antes y después: cero filas modificadas, eliminadas o añadidas. [Evidencia sin credenciales](fintoc-private-setup-verification.json).

### Configuración completa posterior

El titular creó una clave secreta existente para su aplicación y autorizó su almacenamiento privado. Se configuraron clave live, token, única cuenta corriente seleccionada desde el Dashboard y UUID del dueño verificado contra su usuario existente mediante SELECT de solo lectura. El archivo `.env` tiene permisos 0600; los valores no están en este repositorio. Se eliminaron los archivos locales temporales y el payload de transferencia del servidor.

La configuración se validó con transporte bloqueado y `getStatus` puro; una copia temporal de banderas en memoria acreditó configuración sintácticamente completa, sin habilitar el proceso ni ejecutar peticiones externas. Las banderas reales permanecen false. La autenticación del proveedor y la primera lectura de movimientos no están verificadas todavía.

Verificado el **2026-10-31 a las 23:42:02 America/Santiago**: backend online, web 200, API anónima 401/no-store y nueve tablas financieras idénticas antes y después. No hubo migraciones, cambios de scheduler ni peticiones de la aplicación a Fintoc. La vista de configuración del proveedor no ofreció información de facturación consultable; los términos gratuitos publicados no se interpretaron como una confirmación de la tarifa particular de este acceso.
