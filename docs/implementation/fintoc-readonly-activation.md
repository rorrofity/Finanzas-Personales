# Activación privada de Fintoc — cuenta propia

**Estado al 2026-11-01:** el titular completó personalmente la vinculación Banco de Chile Individual en live y la configuración permanece privada en el servidor. Se confirmó la gratuidad publicada para hasta cinco cuentas personales en los términos canónicos de Chile y se realizó una primera lectura real exitosa, sin escrituras financieras. Epic18 tiene implementación y pruebas listas; su despliegue y activación diaria son el siguiente paso. El resultado definitivo se registra en el [plan Epic18](fintoc-daily-sync-plan.md), bajo el [contrato FDS-01–14](fintoc-daily-sync-contract.md).

El preview de Epic17 permite **consultar movimientos confirmados y verlos por separado**, sin persistirlos. Epic18 añade un proceso diario interno para cuenta corriente CLP: baseline sin insertar historia y posteriores novedades inequívocas, con categoría/notas NULL. Conserva íntegros los gastos y clasificaciones existentes y no escribe saldos. No envía los gastos de nuestra base a Fintoc. Las compras de tarjeta de crédito mantienen su integración TC/N8N existente.

## 1. Habilitación y costo confirmados para este alcance

Los [términos de Chile](https://www.fintoc.com/cl/legal/terminos), seleccionando **Para desarrolladores → Términos y condiciones**, incluyen Conciliación Bancaria entre los Servicios y establecen gratuidad hasta cinco cuentas personales en 2.3 y QUINTO(a). El vínculo es Individual y está dentro de ese límite; no se ha contratado un instrumento pagado. Junto con la lectura live exitosa, esto resuelve la habilitación y gratuidad requeridas para las consultas GET de este proyecto. La [investigación histórica](../proposals/checking-daily-sync.md) conserva la incertidumbre inicial, ya resuelta para este acceso.

El titular ya completó el alta y la autorización bancaria mediante el flujo oficial. La habilitación no autoriza contratar planes, pagos, nuevas cuentas empresariales, Refresh Intents ni servicios opcionales. HTTP402 detiene la ejecución sin contratar ni reintentar.

La consulta diaria utiliza los datos disponibles en Fintoc. La frecuencia de actualización desde el banco depende de la modalidad del proveedor; no se promete un refresco bancario nuevo cada 24 horas. La web distingue la última consulta completa de la fecha bancaria y señala datos desactualizados. No fuerza refrescos de pago.

## 2. Vincular la cuenta propia en Fintoc

Fintoc recomienda su Dashboard para conectar la cuenta del propio desarrollador. Seguir la [guía oficial de cuenta propia](https://docs.fintoc.com/guides/movements/guides/guides-banking-link-from-dashboard), desde el [Dashboard oficial](https://dashboard.fintoc.com/), una vez habilitado el modo correspondiente. El vínculo debe corresponder a Chile, persona natural y Banco de Chile.

Las credenciales bancarias se introducen únicamente en el flujo oficial autorizado de Fintoc, nunca en el chat ni en formularios de nuestra web. Ese vínculo permite que Fintoc procese información de la cuenta; no significa que la información bancaria permanezca exclusivamente en nuestro servidor.

La guía oficial advierte que el **Link Token** concede acceso a los datos y debe guardarse de forma segura al aparecer; no puede recuperarse después de cerrar el modal. Tratarlo como un secreto, al igual que la clave secreta de API. No enviarlos por correo, chat, capturas o tickets. [Flujo de integración](https://docs.fintoc.com/guides/movements/integration-with-exchange-token).

## 3. Configurar exclusivamente el servidor

Un administrador configura el `.env` privado ya existente del servidor; no crea otro archivo de secretos dentro del repositorio. Usar un editor privado y permisos restringidos. Evitar comandos con valores que puedan quedar en el historial, impresiones del entorno y registros de respuestas completas del proveedor. Ninguna clave utiliza el prefijo `REACT_APP_`.

Plantilla sin credenciales:

```dotenv
FINTOC_ENABLED=false
FINTOC_PERSONAL_FREE_ACCESS_CONFIRMED=false
FINTOC_DAILY_SYNC_ENABLED=false
FINTOC_MODE=test
FINTOC_OWNER_USER_ID=
FINTOC_SECRET_KEY=
FINTOC_LINK_TOKEN=
FINTOC_ACCOUNT_ID=
```

| Variable | Configuración privada |
|---|---|
| `FINTOC_ENABLED` | La plantilla permanece deshabilitada. Se activa mediante el procedimiento de despliegue de Epic18, después de las validaciones. |
| `FINTOC_PERSONAL_FREE_ACCESS_CONFIRMED` | La condición de acceso personal gratuito ya fue confirmada para el alcance descrito; el despliegue registra su activación privada. No representa permiso para contratar o pagar. |
| `FINTOC_DAILY_SYNC_ENABLED` | Control independiente del proceso diario. Se habilita en el despliegue controlado de Epic18, que ejecuta el baseline explícito y verifica el cron; no altera TC/N8N. |
| `FINTOC_MODE` | `test` para datos de prueba o `live` para acceso real habilitado. Debe coincidir con la clave y el vínculo utilizados. |
| `FINTOC_OWNER_USER_ID` | UUID del usuario dueño ya existente en nuestra web. El administrador lo identifica de manera privada mediante consulta de solo lectura; no crea otro usuario ni toma el ID de un invitado. |
| `FINTOC_SECRET_KEY` | Clave secreta del ambiente correspondiente en Fintoc. Solo permanece en el servidor. |
| `FINTOC_LINK_TOKEN` | Token completo del vínculo propio, obtenido del Dashboard y conservado de manera privada. |
| `FINTOC_ACCOUNT_ID` | ID de la cuenta corriente CLP dentro de `accounts` del vínculo. El administrador lo verifica desde el servidor con las herramientas autorizadas, sin exponer token, clave o respuesta bancaria completa. No es el número de cuenta. |

El conector comprueba Banco de Chile (`cl_banco_de_chile`), país Chile, titular individual, vínculo activo y cuenta corriente CLP no removida. El usuario de la web no puede sustituir esos identificadores en una petición. Los miembros de espacios compartidos y otros dueños no pueden consultar esta conexión.

Las pruebas automatizadas usan transporte ficticio y no necesitan credenciales reales ni una conexión al banco. Un resultado en modo `test` debe permanecer identificado como prueba.

## 4. Consulta y activación de Epic18

La primera lectura productiva ya fue exitosa con configuración temporal en memoria, sin escrituras financieras. Para el despliegue diario seguir exclusivamente el [plan Epic18](fintoc-daily-sync-plan.md): respaldo y huellas financieras, migración aditiva 031, configuración privada, baseline explícito y verificación de cron a las 07:00 America/Santiago. La recarga del servidor no ejecuta una importación al arrancar.

En **Cuenta Corriente**, el dueño conserva el panel Fintoc y su consulta manual por mes. El preview muestra la cuenta enmascarada y movimientos confirmados CLP. El estado diario y los pendientes se consultan en la base local, sin disparar nuevas peticiones bancarias.

La previsualización no se guarda en la base ni en la caché offline. No existe un botón público para aplicar o importar sus movimientos. El motor interno de Epic18 conserva referencias en tablas separadas y añade únicamente novedades inequívocas posteriores al corte. Coincidencias ambiguas, correcciones, reversiones y referencias eliminadas permanecen en revisión; nunca reescribe ni recrea silenciosamente un gasto existente.

La fecha de consulta y la fecha de actualización bancaria son distintas. Si la última fecha bancaria falta o es antigua, no presentar la cuenta como actualizada hoy. Leer la API puede devolver información previamente recogida por Fintoc.

## 5. Fallos y desconexión

- Si falta configuración o alguna bandera requerida, no hacer consultas externas. El requisito de gratuidad del alcance actual ya está resuelto.
- Ante autenticación vencida o solicitud de reconexión, el titular debe resolverla mediante el flujo oficial. No reintentar credenciales bancarias ni eludir MFA.
- Ante HTTP `402`, detener la evaluación y revisar las condiciones con Fintoc. No contratar, cambiar de plan ni activar pagos para resolverlo.
- Ante un lote incompleto, límite o error, no interpretar el resultado como una cartola completa ni importar un subconjunto.
- Para desactivar el conector, volver `FINTOC_ENABLED=false` y aplicar la recarga operativa. La revocación del acceso bancario se gestiona en Fintoc; desactivar nuestra aplicación no debe confundirse con revocar el vínculo del proveedor.

## 6. Transición desde Epic17 y estado del despliegue

**Histórico de Epic17:** la entrega original solo realizaba consultas manuales, sin cron ni persistencia. Antes de confirmar las condiciones se mantuvieron las banderas deshabilitadas; ese estado anterior y sus verificaciones se conservan en el [plan Epic17](fintoc-readonly-plan.md).

**Actualización Epic18:** el diseño y la implementación de conciliación, multiplicidad, bloqueos, rollback, estado diario y pendientes ya cuentan con pruebas. El despliegue productivo está próximo; no se declara aquí ejecutado. Su evidencia y resultado final corresponden al [contrato](fintoc-daily-sync-contract.md) y [plan Epic18](fintoc-daily-sync-plan.md), que sustituyen los criterios provisionales CSYNC para esta entrega.
