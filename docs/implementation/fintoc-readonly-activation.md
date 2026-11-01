# Activación privada de Fintoc — cuenta propia

**Estado inicial:** pendiente. El titular todavía no tiene cuenta de desarrollador de Fintoc. El código preparado no acredita acceso productivo ni una conexión bancaria real. Contrato: [FRO-01–12](fintoc-readonly-contract.md).

Esta entrega permite **consultar movimientos confirmados y verlos por separado**. No importa movimientos a la base, cambia clasificaciones, modifica el saldo de la web ni programa consultas. Tampoco envía los gastos existentes a Fintoc.

## 1. Confirmar habilitación y costo antes de conectar

La [investigación](../proposals/checking-daily-sync.md) registra una contradicción entre los términos gratuitos para desarrolladores y los requisitos de alta empresarial. Antes de habilitar tráfico, obtener confirmación escrita de Fintoc para **persona natural, aplicación privada, cuenta propia Banco de Chile y costo cero**, incluyendo consultas, duración de la modalidad gratuita y frecuencia de actualización bancaria disponible. No aceptar un plan pagado o una prueba que continúe con cobro.

El alta y la autorización de la cuenta corresponden al titular. Esta guía no crea una cuenta, acepta condiciones ni permite eludir una restricción de Fintoc. Si el proveedor no habilita `live` para este caso, el conector queda pendiente aunque el desarrollo esté probado.

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
FINTOC_MODE=test
FINTOC_OWNER_USER_ID=
FINTOC_SECRET_KEY=
FINTOC_LINK_TOKEN=
FINTOC_ACCOUNT_ID=
```

| Variable | Configuración privada |
|---|---|
| `FINTOC_ENABLED` | Permanece `false` hasta terminar las validaciones. |
| `FINTOC_PERSONAL_FREE_ACCESS_CONFIRMED` | Solo cambia a `true` cuando esté confirmado el acceso personal gratuito; no representa permiso para contratar o pagar. |
| `FINTOC_MODE` | `test` para datos de prueba o `live` para acceso real habilitado. Debe coincidir con la clave y el vínculo utilizados. |
| `FINTOC_OWNER_USER_ID` | UUID del usuario dueño ya existente en nuestra web. El administrador lo identifica de manera privada mediante consulta de solo lectura; no crea otro usuario ni toma el ID de un invitado. |
| `FINTOC_SECRET_KEY` | Clave secreta del ambiente correspondiente en Fintoc. Solo permanece en el servidor. |
| `FINTOC_LINK_TOKEN` | Token completo del vínculo propio, obtenido del Dashboard y conservado de manera privada. |
| `FINTOC_ACCOUNT_ID` | ID de la cuenta corriente CLP dentro de `accounts` del vínculo. El administrador lo verifica desde el servidor con las herramientas autorizadas, sin exponer token, clave o respuesta bancaria completa. No es el número de cuenta. |

El conector comprueba Banco de Chile (`cl_banco_de_chile`), país Chile, titular individual, vínculo activo y cuenta corriente CLP no removida. El usuario de la web no puede sustituir esos identificadores en una petición. Los miembros de espacios compartidos y otros dueños no pueden consultar esta conexión.

Las pruebas automatizadas usan transporte ficticio y no necesitan credenciales reales ni una conexión al banco. Un resultado en modo `test` debe permanecer identificado como prueba.

## 4. Primera consulta

Después de completar y revisar la configuración, habilitar las dos banderas y aplicar el procedimiento operativo de recarga del backend del proyecto. No ejecutar migraciones ni procesos de importación.

En **Cuenta Corriente**, el dueño verá el panel Fintoc. Un estado preparado solo acredita la configuración local; la primera consulta debe confirmar que el proveedor permite realmente leer la cuenta. Elegir un mes y usar **Consultar movimientos con Fintoc**. Verificar identidad de la cuenta enmascarada, moneda CLP, fechas, cargos y abonos frente a una cartola conocida.

La previsualización no se guarda en la base ni en la caché offline. No existe en esta entrega un botón para aplicar o importar esos movimientos. El saldo e historial registrados previamente siguen siendo la referencia de la web.

La fecha de consulta y la fecha de actualización bancaria son distintas. Si la última fecha bancaria falta o es antigua, no presentar la cuenta como actualizada hoy. Leer la API puede devolver información previamente recogida por Fintoc.

## 5. Fallos y desconexión

- Si falta configuración o confirmación de gratuidad, conservar la conexión pendiente y no hacer consultas externas.
- Ante autenticación vencida o solicitud de reconexión, el titular debe resolverla mediante el flujo oficial. No reintentar credenciales bancarias ni eludir MFA.
- Ante HTTP `402`, detener la evaluación y revisar las condiciones con Fintoc. No contratar, cambiar de plan ni activar pagos para resolverlo.
- Ante un lote incompleto, límite o error, no interpretar el resultado como una cartola completa ni importar un subconjunto.
- Para desactivar el conector, volver `FINTOC_ENABLED=false` y aplicar la recarga operativa. La revocación del acceso bancario se gestiona en Fintoc; desactivar nuestra aplicación no debe confundirse con revocar el vínculo del proveedor.

## 6. Qué falta para sincronización diaria

Esta entrega realiza consultas manuales de solo lectura. No incorpora cron, refrescos bajo demanda ni inserciones automáticas. La frecuencia real del banco debe estar confirmada por Fintoc para la modalidad habilitada.

Antes de una sincronización diaria se requiere el diseño CSYNC: conciliación inicial contra lo ya importado, identidad externa estable, tratamiento de ambigüedades, fechas y saldo, reintentos y actualización bancaria verificable. Ningún paso debe sobrescribir los gastos o clasificaciones históricos. Ver [propuesta de sincronización](../proposals/checking-daily-sync.md).
