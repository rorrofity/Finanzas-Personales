# Plan y evidencia UCF

Estado: implementación y validación completas; despliegue pendiente. Contrato UCF escrito antes del código.

1. Acceso rápido compartido y helper, pruebas de semántica y accesibilidad.
2. Integrar en nacionales, internacionales y cuenta corriente; pruebas de composición, selección y paginación, sin escrituras por filtrar.
3. Regresión unitaria, build y Playwright ficticio móvil/escritorio/temas.
4. Build en servidor, sustituir assets conservando los anteriores; sin migración, reinicio ni cambios bancarios. Publicar evidencia y actualizar repo/servidor conservando cambios previos.

## Validación

- TDD RED→GREEN: componente compartido (11), nacionales (10), internacionales (13 incluyendo los casos existentes), cuenta corriente (8 nuevos y 4 de aislamiento del saldo). Pruebas cubren ID nulo/ausente/vacío, ID presente, teclado/temas, filtros combinados, páginas, selecciones, vacío reversible y categorización explícita simulada. Filtrar no añade requests ni escrituras. Advertencias transitorias de paginación detectadas con RED y corregidas.
- Regresión frontend: **306 pruebas / 34 suites aprobadas**. Navegador: **150 aprobadas / 13 omisiones previstas de viewport**. PWA: **7 aprobadas** sobre el mismo build. Total: **463 pruebas aprobadas**.
- [QA exclusivamente ficticia](uncategorized-filter-qa/evidence.json): tres pantallas, ambos temas y móvil/escritorio; sin escrituras, API inesperadas, errores JS ni scroll lateral. Recorridos también en tableta.
- Revisión independiente de cambios: sin mutaciones de datos ni consultas nuevas por filtrar. No cambia el backend ni los flujos bancarios. Checking conserva sus totales de referencia y comportamiento de listado del mes.

Comandos: `CI=true npm run test:unit -- --runInBand`, `CI=true GENERATE_SOURCEMAP=false BUILD_PATH=/private/tmp/finanzas-ucf-build REACT_APP_API_BASE_URL='' npm run build`, `DASHBOARD_BUILD_DIR=/private/tmp/finanzas-ucf-build npm run test:dashboard`; PWA contra ese mismo build. Se respaldará el build de producción, se construirá en servidor y se conservarán assets previos; la única conexión a base será para huellas de solo lectura antes y después del cambio.
