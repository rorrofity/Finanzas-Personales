# Epic18 — Plan y evidencia de sincronización diaria Fintoc

**Estado:** implementación y validación completas; despliegue productivo en preparación. Especificado antes de implementar. [Contrato FDS-01–14](fintoc-daily-sync-contract.md).

1. Verificar condiciones oficiales y cobertura. Gratuidad publicada en canónica para hasta cinco cuentas personales; una cuenta Individual vinculada y ningún contrato pagado. Movements Banco de Chile no documenta tarjetas de crédito.
2. Primera lectura productiva de solo consulta: completa y exitosa; resultados reales solo en servidor privado. No se alteraron flags persistentes ni tablas financieras.
3. Implementar con TDD el lector de estados, metadatos de conciliación, inserción de novedades posteriores al corte, locks compartidos y scheduler independiente.
4. Implementar estado diario y pendientes de revisión en la web, preservando preview y comportamiento móvil/temas.
5. Probar con Jest, PostgreSQL temporal y navegador/API ficticia. Mantener separados los cambios documentales previos del usuario.
6. Publicar repo, construir en servidor, aplicar solo migración aditiva 031, activar flags y ejecutar baseline sin reimportar historia. Verificar cron 07:00 Santiago, errores, API privada y huellas financieras.

La consulta diaria registra cobertura y fecha del banco. No promete que el proveedor actualice en 24 h ni activa refrescos de pago. Las tarjetas mantienen su sincronización TC/N8N existente. Los pendientes iniciales siguen visibles hasta conciliarse; ninguna categoría existente se reescribe.

## Validación completada — 2026-11-01

- Jest frontend: 186 pruebas / 27 suites; backend: 280 pruebas / 13 suites. RED→GREEN documentado para proveedor, motor, locks, scheduler, rutas y UI.
- Navegador: 101 pruebas aprobadas y 11 omisiones previstas por viewport. PWA: 7 aprobadas. Total: **574 pruebas aprobadas**.
- PostgreSQL temporal aislado, sin .env ni API real: migración aditiva/idempotente, baseline sin inserción, comparación de cada campo preexistente, multiplicidad, idempotencia, pendientes→confirmados, correcciones/reversiones, límites NUMERIC, rollback tras INSERT, concurrencia CSV/ejecuciones, referencia eliminada y reemisión, lectura antigua descartada y error tardío sin regresión del estado.
- Reauditoría independiente de los casos de referencia eliminada y finalización fuera de orden: aprobada. financial_snapshot conserva la firma original; superseded protege el estado más reciente.
- [Evidencia visual con datos ficticios](fintoc-daily-sync-qa/evidence.json): móvil 375 px Claro/Oscuro y escritorio 1440 px, sin desbordamiento horizontal, errores JS ni escrituras API. Los avisos por recursos externos/SW bloqueados del entorno de fixtures están registrados; la suite PWA valida el service worker real por separado.
- Build de producción compilado. Pruebas de navegador y PWA usan ese mismo build, sin base ni banco reales.

Comandos: `CI=true npm run test:unit -- --runInBand`, `npm run test:backend -- --runInBand`, `node tests/integration/fintoc-daily-sync.integration.cjs`, `DASHBOARD_BUILD_DIR=/private/tmp/finanzas-fintoc-daily-final npm run test:dashboard`. La integración crea y elimina su propio PostgreSQL por socket temporal; no usa la base existente. Build: `CI=true GENERATE_SOURCEMAP=false BUILD_PATH=/private/tmp/finanzas-fintoc-daily-final npm run build`.

## Despliegue

Se completará con evidencia tras construir en el servidor, aplicar exclusivamente 031, activar tres banderas, ejecutar el baseline y comparar las nueve tablas financieras. Rollback de código/build y desactivación del scheduler; no restaurar ni reescribir historia financiera.
