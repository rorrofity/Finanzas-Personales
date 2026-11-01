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
