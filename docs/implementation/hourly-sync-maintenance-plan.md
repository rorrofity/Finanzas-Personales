# Plan y evidencia HSM

Contrato previo: [hourly-sync-maintenance-contract.md](hourly-sync-maintenance-contract.md).

## Implementación y TDD

- Scheduler: nuevas pruebas fallaron primero (cinco casos); después 10/10 aprobadas. Validan 17 horas locales exactas, medianoche, invierno/verano de Chile, configuración alternativa, registro único y espera de la promesa con noOverlap.
- Interfaz: tres pruebas nuevas fallaron con el texto anterior; después 3/3 aprobadas. Se comunica la ventana 08:00–00:00 y se conserva la preferencia del usuario.
- Conciliación mensual: primero falló la expectativa 23:10 (1 fallo, 21 aprobadas); después 22/22 aprobadas. Solo cambia la expresión cron de fábrica/plantilla; mismos días 25–30 y zona America/Santiago.
- Regresión completa local: backend 657/657 en 31 suites; interfaz 309/309 en 35 suites. Sin migraciones ni cambios al importador, deduplicación o clasificaciones.

## Despliegue y mantenimiento

1. Capturar huellas privadas de todas las filas financieras (11 tablas) en una transacción de solo lectura. Respaldar configuración, commit y build anteriores.
2. Comprimir exclusivamente el respaldo histórico `card-statements-20261101-4d4d8f3/n8n-before.sqlite`; comparar SHA-256 original con dos lecturas de descompresión antes de retirar el archivo redundante.
3. Probar el operador de compactación en SQLite desechable. Detener solo N8N, confirmar parada/checkpoint, comprobar integridad y huellas privadas de esquema/filas/secuencias/relaciones. `VACUUM INTO`, comprobar equivalencia, conservar journal/permisos, reemplazo con respaldo original y reinicio protegido. Comprimir y verificar también ese respaldo. No purgar ejecuciones ni borrar otros archivos.
4. Desplegar el commit probado y construir interfaz en el servidor. Conservar assets previos para pestañas abiertas. Publicar únicamente el cambio de horario de la conciliación por API oficial de N8N, manteniendo los demás workflows idénticos.
5. Configurar `SYNC_CRON_TIMES="0 8-23 * * *,0 0 * * *"`, reiniciar backend y verificar horarios efectivos, salud y recursos. Conservar concurrencia N8N=1 y Fintoc a las 07:00.
6. Comparar huellas financieras; no ejecutar importaciones reales como prueba. Guardar evidencia pública de resultados sin información financiera ni credenciales; actualizar repositorio y checkout productivo.

## Límites

La ventana aplica a la captura de emails de cargos de tarjeta, nacionales/internacionales, por el flujo existente. La cuenta corriente Fintoc mantiene su ciclo diario. La conciliación mensual busca cartolas a las 23:10 del 25 al 30; no se alteran sus reglas financieras. Los respaldos comprimidos conservan el contenido original completo, incluso páginas libres históricas, dentro de directorios privados del servidor.

## Resultado productivo

Fuente probada `dce92b4840bbbc94e116b3a11567bd1b3acf971a`, verificada el 2026-11-01 a las 21:06 America/Santiago. [Evidencia pública](hourly-sync-maintenance-deployment.json). Cron registrado en proceso productivo y `.env`: `0 8-23 * * *,0 0 * * *`. Preferencia del titular activa, sin modificarla. Mensual publicado con nueva versión a las 23:10, demás workflows idénticos y concurrencia uno. Fintoc sigue habilitado a las 07:00. Builds local/servidor correctos; texto publicado y assets nuevos/anteriores disponibles.

Se recuperaron 7.284.916.224 bytes netos (~7,3 GB); disponibles 9.142.947.840 bytes (~9,1 GB). Respaldo histórico N8N 4.071.706.624→432.192.419 bytes; base activa 4.071.706.624→933.888 bytes. Original previo a compactar conservado en segundo respaldo de 432.196.227 bytes. Ambos gzip verificados por SHA-256 de descompresión antes de retirar archivos redundantes. No se retiraron otros respaldos, PDFs, credenciales ni workflows. N8N pausado 2,134 segundos; 61 tablas, esquema, secuencias, relaciones, journal y permisos preservados. Operador probado en base desechable con BLOB/NULL, índices, trigger, FK, AUTOINCREMENT, archivo residual y fallo de reemplazo/restauración.

Las 11 tablas financieras resultaron idénticas en huellas de todas sus filas, incluidos importes, fechas, categorías y notas. Ninguna migración ni importación real ejecutada para probar. Verificación de disponibilidad mediante API autenticada de configuración, estado diario Fintoc y SELECT de solo lectura, más PM2/N8N y assets HTTP. El endpoint legacy `/api/health` queda detrás del fallback de React y devuelve HTML; no se tomó su HTTP 200 como prueba de salud ni se amplió el cambio para modificarlo.
