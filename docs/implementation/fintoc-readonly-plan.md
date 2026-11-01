# Epic17 — Plan y evidencia de conexión Fintoc

**Estado:** conector implementado, verificado y desplegado; conexión bancaria pendiente y deshabilitada. Contrato previo: [FRO-01–12](fintoc-readonly-contract.md). Alcance: consulta por acción explícita y vista previa separada, sin alterar datos existentes ni programaciones.

## Secuencia SDD/TDD

1. Especificar contrato y modo privado de activación antes del código.
2. RED de servicio/rutas con transporte ficticio; RED de componente; RED de política NetworkOnly y navegador sobre el build anterior.
3. Implementar cliente Movements con versión fija, controles por dueño/banco/cuenta y lotes completos; panel responsive con limpieza por identidad/período; exclusión de caché.
4. Verificar unidades, regresiones de interfaz, E2E ficticio y build PWA; no cargar .env ni usar la base existente en pruebas.
5. Publicar en repo y construir en servidor con Fintoc deshabilitado por defecto. Respaldar código/build, comparar nueve tablas financieras y comprobar autenticación, estado pendiente y ausencia de activación de proveedor.

## Límites operativos

El usuario todavía no tiene cuenta Fintoc. No se crea cuenta, acepta contrato ni habilita acceso bancario desde esta sesión. No existe promesa de conexión live o refresco diario, porque depende de habilitación y modalidad gratuita del proveedor. La consulta preparada no se presenta como sincronización ya operativa.

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
