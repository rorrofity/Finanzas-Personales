# Plan CSN

Estado: desplegado y verificado en producción. Contrato CSN escrito antes del código.

1. Auditar esquema, reglas de duplicados, fuentes, programación N8N y diferencias de total bancario frente a consumos.
2. TDD del horario nocturno/ventana de búsqueda; motor de preview/aplicación conservador y tabla de acciones.
3. TDD UI de total oficial/cobertura/diferencias y conversiones USD pendientes.
4. PostgreSQL temporal: preservar originales, registrar solamente faltantes, repetir, rollback y carreras reales contra escritores legacy.
5. Revisar diff, regresión pertinente, build/QA y despliegue en servidor. Comparar huellas originales, aplicar preview revisado y comprobar repetición sin nuevas inserciones.
6. Actualizar repo, servidor, documentación y evidencia pública sin datos bancarios.

## Validación completada

- Backend: **651 pruebas / 31 suites**; frontend: **270 / 31 suites**; navegador: **141 aprobadas / 13 omisiones previstas por viewport**; PWA: **7**; lector PDF local sin cambios: **40**. Total: **1109 pruebas aprobadas**.
- PostgreSQL efímero CSN UTF-8: 13 bloques, con esquema real y migraciones repetidas. Verifica importación CLP/USD sin conversión inventada, inmutabilidad campo a campo de originales y categorías/notas/timestamps, replay/reenvío/tombstones/ciclos/versiones, importes editados, digests obsoletos, compensación monetaria engañosa, rollback por trigger y concurrencia real con writers legacy y guarda de correo.
- Barrera 035: RED mostró copia con snapshot antiguo; GREEN rechaza copias CLP/USD, fechas próximas y CLP de signo opuesto que el legado cuenta por ABS. Permite otros bancos/tarjetas/comercios/importes/manuales sin procedencia. Contexto interno revalidado permite cargos bancarios legítimos y se borra tras COMMIT/ROLLBACK; metadata no puede falsificarlo.
- Workflow TDD: 4 RED antes del cambio, 22 casos finales GREEN; ScheduleTrigger 2.7.5, búsqueda completa de 40 días, rama manual preservada y descarga explícita. Sin nodos de envío o mutación de correo y retención deshabilitada.
- Reauditoría corrigió bloqueos excesivos entre meses, fechas de encabezado incompatibles, identidad de red contradictoria, CLP negativos y lock al inicio del lote legacy. Sin debilitar las garantías anteriores; la integración CSR de solo lectura también pasa con 034/035.
- UI de total oficial/cobertura/diferencias/extras y USD pendientes. Liquidez y salud financiera identifican proyecciones CLP parciales; evolución ya identifica conversiones excluidas. QA ficticia móvil claro/oscuro, 320/375/768/1440 px, sin escrituras, errores ni scroll lateral. [Evidencia visual](card-statement-nightly-qa/evidence.json).

Comandos: `npm run test:backend -- --runInBand`, `CI=true npm run test:unit -- --runInBand`, `DASHBOARD_BUILD_DIR=/private/tmp/finanzas-csn-ui-final npm run test:dashboard`, tests PWA contra el mismo build, lector Python `-B -m unittest discover`, e integraciones `card-statement-nightly-settlement.integration.cjs` y `card-statement-reconciliation.integration.cjs`. Datos exclusivamente ficticios; sin .env/Gmail/producción en las pruebas.

## Operación prevista

Respaldos privados de base/configuración/build/workflow y huellas por fila; se aplican solo 034 y 035. Build en servidor, preview privado y aprobación operativa de fingerprints antes de insertar. Aplicación revalida digest bajo locks, conserva todos los originales y agrega solo faltantes respaldados por evidencia, sin categoría. Activar AUTO_POST privadamente y demostrar que PM2 lo cargó verificando `settlement` en la respuesta HTTP del recorrido Gmail. Repetición no añade filas; API conserva permisos/no-store. Actualizar únicamente workflow propio y verificar hashes de los demás. Documentar evidencia pública al completar, sin datos bancarios.

Revisión previa a la aplicación real: una marca heredada distinta no descarta un posible duplicado si falta la tarjeta física. TDD adicional mantiene el cargo en revisión en ese caso y permite tarjetas identificadas distintas. Regresión final 651 backend y PostgreSQL CSN completos aprobados.

Las tablas históricas de producción tienen un propietario distinto del rol de aplicación: 034/035 requieren ejecutarse con el propietario de la base, conservando dueño/permisos de las tablas existentes y asignando únicamente la nueva bitácora al rol de aplicación. Verificación de huellas antes/después; ningún cambio en valores financieros.

Compatibilidad de producción: transactions no tiene columna notas. La escritura omite ese campo sin añadir columnas; las notas históricas en metadata permanecen idénticas. Se corrigió la fixture que añadía una columna inexistente, se observó RED real sin ella y GREEN con el esquema auténtico. Ambos intentos previos de aplicación se revirtieron íntegros, sin inserciones ni cambios de originales.

El lote N8N usa un bucle real de un PDF por iteración; la salida de finalización acumula las respuestas. Un retraso entre solicitudes HTTP no garantiza serialización en 2.7.5. TDD 2 RED→22 GREEN y comprobación autenticada de disponibilidad tras reinicio antes del ensayo final. Esto evita comparar el segundo documento con el estado anterior a la incorporación del primero.

## Entrega verificada

Verificada el 2026-11-01 a las 16:53:15 America/Santiago. [Evidencia de despliegue](card-statement-nightly-settlement-deployment.json), [programación N8N](card-statement-nightly-settlement-n8n.json) y [recorrido Gmail real](card-statement-nightly-settlement-gmail.json). Los artefactos públicos solo contienen comprobaciones operativas; sin importes, clasificaciones, movimientos ni credenciales.

Interfaz construida en el servidor (`4dafa29`), backend compatible con el esquema real (`f41a1ea`) y procesamiento secuencial del workflow (`dc99105`). Solo 034/035, respaldos privados y configuración AUTO_POST privada. Nuevo horario publicado: 23:00 America/Santiago, días 25–30, máximo seis ejecuciones al mes, búsqueda completa de 40 días y nueve nodos. Otros workflows idénticos, incluidos estado/versiones/settings; ninguna mutación de mensajes. Ejecuciones sin retención de adjuntos.

Se revisaron los previews reales y se incorporaron únicamente faltantes inequívocos, sin categoría ni notas. Comparación por huella de todas las filas originales en nueve tablas financieras, más imports/tarjetas: originales intactos, ninguna categoría o nota histórica modificada, solo nuevas filas autorizadas. Cada inserción nueva también se cotejó con fecha, descripción, importe, identidad y vencimiento del documento. Los detalles y conteos reales permanecen privados.

Prueba Gmail real de Visa y Mastercard, CLP y USD, con backend disponible: ambas respuestas HTTP contienen settlement y demuestran que PM2 cargó la configuración automática. Repetición sin nuevas inserciones. Guard de avisos tardíos y barrera de INSERT ensayados con el rol real, en transacciones revertidas; ambas impiden duplicados. Contexto interno no persiste tras la aplicación.

Total oficial literal preservado por sección; datos inciertos, cuotas, períodos editados y cargos extra mantienen conciliación abierta, sin ajustes artificiales ni cambios de historia. USD nuevo conserva importe original; conversión pendiente explícita y CLP parciales en las vistas afectadas. API titular200/no-store, otro403, anónimo401, assets actuales y previos comprobados por contenido. Configuración privada anterior conservada.
