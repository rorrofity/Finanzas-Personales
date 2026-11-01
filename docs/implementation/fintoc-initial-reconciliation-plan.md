# Conciliación inicial Fintoc — plan y evidencia

**Estado:** implementado, publicado y aplicado en producción el 2026-11-01 a las 00:35:32 America/Santiago. Especificación FHR escrita antes del código el 2026-11-01 America/Santiago. [Contrato](fintoc-initial-reconciliation-contract.md).

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

Código `fb99412d23fb15d38ea55f207bc6e4965125044d` publicado e instalado en el servidor. Se respaldaron las nueve tablas financieras y el estado diario mediante consulta de solo lectura. Preview privado 0600/0700, revisado antes de apply; no efectuó escrituras financieras. La huella del mismo plan se recalculó y validó bajo el lock al aplicar.

Se incorporaron exclusivamente los faltantes confirmados y fechados hasta el día de conciliación. Las fechas futuras permanecen visibles en revisión. Ningún gasto existente se reescribió o eliminó; las incorporaciones tienen categoría/notas NULL. Cada fila original de Checking conserva todos sus campos y las otras ocho tablas financieras son idénticas. Estado, corte, cobertura, fecha bancaria y última consulta completa permanecen exactos; el cron 07:00 America/Santiago y TC/N8N no cambian.

Preview repetido: cero nuevas inserciones o enlaces. El plan puro del cron tampoco insertaría nuevamente ninguno de los IDs conocidos. La API autenticada de producción contiene todos los IDs incorporados y muestra los pendientes restantes con motivo future_date/no-store. Web HTTP200. Sin llamadas nuevas al proveedor, migraciones, cambios de configuración, build o reinicio del servicio.

[Evidencia pública sin movimientos ni importes](fintoc-initial-reconciliation-deployment.json). Planes, conteos reales, resultados y huellas de filas permanecen solo en `/var/backups/finanzas/fintoc-initial-20261101-fb99412/`, directorio privado del servidor. La configuración .env conserva su huella; los cambios documentales previos del usuario se preservan separados.

Al revertir código de la herramienta, conservar movimientos y referencias añadidos: no borrar ni reescribir información financiera. El proceso diario continúa con sus reglas originales y reconoce los IDs conciliados.
