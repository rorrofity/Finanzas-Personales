# Respaldos de Finanzas Personales

Contrato previo: [DBK-01–10](../../docs/implementation/daily-backup-contract.md).

## Qué se respalda

El servicio diario crea una copia consistente de PostgreSQL (`pg_dump -Fc`, origen de solo lectura), un snapshot compacto de SQLite N8N sin modificar su archivo activo, la configuración privada de la aplicación y N8N, y el entorno efectivo del contenedor. No detiene la web/N8N, modifica gastos/categorías, ejecuta importaciones ni restaura datos productivos.

PostgreSQL y N8N se capturan en momentos consecutivos: cada snapshot es consistente por separado; no constituyen una transacción distribuida entre ambas bases. La recuperación debe conservar la deduplicación y cotejar el estado del flujo antes de reactivar automatizaciones.

El archivo tar.gz contiene exclusivamente miembros regulares con nombres simples:

- `manifest.json`: hashes SHA-256 y metadatos operacionales para verificar contenido completo.
- `postgres.dump`: base financiera en formato custom comprimido.
- `n8n.sqlite`: copia compacta consistente de la base N8N.
- `n8n-runtime.json`: entorno efectivo/configuración del contenedor para recuperar su configuración, incluida una clave de cifrado definida por variable de entorno.
- Los archivos declarados en `privateFiles`, como `application.env`, `n8n-config.json` y `docker-compose.yaml` y `docker-compose.env`. Este último conserva las variables privadas usadas al interpolar Docker Compose.

Las credenciales cifradas de N8N requieren su clave de cifrado original, que puede estar en el archivo `config` o en su entorno efectivo. Un SQLite aislado no basta para recuperarlas. Los respaldos contienen información financiera y secretos: gzip comprime, no cifra. Directorios 0700, archivos 0600; nunca añadirlos a Git ni adjuntarlos a chats.

## Programación y conservación

`finanzas-backup.timer` ejecuta el servicio a las **03:30 America/Santiago**, siguiendo cambios de horario de Chile. `Persistent=false` evita una ejecución atrasada al arrancar el servidor. Una ejecución manual debe iniciarse explícitamente. Bloqueo del motor y servicio oneshot impiden solapamiento. El límite del servicio es de 20 minutos.

Configuración privada: `/etc/finanzas-backup/config.json`. `config.example.json` documenta campos y rutas; comprobar las rutas reales antes de instalarlo. El wrapper carga `.env` de la aplicación y transmite PostgreSQL por entorno privado, con `default_transaction_read_only=on`; nunca incluye contraseña en los argumentos.

La raíz gestionada predeterminada es `/var/backups/finanzas/automatic`, marcada con `.managed-by-finanzas-backup-v1`. Contiene:

- `daily/backup-YYYY-MM-DD.tar.gz`: hasta **7 copias diarias**, una por fecha local.
- `weekly/backup-YYYY-Www.tar.gz`: hasta **4 copias semanales**, promoviendo la primera copia verificada de cada semana ISO local.
- `state.json`: última ejecución y estado de avisos, sin contenido financiero.
- `.backup.lock`: exclusión mutua.

Los semanales pueden compartir almacenamiento con un diario mediante hardlink a un archivo inmutable. Verificar el archivo nuevo antes de rotar. La rotación solo afecta a archivos regulares con nombres propios dentro de `daily/weekly`; no sigue symlinks ni borra respaldos históricos/manuales externos a esta raíz. Un fallo conserva las copias anteriores. Repetir en la misma fecha no acumula diarios duplicados.

Antes de publicar se comprueba el conjunto exacto de miembros, todos sus hashes, el gzip/tar completo, la integridad de SQLite y la lectura completa del dump con `pg_restore --file=/dev/null`; esta comprobación no ejecuta SQL contra producción. Los snapshots de N8N ya se generan compactos; la base activa no se compacta ni se reinicia automáticamente.

## Avisos de espacio y fallos

En cada ejecución, el motor revisa el disco. Con uso **igual o superior al 85 %**, envía un aviso operacional mediante las suscripciones Web Push existentes del dueño. No elimina suscripciones expiradas ni modifica tablas financieras. Los fallos de respaldo utilizan el mismo canal. Se registra estado pendiente si no hay suscripciones o falla el envío; no se afirma entrega. Se deduplica por episodio y se reintenta mientras el aviso siga pendiente. Una recuperación permite avisar de un episodio nuevo.

El porcentaje también queda en el estado/log operacional. Un fallo de entrega no invalida ni elimina una copia correcta. El servicio no contrata servicios externos ni envía correos. El wrapper intenta un aviso de fallo cuando una configuración inválida impide iniciar el motor y este no alcanzó su ruta de avisos; los fallos que el motor ya procesó no generan un segundo envío. Si falta el archivo privado `.env`, no se pueden cargar las credenciales del canal y queda el fallo operacional en el log. La salida del hijo se filtra a campos operacionales conocidos y su stderr no se imprime.

## Operación

Instalar las unidades desde este directorio y la configuración con permisos privados, después de revisar rutas. Activar únicamente el timer:

```sh
systemctl daemon-reload
systemctl enable --now finanzas-backup.timer
systemctl list-timers finanzas-backup.timer
```

El timer no lanza un respaldo inmediato fuera de horario. Para la primera ejecución autorizada o una comprobación posterior:

```sh
systemctl start finanzas-backup.service
systemctl status finanzas-backup.service --no-pager
journalctl -u finanzas-backup.service --since today --no-pager
```

Verificar una copia concreta sin crear otro respaldo ni restaurar datos:

```sh
node /var/www/finanzas-personales/automation/backups/run-backup.cjs \
  --config /etc/finanzas-backup/config.json \
  --verify /var/backups/finanzas/automatic/daily/backup-YYYY-MM-DD.tar.gz
```

La salida contiene únicamente resultados operacionales. Los archivos privados de configuración, el entorno y los miembros del respaldo no deben imprimirse en logs.

## Recuperación controlada

1. Elegir una copia verificada; comprobarla con `--verify`. Mantener una copia independiente de los datos/configuración actuales antes de restaurar.
2. Extraer el archivo verificado en un directorio vacío privado (0700, umask 0077). No extraerlo directamente encima de la aplicación o del volumen activo.
3. Restaurar `postgres.dump` primero en una **base PostgreSQL aislada** usando `pg_restore`; comprobar tablas, fechas, categorías y operaciones relevantes. La verificación automática previa lee y valida el archivo completo, pero no sustituye una prueba periódica de restauración aislada.
4. Comprobar `n8n.sqlite` y recuperar su configuración, clave de cifrado y versión/entorno del contenedor desde los componentes correspondientes. Probar N8N con una copia aislada, sin acceso de red a proveedores/producción y sin disparadores activos, para impedir ejecutar automatizaciones reales durante la prueba.
5. Planificar el cambio productivo: pausar timer y automatizaciones, detener únicamente el servicio que se restaura, aplicar la copia/configuración revisada preservando propietarios y permisos, comprobar disponibilidad y cotejar deduplicación antes de reactivar horarios. No ejecutar automáticamente una restauración sobre gastos existentes.

Estas copias se guardan **en el mismo servidor**. Cubren errores operacionales, pero una pérdida completa del servidor exige una copia externa separada y protegida; no está incluida en esta implementación.

## Pruebas

```sh
npm run test:backend -- --runInBand backend/scripts/__tests__/backupAdapters.test.js
python3 -m unittest discover -s automation/backups/tests -v
```

Las pruebas usan datos ficticios y dobles del proveedor/servicios. No envían notificaciones reales ni consultan información bancaria.

La integración real PostgreSQL es un script separado para Linux/root con binarios PostgreSQL disponibles: `automation/backups/tests/integration_postgres.py --pg-bin /usr/lib/postgresql/14/bin`. Crea un clúster temporal con socket Unix privado y sin TCP, siembra datos ficticios y compara su restauración en otra base temporal. No carga `.env` de la aplicación ni conecta a PostgreSQL productivo. Los tres argumentos opcionales `--restore-archive`, `--expected-snapshot` y `--snapshot-sql` deben proporcionarse juntos: verifican/restauran una copia real exclusivamente en una tercera base aislada y comparan las huellas privadas de 11 tablas, sin imprimir datos. Al terminar se detiene y elimina el clúster completo. La copia original permanece intacta.

Ejemplo de validación aislada de una copia real (reemplazar las tres rutas privadas):

```sh
python3 automation/backups/tests/integration_postgres.py \
  --pg-bin /usr/lib/postgresql/14/bin \
  --restore-archive /ruta/privada/copia.tar.gz \
  --expected-snapshot /ruta/privada/huellas.json \
  --snapshot-sql /ruta/privada/financial-snapshot.sql
```

El archivo esperado debe contener `financial` con los once mapas de huellas de filas; otros campos de control, como `preferences`, se mantienen fuera de la comparación financiera. El SQL debe ser el SELECT de huellas revisado por el operador. Solo se ejecuta en la copia aislada y en una transacción de lectura, no sobre el servidor financiero original.
