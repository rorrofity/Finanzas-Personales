# Plan de división de gastos

Contrato: [ESP-01–13](expense-splits-contract.md), establecido antes de código. Fecha de solicitud: 2026-11-02 America/Santiago.

1. Escribir pruebas RED para modelo/migración/API, agregaciones y modal/filtros. Registrar fallos antes de implementación.
2. Implementar overlay separado con FKs, locks, dinero exacto, versiones UUID y guardas; consultas de lista por lote. No mutar filas financieras al repartir/deshacer.
3. Integrar modal común en tarjetas nacionales/internacionales y cuenta corriente; conservar categoría simple para no repartidos y permisos/caché.
4. Sustituir por partes únicamente en análisis por categoría, mantener padres para totales/saldos/conciliación; actualizar filtro pendiente y detalle atribuible.
5. Probar en PostgreSQL/HTTP aislado, probar deduplicación idempotente y conservación del historial con fixtures; navegador local y regresión/build.
6. Revisar cambios y snapshot/huellas privados en producción; migración 037 dirigida, publicación backend/build y verificación sin importar datos ni crear repartos reales. Actualizar Git y evidencia pública sin información bancaria.

## Evidencia y resultado

Implementación probada y desplegada. Documentos previos modificados por el usuario se mantienen fuera de los commits de esta tarea. La verificación productiva se detalla al final.

### TDD y regresión local

- Backend: RED de tres módulos ausentes antes del servicio/controlador/rutas; GREEN 56 casos. Adaptadores de listas/guardas: diez fallos funcionales observados antes del cambio y diez casos aprobados después. Analytics: RED por contar categorías como compras, no atribuir el importe y omitir referencia al original; integración SQL anterior al cambio devolvió 340000 en la categoría original en vez de 10000. GREEN tras sustituir padres por partes.
- Frontend: RED del componente/helper ausentes, dos filtros funcionales, diez casos de páginas, dos detalles y dos indicadores móviles. El navegador original no contenía Dividir gasto. Después se detectó en navegador un thumb personalizado sin posicionamiento de MUI; una comprobación de estilos falló antes de corregirlo con SliderThumb y pasó después. La prueba de arrastre verifica geometría del importe escrito tras terminar su animación, y actualización del monto antes de soltar.
- Regresión final: 917 pruebas backend / 50 suites; 374 frontend / 45 suites; 198 navegador aprobadas con 13 omisiones previstas por viewport; siete PWA aprobadas. Los 27 escenarios nuevos de navegador incluyen las tres fuentes, cancelar/guardar/deshacer, partes pendientes, permisos, conflictos, escritorio/móvil/tableta, modo oscuro, teclado y toque sobre la barra. Build CI correcto.
- PostgreSQL/HTTP temporal, sin TCP ni `.env`: tres fuentes, suma exacta y restricciones SQL, propietario/categorías, lector sin escritura, miembro editor auditado, conflictos concurrentes, versiones tras borrar/recrear, retirada explícita y cascadas. Padres y categorías ficticias idénticos byte a byte. Reimportación real de los modelos nacional/internacional/cuenta corriente: cero insertados y uno omitido por fuente, con repartos idénticos. Matcher y planificación de cartola con una parte NULL: matched=1/link=1/insert=0, también al repetir con evidencia.
- Integración analítica aislada: 31 SELECT reales, tres fuentes, cuatro compras, categorías repetidas agrupadas, pendientes parciales, detalle atribuible, counts de compras y agregaciones legacy/proyectadas. Huellas financieras ficticias idénticas. Integración anterior de evolución también aprobada.

### Publicación y recuperación

Solo migración 037, ejecutada en una transacción como propietario del esquema; grants CRUD de ambas tablas y EXECUTE de las cuatro funciones al rol de aplicación, verificados después. La migración crea tablas, índices, funciones y triggers sin actualizar filas financieras. Las tablas nuevas empiezan vacías; ningún gasto se reparte automáticamente.

Antes de publicar: huellas privadas de once tablas financieras y de usuarios/membresías, pg_dump comprimido validado por pg_restore --list y checksum, hash de configuración y copia del build anterior. Construir desde el commit publicado, retener assets antiguos y reiniciar únicamente finanzas-backend. Mantener configuración, horarios de correos/Fintoc, N8N y respaldos.

Recuperación si falla la publicación: recuperar el directorio del build anterior y el código del SHA previo, reiniciar backend; conservar migración y datos. Nunca restaurar automáticamente el dump ni borrar repartos que alguien haya guardado. Si falla el segundo rename al publicar, el operador devuelve el build anterior de inmediato.

### Uso

En una compra elegible, pulsar Dividir gasto. Elegir categoría y monto de cada parte, arrastrar los separadores o escribir importes, añadir partes o repartir por igual y confirmar. Las categorías existentes se reutilizan; no hay selector de persona. Editar división conserva control de versión; Deshacer división pide confirmación y vuelve a usar la categoría original sin reescribirla. Sin categoría encuentra cualquier parte pendiente y el desglose indica su importe. Solo lectura muestra el desglose sin permitir cambios.

### Resultado productivo

Verificado el 2026-11-02 a las 21:13 America/Santiago (2026-11-03T00:13:10Z). Backend e interfaz construidos y publicados desde `6d24d7e435bba37e93daf517a50a1560d3b0741a`. [Evidencia sin datos bancarios](expense-splits-deployment.json).

Migración 037 y privilegios CRUD/EXECUTE comprobados. Las nuevas tablas de reparto están vacías; cero repartos, usuarios o movimientos de prueba creados en producción. Las once tablas financieras resultaron exactamente idénticas antes/después, incluidas categorías, importes, fechas, notas y referencias; identidades/membresías y archivos de configuración idénticos. No se consultaron movimientos al proveedor ni se ejecutaron importaciones reales.

Las once rutas autenticadas de membresías, categorías, listas, overview, análisis por categorías, evolución de las tres fuentes, saldo/estado Fintoc guardados y cartolas respondieron 200. Lectura de un reparto inexistente devuelve 404, ingesta de reparto sin sesión 401, payload inválido 400 y actor sin acceso 403. Assets nuevos y anteriores disponibles; N8N saludable y respaldo automático activo. La primera lectura autenticada durante el arranque del proceso no pasó la sonda; la comprobación completa posterior aprobó sin cambiar datos o configuración.

El respaldo PostgreSQL comprimido, checksum, huellas y build previo quedan privados bajo `/var/backups/finanzas/expense-splits-20261102`. Git y el checkout productivo incluyen la documentación final; no requiere otra compilación por ser cambios documentales.
