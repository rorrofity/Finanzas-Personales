# Conciliación inicial Fintoc — plan y evidencia

**Estado:** implementación y validación completas; conciliación productiva pendiente. Especificación FHR escrita antes del código el 2026-11-01 America/Santiago. [Contrato](fintoc-initial-reconciliation-contract.md).

1. Revisar agregados privados de pendientes e historial completo; identificar fechas futuras y posibles cruces con tarjetas sin exportar movimientos.
2. TDD del plan y apply bajo lock, identidad externa, controles de estado obsoleto y conservación de todas las filas originales.
3. Integración en PostgreSQL temporal con fixtures, incluyendo rollback y carreras de importación.
4. Publicar herramienta, actualizar el servidor sin migraciones ni cambios de configuración/cron. Crear respaldo privado y preview revisable.
5. Revisar el plan real y aplicar solo faltantes inequívocos. Comparar nueve tablas financieras y repetir preview para acreditar ausencia de nuevas inserciones duplicadas.
6. Registrar evidencia pública sin datos bancarios, publicar repo y sincronizar documentación en el servidor.

## Validación completada

- RED por ausencia del motor; GREEN: 49 pruebas de planificación/transacción y 13 de CLI. Ajuste RED→GREEN adicional para contar una vez cada candidato de metadatos aunque tenga varias firmas.
- Regresión completa backend: **342 pruebas, 15 suites**, aprobadas. Sintaxis y diff sin errores.
- PostgreSQL temporal con fixtures y migración 031 existente: preview sin escrituras, coincidencias, multiplicidad, colisión por truncamiento, futuro, límites, fuente TC/internacional, tombstones y lote posterior. Conservación exacta de nueve tablas originales y estado diario. Rollback tras INSERT/fallo de mapping y ante un trigger que modifica un original. Carrera cartola/aplicación y dos aplicaciones simultáneas sin duplicar; plan obsoleto y cambio del día protegidos.
- Reauditoría independiente de motor y CLI: sin hallazgos bloqueantes; 62 pruebas nuevas ejecutadas también por el revisor.
- No cambios de interfaz, dependencias, migraciones, configuración ni cron. No requiere reconstruir el frontend ni reiniciar el backend: las rutas actuales leen los datos conciliados de la base.

Comandos: `npm run test:backend -- --runInBand`, `node tests/integration/fintoc-initial-reconciliation.integration.cjs`. El runner crea y destruye su propio PostgreSQL por socket temporal; no carga .env ni usa el banco o la base existente.

## Operación productiva

La herramienta se publicará y se generará un preview en el servidor, en directorio 0700 y archivo exclusivo 0600. Se revisarán conteos y motivos, se aplicará la misma huella recalculada bajo lock y se compararán las nueve tablas financieras. Los detalles reales permanecerán exclusivamente en el servidor. Al revertir código, conservar movimientos y referencias añadidos: no borrar ni reescribir información financiera.
