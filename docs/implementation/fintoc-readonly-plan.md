# Epic17 — Plan y evidencia de conexión Fintoc

**Estado:** implementado y verificado localmente; despliegue pendiente. Contrato previo: [FRO-01–12](fintoc-readonly-contract.md). Alcance: consulta por acción explícita y vista previa separada, sin alterar datos existentes ni programaciones.

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

Los resultados del despliegue se completarán al publicar. Los cambios previos del usuario en constitución, plan, tareas y documentación de recuperación se preservan separados.
