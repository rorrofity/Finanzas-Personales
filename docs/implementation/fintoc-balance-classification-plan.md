# Saldo bancario y clasificación — plan de implementación

**Estado:** desplegado y verificado en producción el 2026-11-01 a las 01:04:09 America/Santiago. Contrato FBA/FHC escrito antes del código el 2026-11-01 America/Santiago. [Contrato](fintoc-balance-classification-contract.md).

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

Código `5cc51561c161286d118a70b5be427258311d1d0e` publicado y construido en el servidor; dependencias sin cambios. Respaldo privado de build, huellas de nueve tablas financieras, filas Checking completas y campos protegidos, estado diario y huella de .env. Se aplicó únicamente 032, que crea un snapshot bancario separado; ningún saldo histórico se sobrescribió ni se añadió un ajuste financiero.

La captura inicial de saldo mediante un único GET Link autorizado terminó correctamente. La API privada de la web devuelve exactamente disponible y contable capturados, junto a la fecha bancaria real. El cálculo del historial se conserva y se identifica como estimación. Abrir la pantalla solo lee la base; el cron existente actualiza el snapshot después de una lectura completa.

Se revisó el plan privado real antes de aplicar su huella recalculada bajo lock. Solo antecedentes exactos y unánimes clasificaron incorporaciones Fintoc aún NULL. Antecedentes contradictorios o ausentes quedaron NULL. Apply no creó ni eliminó movimientos. El preview repetido no propone nuevas asignaciones.

Comparación final: ocho tablas financieras idénticas y conjunto global de IDs Checking idéntico; filas no seleccionadas byte a byte, incluidos otros dueños. En las seleccionadas solo cambiaron category_id y updated_at autorizados; todo campo protegido permanece idéntico. Notas, importes, fechas, categorías previas y saldos guardados conservados. Estado diario y .env exactos. PM2 online y cron 07:00 America/Santiago registrado, TC/N8N sin cambios.

API dueño 200/no-store, otro dueño 403 y anónimo 401; todas las asignaciones verificadas también en el listado autenticado. Web, módulo principal, service worker y JS previo HTTP200. [Evidencia pública sin saldos ni movimientos](fintoc-balance-classification-deployment.json). Planes, resultados y valores reales únicamente en `/var/backups/finanzas/balance-category-20261101-5cc5156/`, directorio privado del servidor.

Rollback de código/build: versión anterior `4b4a109d55e5c18eb99d24c2c4fc7509cba3ed57` y build en ese respaldo. Conservar movimientos y clasificaciones aplicadas; no restaurar ni reescribir la base financiera. La tabla nueva puede permanecer inactiva si se revierte código. Los cambios documentales previos del usuario se preservaron separados.

[QA visual final con datos ficticios](fintoc-bank-balance-qa/evidence.json): Claro/Oscuro a 375 px y escritorio 1440 px, importes exactos y sin desbordamiento. Se corrigió una elipsis en las etiquetas de totales móviles sin alterar el componente compartido; build final revalidado con 4 pruebas de Checking, 15 recorridos de saldo/totales/320px (4 omisiones previstas) y 7 PWA. Fuente final congelada tras esa revisión.
