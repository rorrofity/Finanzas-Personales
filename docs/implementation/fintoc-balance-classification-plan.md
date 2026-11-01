# Saldo bancario y clasificación — plan de implementación

**Estado:** implementación y validación completas; despliegue y operación productiva pendientes. Contrato FBA/FHC escrito antes del código el 2026-11-01 America/Santiago. [Contrato](fintoc-balance-classification-contract.md).

1. Comparar saldo calculado y última lectura bancaria privada; explicar diferencia sin modificar historia.
2. TDD backend de saldo bancario aditivo, actualización por cron existente y API privada de consulta.
3. TDD/QA frontend de saldo exacto, fecha bancaria, estimación y estados sin datos; responsive y ambos temas.
4. Auditar evidencia del historial y TDD de clasificación conservadora exclusivamente para importados NULL.
5. Validar en PostgreSQL temporal, publicar y construir en el servidor. Aplicar únicamente 032, capturar saldo, revisar/aplicar plan de categorías y verificar preservación de originales.
6. Registrar resultados sin datos reales en el repo, publicar evidencia y sincronizar el servidor.

## Validación previa al despliegue

- Frontend: 217 pruebas / 29 suites; backend: 451 / 19 suites. Navegador: 113 aprobadas y 11 omisiones previstas por viewport. PWA: 7 aprobadas. Total: **788 pruebas aprobadas**.
- RED→GREEN de proveedor/snapshot/API, panel exacto y aislamiento por identidad, clasificador y CLI. Reauditorías cruzadas independientes completadas sin bloqueos.
- Dos casos adicionales corregidos con RED→GREEN: queriedAt captura inicio de GET para rechazar solicitudes antiguas demoradas; clasificación verifica descripción bancaria completa contra texto de Checking para impedir inferencias por truncamiento o edición.
- PostgreSQL temporal verifica saldo disponible/contable exacto y con signo, monotonicidad/frescura, aislamiento, conservación de nueve tablas financieras, estado sin cambios al capturar, clasificación unánime/contradictoria/global, exclusión de inferencias del entrenamiento, plan obsoleto y rollback. El cron guarda el snapshot únicamente dentro de la transacción de lote completo; fallo de una página/mes conserva el saldo anterior.
- Mismo build final para navegador y PWA. APIs y saldos exclusivamente ficticios en las pruebas; la integración no carga .env ni se conecta a servicios reales.

Comandos: `npm run test:backend -- --runInBand`, `CI=true npm run test:unit -- --runInBand`, `node tests/integration/fintoc-balance-classification.integration.cjs`, `DASHBOARD_BUILD_DIR=/private/tmp/finanzas-bank-balance-final npm run test:dashboard`. Build: `CI=true GENERATE_SOURCEMAP=false BUILD_PATH=/private/tmp/finanzas-bank-balance-final npm run build`.

## Operación productiva

Pendiente de publicar código, construir en el servidor, aplicar exclusivamente 032 y capturar saldo mediante GET autorizado. Se revisará el plan real de categorías antes de apply y se comprobarán filas/campos autorizados contra el respaldo privado. No ajustar datos para igualar el saldo calculado ni alterar saldos históricos.

[QA visual final con datos ficticios](fintoc-bank-balance-qa/evidence.json): Claro/Oscuro a 375 px y escritorio 1440 px, importes exactos y sin desbordamiento. Se corrigió una elipsis en las etiquetas de totales móviles sin alterar el componente compartido; build final revalidado con 4 pruebas de Checking, 15 recorridos de saldo/totales/320px (4 omisiones previstas) y 7 PWA. Fuente final congelada tras esa revisión.
