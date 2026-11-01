# Epic18 — Sincronización diaria de cuenta corriente mediante Fintoc

**Solicitud:** 2026-10-31, America/Santiago. Confirmar gratuidad y, si aplica, realizar primera lectura y activar sincronización diaria, con SDD/TDD y preservación íntegra del historial y clasificaciones existentes. Mantener repositorio y despliegue en servidor. **Especificación anterior al código.**

## Fuente y alcance confirmado

Se verificó la URL canónica de [términos de Chile](https://www.fintoc.com/cl/legal/terminos), seleccionando Para desarrolladores / Términos y condiciones. Definición Servicios incluye Conciliación Bancaria; 2.3 y QUINTO(a) establecen gratuidad hasta cinco cuentas personales. La cuenta vinculada es Individual y hay una cuenta corriente; no se ha contratado un instrumento pagado. Esta verificación permite las lecturas GET del servicio dentro de ese límite. No autoriza planes, pagos, nuevas cuentas empresariales, Refresh Intents ni servicios opcionales. HTTP 402 detiene la ejecución sin contratar ni reintentar.

Primera lectura productiva exitosa con Movements v1 y versión 2026-02-01, usando configuración temporal en memoria y sin escrituras financieras. Los datos y respuestas reales permanecen solo en el servidor privado; no se incorporan a fixtures, documentación o repositorio.

**Solo cuenta corriente CLP de Banco de Chile.** [Cobertura oficial](https://docs.fintoc.com/guides/movements/overview-data-aggregation/products-and-institutions-movements) incluye checking/sight para personas; no documenta compras de tarjetas de crédito. Los pagos de tarjeta que aparezcan en la cuenta no son el detalle de compras. Se conserva la sincronización TC/N8N existente.

La frecuencia de refresco bancario depende del plan. Nuestro proceso consulta diariamente lo disponible y registra ambas fechas; no promete un SLA bancario de 24 horas ni fuerza un refresco pago. [Actualización](https://docs.fintoc.com/guides/movements/overview-data-aggregation).

## Enmienda de FRO y protección financiera

Se amplía FRO-09 para permitir tablas aditivas de integración y **INSERT exclusivamente de novedades inequívocas**. Se conservan todos los campos, IDs, fechas, importes, notas, clasificaciones y timestamps de cada registro financiero preexistente. Prohibidos UPDATE/DELETE en tablas financieras por parte del conector y cualquier escritura de saldo conocido. Los endpoints públicos de preview siguen siendo solo lectura; la ejecución diaria es interna, independiente de N8N.

## Criterios de aceptación

| ID | Requisito |
|---|---|
| FDS-01 | El tráfico exige FINTOC_ENABLED=true, FINTOC_PERSONAL_FREE_ACCESS_CONFIRMED=true, configuración válida y dueño/cuenta autorizados. El proceso diario exige además FINTOC_DAILY_SYNC_ENABLED=true. Secretos solo en .env privado. |
| FDS-02 | Programación independiente, una vez al día a las 07:00 America/Santiago, sin cambiar horarios, banderas o comportamiento de TC/N8N. No ejecutar importaciones al arrancar el servidor; el despliegue inicial ejecuta explícitamente el baseline. |
| FDS-03 | Leer los tres meses calendario que terminan en el mes actual de Santiago, paginación completa por mes y estados observados (confirmed_only=false). Preview público mantiene su filtro confirmado. Lotes inválidos/incompletos no producen inserciones parciales ni avanzan éxito/cobertura. |
| FDS-04 | Establecer corte inicial de fecha calendario Santiago, inmutable. Primer lote solo guarda referencias/metadatos y vincula coincidencias exactas 1:1; no inserta historia inicial. Duplicidades, diferencias y no coincidentes quedan en revisión visible. |
| FDS-05 | IDs nuevos confirmados con fecha estrictamente posterior al corte y no futura pueden añadirse con categoría/notas NULL si no hay candidatos locales ambiguos. IDs anteriores/iguales al corte y llegadas tardías se conservan pendientes, nunca se omiten silenciosamente. Un observado pendiente sin referencia financiera puede pasar a confirmado y seguir estas reglas, aunque cambien sus datos al liquidarse. |
| FDS-06 | Identidad única por dueño/cuenta/external_id. Repetir lotes o tener dos ejecuciones simultáneas no duplica movimientos. Nuevo Checking y mapping se confirman en la misma transacción. Bajo el lock, una ejecución anterior a last_success_at devuelve superseded sin conciliar ni escribir; un error tardío tampoco sustituye un éxito posterior. |
| FDS-07 | Dos IDs distintos legítimos con iguales fecha/importe/tipo/descripción conservan multiplicidad. No usar Set por parecido. Filas ya mapeadas a IDs confirmados presentes e invariantes en el lote no se vuelven candidatos libres. Si un ID desaparece/revierte y aparece otro idéntico, conservar y marcar discrepancia, sin duplicar ni reescribir el gasto. |
| FDS-08 | ID conocido con corrección de importe/fecha/descripción/estado, reversión o referencia financiera eliminada: metadatos de discrepancia y revisión; no modificar o recrear silenciosamente su Checking. Reconciliar pendientes solo con coincidencias libres inequívocas. |
| FDS-09 | Lock de escritura compartido por dueño entre sincronización, Checking.create y Checking.bulkImport para evitar decisiones sobre conjuntos obsoletos. Mantener normalización y semántica existentes del importador, sus resultados y categorías. Candidatos de otro dueño nunca participan. |
| FDS-10 | Importe CLP entero y seguro, positivo tras separar signo, y dentro de NUMERIC(14,2) antes de insertar. Descripción de Checking máximo 60 caracteres, original completo en metadatos. Derivar año/mes de fecha ISO; no usar timezone del host. |
| FDS-11 | Sin secretos en tablas, logs, respuestas o repo. Auth→resolveSpace→requireOwner→dueño configurado en todas las rutas. Namespace NetworkOnly/no-store se conserva. |
| FDS-12 | Mostrar hora diaria, última consulta completa, fecha bancaria, rango y pendientes. Más de 24 h sin fecha bancaria reciente se indica desactualizado aunque GET haya respondido. Cobertura significa lote completo para el rango, no garantía de cartola bancaria completa. |
| FDS-13 | Fallo de banco,401/402/429/5xx, timeout, paginación o persistencia: estado y bitácora seguros, rollback transaccional, sin anunciar éxito. No reintentar pagos ni cambiar planes. No retries inmediatos automáticos. |
| FDS-14 | Revisión de pendientes accesible en móvil y Claro/Oscuro, con datos exactos y razones comprensibles. Usuario/espacio/período cambiante descarta respuestas anteriores. Consulta de estado/pendientes usa solo DB; no dispara Fintoc. |

## Persistencia aditiva

Migración 031 crea exclusivamente:

- `fintoc_sync_state`: PK(user_id,account_id), cutover_date, last_success_at, bank_updated_at, coverage_since/until, last_error_code y timestamps de integración.
- `fintoc_external_movements`: PK(user_id,account_id,external_id), fecha, descripción completa, tipo, importe, estado/pending, huella del proveedor, disposition y reason, referencia opcional a Checking, had_financial_reference, firma financiera inmutable financial_snapshot y timestamps. Disposiciones: linked, inserted, needs_review, observed. Referencias borradas manualmente quedan como discrepancia; nunca se reinsertan por ese motivo, incluso si el banco reemite otro ID o modifica después sus campos.
- `fintoc_sync_runs`: bitácora por dueño/cuenta, trigger initial/manual/scheduled, estado success/error, conteos inserted/linked/review, rango, fecha bancaria, código seguro y timestamps.

No añadir/modificar columnas de tablas financieras, no clasificar, no ejecutar backfills históricos, no migrar datos existentes. Implementación puede añadir columnas de metadatos que necesite, documentándolas en la migración. Valores bancarios de metadatos permanecen en el servidor.

## API y contrato entre capas

`GET /api/checking/fintoc/daily-status` sin parámetros y solo del dueño. No modifica datos ni llama a Fintoc. Respuesta:

```json
{
  "provider":"fintoc", "enabled":true, "schedule":"07:00", "timezone":"America/Santiago",
  "state":"needs_review", "initialized":true, "cutoverDate":"2026-10-31",
  "lastSuccessAt":"2026-10-31T20:00:00.000Z", "bankUpdatedAt":"2026-10-31T19:00:00.000Z",
  "bankFreshness":"current", "coverage":{"since":"2026-08-01","until":"2026-10-31","complete":true},
  "pendingReviewCount":2, "importedTotal":0,
  "lastRun":{"trigger":"initial","status":"success","inserted":0,"linked":1,"review":2},
  "lastErrorCode":null
}
```

Estados: disabled, not_initialized, current, stale, needs_review, error. bankFreshness: current/stale/unknown. Fechas null cuando no existen. Nunca devolver user/account IDs de configuración o secretos.

`GET /api/checking/fintoc/review?limit=20&offset=0`: `{items:[{externalId,date,description,type,amount,status,reason,candidateCount}],total,limit,offset}`. amount cadena de pesos CLP, status del proveedor. Máximo 100, offset entero>=0, parámetros desconocidos 400. Mismos permisos/no-store. Solo lectura; no hay UI que aplique historia automáticamente.

Interfaces internas:

- Servicio proveedor añade `readSnapshot(actorId,{year,month})`, con misma paginación/validación pero sin excluir estados; items normalizados incluyen status/pending. `preview` conserva exactamente su contrato filtrado. Ningún endpoint del proveedor distinto de GET.
- Servicio diario factory `createFintocDailySyncService({db,provider,env,now})`: `run({trigger})`, `getDailyStatus(actorId)`, `getReview(actorId,query)`. Proveedor expone getStatus/assertOwner/readSnapshot. db es pool con connect/query; inyectable en pruebas.
- Helper `withCheckingWriteTransaction(db,userId,callback)` usa conexión reservada, BEGIN y `pg_advisory_xact_lock(hashtext('checking-write'),hashtext(userId))`, COMMIT/ROLLBACK y release. No cargar .env en helpers de pruebas.
- Estado/preview públicos permanecen sin acciones de escritura. No botón de sincronizar que se cuele en la cola offline. Programa interno separado `fintocDailyScheduler` y ejecución inicial explícita al desplegar.

## Verificación obligatoria

TDD RED→GREEN de proveedor, motor, scheduler, rutas y UI. PostgreSQL efímero con fixtures verifica baseline sin inserciones, inmutabilidad de cada columna existente, idempotencia, multiplicidad, reversión/reemisión, ambigüedad histórica, llegada tardía, transacción fallida, espacios y carrera CSV/manual. Navegador estático con APIs ficticias, bloqueo de red externa/escrituras y control de geometría. Nunca usar los helpers API que cargan .env y borran usuarios/datos.

Despliegue: backup código/build y huellas de nueve tablas financieras, aplicar únicamente migración 031, activar flags tras pruebas y primera lectura exitosa, ejecutar baseline explícito, verificar cron registrado y bitácora. Comparar todas las filas preexistentes byte a byte; las tablas nuevas pueden recibir metadatos y futuras novedades explícitamente permitidas. Ninguna restauración o modificación de historia para revertir el código.
