# Plan HFS

[Contrato previo al código HFS-01–13](financial-health-freshness-contract.md). Fecha: 2026-11-02 America/Santiago.

1. RED de saldo canónico, consumidores, proyecciones puras y lectura consistente; RED de UI, frescura, refresco/caché/identidades.
2. Reutilizar el snapshot Fintoc de la base de datos como única referencia actual en Cuenta corriente, Salud y Dashboard, sin modificar históricos ni movimientos.
3. Resolver proyecciones completas en SELECT, conservar overrides/inactivas; compartir cálculo de compromisos y evitar falsos ceros ante errores.
4. Refrescar vistas con eventos/foco/reconexión/polling visible; cachear por identidad-hogar-período con fecha y estados explícitos.
5. Integración temporal PostgreSQL/HTTP, regresión backend/frontend, navegador local, PWA y build. Las pruebas antiguas de saldo alternativo se actualizan para verificar su retirada, conservando cobertura de permisos, precisión y errores.
6. Snapshot privado y huellas de catorce tablas; publicar código/build desde commit probado, comprobar lecturas y coherencia sin exportar importes ni generar movimientos; actualizar evidencia y Git.

## Resultado

Implementación terminada según HFS-01–13, sin migraciones. Cambios previos del usuario en documentos se conservan fuera de los commits de esta tarea.

- Saldo canónico: lectura pura del disponible Fintoc ya persistido; consumidores y paneles unificados. La cartola histórica permanece intacta y no se utiliza como saldo actual alternativo.
- Proyecciones: relación efectiva compartida, con plantillas faltantes resueltas virtualmente, overrides e inactivas respetadas. Salud usa una transacción consistente de solo lectura y sumas exactas; fallos por fuente producen importes desconocidos o evaluación parcial.
- Refresco: señales de cambios financieros, foco, visibilidad, reconexión y cinco minutos visible/online. Caché explícita por identidad, hogar y período, protección frente a respuestas tardías y cambio de hogar durante apertura de IndexedDB. Workbox no devuelve copias genéricas de Salud/saldo global.
- Presentación: tres cifras principales, fechas de fuente, razones de parcialidad y próximos compromisos con fechas conocidas. No se inventan vencimientos de tarjeta ni se marcan proyecciones como pagadas automáticamente.

TDD RED→GREEN observado antes de las implementaciones de saldo/consumidores, proyecciones, resiliencia, UI, caché/refresco y carreras. Los ajustes finales de porcentajes y estilos de importes desconocidos también tuvieron RED funcional previo. Las expectativas antiguas de saldo calculado se sustituyeron por assertions de saldo único, manteniendo pruebas de exactitud, permisos y conservación.

Validación local: 968 pruebas backend en 58 suites; 428 frontend en 52 suites; 7 PWA; build de producción correcto. PostgreSQL/HTTP aislado demuestra saldo idéntico en tres vistas, doce proyecciones virtuales sin DML, overrides/inactivas/fechas, lectura del hogar y conservación de catorce tablas. Regresiones SQL de divisiones y evolución aprobadas (30 y 8 lecturas respectivamente), sin acceso a producción.

Navegador: 219 casos aprobados y 13 omisiones previstas por viewport, incluyendo 21 casos nuevos de Salud en escritorio, móvil y tablet. La ejecución completa aprobó 215 casos; cuatro expectativas de texto antiguo se actualizaron y esos cuatro casos pasaron al repetirlos, sin cambios de producto ni reducción de cobertura. Verificación/despliegue productivo: en curso.

## Operación y reversión

Publicar desde el commit probado, construir en directorio separado y conservar los assets anteriores. Antes de activar: respaldo privado comprimido PostgreSQL, verificación del archivo y huellas privadas de las catorce tablas financieras, identidades/membresías y configuración. Después: verificar por HEAD autenticado y comparaciones internas que las tres vistas usan el mismo saldo/fecha y que consultar no crea ocurrencias. Exportar solo estados, fechas, recuentos y booleanos, sin importes.

Ante un fallo, restaurar el código/build previo y reiniciar el backend; no restaurar automáticamente la base de datos ni deshacer movimientos legítimos recibidos mientras tanto. Fintoc, correos, conciliación, respaldos y sus horarios permanecen sin cambios. La evidencia final se registra en `financial-health-freshness-deployment.json`.
