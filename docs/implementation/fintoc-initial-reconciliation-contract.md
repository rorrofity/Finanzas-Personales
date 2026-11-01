# Fintoc — conciliación explícita de la carga inicial

**Solicitud y especificación anterior al código:** 2026-11-01, America/Santiago. El titular autoriza revisar los pendientes iniciales contra el historial e incorporar exclusivamente movimientos faltantes, preservando gastos y clasificaciones. Esta enmienda FHR amplía FDS-04/05 para una ejecución interna explícita, sin cambiar las reglas automáticas del cron ni su corte.

## Criterios de aceptación

| ID | Requisito |
|---|---|
| FHR-01 | Herramienta interna sin ruta pública ni nuevas llamadas al banco. Usa las observaciones ya guardadas; exige dueño/cuenta configurados, estado inicializado y actor igual al dueño. |
| FHR-02 | Dos fases: preview sin escrituras y apply con SHA-256 del plan. Ambas reservan conexión y usan el lock compartido Checking; apply recalcula y aborta si cambió el conjunto revisado o el día de Santiago. |
| FHR-03 | Limitar decisiones a filas needs_review de la carga inicial: first_seen_at coincide con created_at del estado inicial (CURRENT_TIMESTAMP de la misma transacción). Comparar timestamps SQL exactos, sin pérdida de microsegundos de Date/ISO. No tocar observaciones posteriores ni referencias ya resueltas. |
| FHR-04 | Elegibles únicamente confirmed/pending=false, razón inicial segura (initial_unmatched, before_cutover, ambiguous_match o future_date), sin FK, had_financial_reference ni created_checking. Correcciones, reversiones, ausencias y referencias eliminadas permanecen pendientes. |
| FHR-05 | Validar fecha ISO real no futura, CLP entero positivo <=999999999999, descripción no vacía y tipo. Una fecha futura se conserva pendiente como future_date; no se interpreta confirmado como permiso para anticipar una operación. |
| FHR-06 | Comparar todo el historial Checking del dueño. Exacta única fecha/tipo/importe/descripción normalizada y truncada a 60 puede enlazar solo metadatos si no hay ambigüedad. No elegir arbitrariamente entre grupos múltiples ni colisiones por truncamiento. |
| FHR-07 | Mismo importe/tipo y fecha a ±3 días bloquea una inserción dudosa. Otros gastos reales de tarjeta nacional/internacional con mismo importe CLP, descripción normalizada y fecha ±3 días bloquean como precaución; nunca se enlazan como Checking ni se modifican. Un pago de tarjeta no equivale a sus compras. |
| FHR-08 | Dos IDs bancarios distintos legítimos sin candidatos conservan multiplicidad; no deduplicar por parecido. Referencias eliminadas y sus financial_snapshot inmutables bloquean reemisiones incluso con FK nula; metadata de correcciones/ausencias también es evidencia bloqueante. |
| FHR-09 | Insertar solo faltantes inequívocos con categoría/notas NULL, año/mes derivados del ISO y descripción de máximo 60 caracteres. Solo INSERT financiero; nunca UPDATE/DELETE de gastos, clasificaciones, notas, saldos o timestamps preexistentes. |
| FHR-10 | Nuevo Checking y mapping de su external_id se confirman atómicamente. Mapping inserted/linked conserva provider_hash/first_snapshot y actualiza solo referencias/disposition/reason/candidate_count/financial_snapshot de integración. Repetición o dos applies no duplican; plan anterior tras cambios falla como obsoleto. |
| FHR-11 | Leer filas Checking del dueño con FOR UPDATE durante apply para proteger decisión ante edición/borrado manual. El lock compartido serializa imports y cron. Antes de COMMIT verificar byte a byte los registros Checking originales; cualquier diferencia revierte la transacción. |
| FHR-12 | No avanzar last_success_at, bank_updated_at, cobertura ni cutover_date al conciliar caché. Registrar una ejecución manual solo en bitácora de integración, con cobertura/fecha bancaria existentes; no afirmar una lectura nueva. |
| FHR-13 | Plan, IDs, detalles bancarios y snapshots reales exclusivamente en directorio privado del servidor 0700/archivos0600. CLI imprime solo conteos, digest y códigos seguros. Fixtures y documentación pública sin datos reales. Ningún secreto nuevo ni modificación de configuración. |
| FHR-14 | TDD RED→GREEN y PostgreSQL efímero: plan sin escrituras, faltantes/exactos/ambiguos, multiplicidad/truncamiento, futuro/importe, tombstones, aislamiento, plan obsoleto, rollback, carrera CSV y concurrencia. Verificar las nueve tablas financieras: ocho idénticas y Checking conserva cada fila original, añadiendo exclusivamente IDs autorizados. Repo y servidor actualizados. |

## Interfaces

`backend/services/fintocInitialReconciliationService.js`: `planInitialReconciliation({movements,checking,otherExpenses,baselineCreatedAt,asOfDate})` puro. Factory `createFintocInitialReconciliationService({db,env,now})` con `preview(actorId)` y `apply(actorId,{digest})`. El plan privado tiene version, asOfDate, digest, summary `{insert,link,hold}` y actions `{externalId,decision,reason,candidateCount,checkingTransactionId?}`. SHA incluye estado, todas las observaciones, historial Checking completo, candidatos de otras fuentes y día; orden determinista. No incluye el momento variable de generación.

`backend/scripts/reconcile-fintoc-initial.js`: `--preview /ruta/privada/plan.json` o `--apply /ruta/privada/plan.json`. Carga .env solo en el CLI, nunca en el motor/pruebas. El fichero del plan debe crearse de forma exclusiva con modo0600 fuera del repo; apply lee exclusivamente la huella y vuelve a calcular. Respuesta de consola solo resumen/digest, sin IDs, descripciones, importes ni errores crudos.

No migración ni cambios de UI. Los motivos existentes future_date/ambiguous_match son comprensibles en la web. La conciliación no recupera meses ausentes del proveedor ni declara completo todo el historial bancario.
