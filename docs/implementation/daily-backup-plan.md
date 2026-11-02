# Plan DBK — implementación y operación

Contrato previo al código: [daily-backup-contract.md](daily-backup-contract.md).

## Diseño

Timer systemd diario `*-*-* 03:30:00 America/Santiago`, sin recuperación automática al arrancar fuera de horario. Servicio independiente, sin reiniciar aplicación/N8N, con bloqueo y timeout. El wrapper carga credenciales existentes solo en memoria; PostgreSQL usa transacción de lectura mediante pg_dump y N8N un snapshot SQLite compacto de lectura. Ambos snapshots son consistentes individualmente; no constituyen una transacción distribuida entre sistemas. El manifiesto conserva sus tiempos de captura.

Cada archivo completo comprimido contiene dump PostgreSQL, snapshot SQLite, configuración privada necesaria para restaurar conexiones, entorno efectivo Docker y manifiesto de hashes. Verificación de descompresión completa, miembros exactos, SHA-256, integridad SQLite y lectura completa de pg_restore sin conectar a la base de producción. Directorios privados y publicación atómica; solo después se promueve la copia semanal y se rotan exclusivamente nombres gestionados por la tarea. Mantener 7 diarias y 4 semanas ISO; un respaldo semanal corresponde a la primera copia válida de esa semana.

Uso de disco calculado como df: bloques usados/(usados + disponibles para aplicaciones), incluyendo el efecto del espacio reservado. Alerta desde 85 % inclusive, un aviso por episodio con recuperación/reintento; canal Web Push existente al dueño. Si no puede entregar, estado pendiente y registro operacional seguro. Fallos de respaldo también avisan sin exponer datos. La revisión se realiza en la tarea diaria; no se promete monitorización continua.

## Validación y despliegue

1. Observar nuevas pruebas RED antes del código; GREEN tras implementar motor, política, adaptadores y unidades.
2. Probar calendario real con systemd-analyze, retención 7/4 durante semanas y año, reejecución, corrupción, archivos inesperados/symlinks, bloqueo y fallos. Avisos con dobles de prueba, umbral 85 %, deduplicación, recuperación y entrega pendiente. Sin mensajes reales de prueba al usuario.
3. Integración desechable de snapshot/archivo/verificación, y PostgreSQL aislado para comprobar restauración. Ejecutar regresión del backend. No cambia frontend ni importadores.
4. Desplegar commit probado, instalar configuración privada/unidades y activar timer. Primera copia manual de respaldo autorizada, recorriendo/verificando el archivo real y conservando gastos/clasificaciones idénticos mediante huellas de 11 tablas. Comparar workflows y configuración privada, salud API/N8N y programación existente. Sin migraciones ni importaciones.
5. Versionar evidencia pública sin datos financieros, credenciales o endpoints, instrucciones de recuperación y commit final del servidor.

## Alcance de conservación

La raíz gestionada será `/var/backups/finanzas/automatic`, separada de respaldos históricos de despliegue. Configuración privada en `/etc/finanzas-backup/config.json`; estado operacional y copias solo en el servidor. Se respalda la configuración/clave de N8N para poder recuperar credenciales. Compresión gzip no equivale a cifrado: acceso limitado a root. Una pérdida total del servidor requiere una copia externa adicional, fuera de este despliegue.

## TDD y revisión

Antes de implementar se observaron RED por módulos ausentes y casos nuevos específicos: reintento de aviso en la misma ejecución, timestamps de captura, reserva adaptativa, entorno de Compose y fallo previo al motor. GREEN final: 678 pruebas backend en 32 suites (21 nuevas de adaptadores) y 21 pruebas Python. Cinco verificaciones adversariales independientes también pasaron: WAL activo preservado e incluido, gzip sin tráiler rechazado, SQLite corrupto rechazado aun con hashes coherentes, symlink rechazado y archivo ajeno preservado.

El motor comprueba espacio antes y después, reserva configurable y margen adaptativo mínimo + tres veces el último contenido sin comprimir. La instalación productiva usa 1 GiB de reserva mínima frente a copias actuales de pocos MB. Los snapshots no crecen por copiar páginas SQLite libres. Fallos de configuración previos al motor usan aviso de respaldo desde el wrapper si la configuración privada de notificaciones sigue disponible; si falta también esa configuración, quedan en log y salida fallida. La verificación con pg_restore no conecta a producción.

Prueba previa en clúster PostgreSQL 14 desechable, con socket Unix privado y TCP deshabilitado: dump real, archivo comprimido, verificación y restauración en segunda base temporal idénticos. Dos categorías, tres gastos y tres registros SQLite ficticios, incluidos Unicode/BLOB/NULL; origen intacto y repetición diaria sin otra copia. Clúster detenido y eliminado al terminar, sin acceso al PostgreSQL de producción ni notificaciones reales.

## Resultado en producción

Fuente `9aa57d439e0df164c6d2fcc0f56328cedbc8cb69`, verificada el 2026-11-01 a las 21:54 America/Santiago. [Evidencia pública](daily-backup-deployment.json). Servicio/timer instalados y habilitados; próxima ejecución 2026-11-02 03:30 Chile (06:30 UTC). Primera ejecución manual del servicio aprobada: archivo completo de 451.603 bytes, verificado, con diario y semanal compartiendo almacenamiento por hardlink. La retención máxima 7/4 se aplicará al acumular nuevas copias; históricos fuera de la raíz gestionada conservados. Directorios 0700, archivos/configuración 0600, 1 GiB de reserva mínima y margen adaptativo según último tamaño original. Disco 64,58 % usado y aproximadamente 9,1 GB disponibles.

Además de la integración ficticia previa, se verificó la primera copia real y se restauró su dump completo en una tercera base de un clúster temporal aislado, sin TCP ni credenciales productivas. Las huellas de las 11 tablas financieras recuperadas coincidieron exactamente con el original. Clúster y copia temporal retirados al finalizar. No se restauró ningún dato sobre producción, no se ejecutaron importaciones/migraciones y no se enviaron avisos de prueba.

Huellas antes/después: todos los gastos, categorías, notas, fechas, importes, saldos y preferencias idénticos. Configuración privada y workflows preservados. Backend/N8N disponibles sin reinicio; sincronización horaria, Fintoc diario y conciliación mensual conservados. Avisos operacionales al dueño por el canal Web Push existente; por debajo del umbral no hubo avisos ni pendientes. La comprobación de disco se realiza con la tarea diaria; la entrega depende de una suscripción válida y los fallos quedan pendientes para reintento. Copias locales privadas; copia fuera del servidor no incluida.
