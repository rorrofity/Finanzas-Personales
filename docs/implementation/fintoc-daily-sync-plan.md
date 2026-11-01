# Epic18 — Plan y evidencia de sincronización diaria Fintoc

**Estado:** implementado, validado y desplegado en producción el 2026-11-01 a las 00:22:29 America/Santiago. Especificado antes de implementar. [Contrato FDS-01–14](fintoc-daily-sync-contract.md).

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

Código `3a7b1af414c6181f6e0330bc5d37fe164840397a` publicado y construido en el servidor del proyecto. No se instalaron dependencias. Se aplicó exclusivamente la migración 031, que crea tres tablas de integración sin alterar tablas financieras. Credenciales y configuración privada conservadas con permisos 0600; las tres banderas de lectura, acceso gratuito confirmado y ejecución diaria están activas.

El baseline real de tres meses calendario terminó completo y exitoso. Guardó metadatos/referencias, sin insertar historia. Corte inicial: **2026-11-01 America/Santiago**; fechas de ese día o anteriores sin coincidencia inequívoca permanecen visibles en revisión. El conector puede añadir novedades confirmadas posteriores al corte, con categoría/notas NULL y protección contra duplicados. No existe una acción pública para aplicar historia automáticamente.

Se verificó el registro del cron **07:00 America/Santiago** en el proceso PM2 real, independiente de TC/N8N y sin ejecución al arrancar. Estado privado inicializado, cobertura completa y fecha bancaria reciente. Las respuestas del dueño son 200/no-store; otro usuario recibe 403 y el acceso anónimo 401. App, módulo diario, service worker y JS anterior responden 200. La frecuencia de refresco del proveedor sigue distinguiéndose de la consulta diaria.

Las huellas de cada fila de las **nueve tablas financieras son idénticas** antes de la migración, tras ella, tras el baseline y tras verificar la API: **0 añadidos, 0 modificados, 0 eliminados**. Categorías, notas, saldos y timestamps preexistentes intactos. [Evidencia pública sin datos bancarios](fintoc-daily-sync-deployment.json); snapshots y resultados reales solo en el servidor privado.

Rollback: código anterior `6294e433daf28728355a39d245751bf9621032e2`, build y configuración privada en `/var/backups/finanzas/fintoc-daily-20261101-3a7b1af/`. Desactivar banderas, restaurar únicamente código/build y reiniciar el proceso; no restaurar ni reescribir historia financiera. Las tablas nuevas pueden permanecer deshabilitadas.

Los cambios documentales previos del usuario y sus archivos de recuperación se conservaron separados y sin cambios.


## Conciliación explícita posterior del baseline

El 2026-11-01 el titular autorizó incorporar los faltantes iniciales mediante la [enmienda FHR](fintoc-initial-reconciliation-contract.md). [Operación verificada](fintoc-initial-reconciliation-plan.md): solo INSERTs faltantes, originales intactos y fechas futuras pendientes. No cambia las reglas automáticas, el corte ni las fechas de actualización de esta entrega; los IDs conciliados quedan mapeados para impedir duplicados.
