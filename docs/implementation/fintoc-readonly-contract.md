# Epic17 — Fintoc: consulta privada de cuenta propia

**Estado al 2026-11-01:** Epic17 fue implementado, verificado y desplegado el 2026-10-31. Posteriormente se completaron la vinculación Individual y la configuración privada, se confirmó la gratuidad publicada hasta cinco cuentas personales y se realizó la primera lectura live exitosa sin escrituras financieras. Epic18 tiene implementación y pruebas listas, con despliegue próximo. El [contrato FDS-01–14](fintoc-daily-sync-contract.md) y su [plan](fintoc-daily-sync-plan.md) amplían esta especificación; allí se registra el resultado final de activación diaria. Se conserva este contrato como evidencia previa al código de Epic17.

## Alcance y privacidad

La selección expresa de Fintoc autoriza construir esta integración externa de lectura. Se documenta como excepción acotada al principio DATA-001: al vincular su banco, el titular autorizará a Fintoc a procesar la información de esa cuenta. No se habilita otro proveedor, pagos, transferencias, escritura bancaria ni exportación de los gastos o clasificaciones de nuestra base. Ningún secreto bancario o del proveedor se solicita por chat.

Entrega original de Epic17: consultar movimientos confirmados de un mes en una previsualización separada, sin persistirlos. **Enmienda Epic18:** el preview mantiene ese comportamiento; el motor diario interno añade metadatos de conciliación y únicamente novedades inequívocas posteriores al corte, con categoría/notas NULL. El baseline no inserta historia; no se modifican gastos, clasificaciones ni saldos existentes. La programación de cuenta corriente es independiente de TC/N8N y no se declara desplegada en este documento.

## Contrato de aceptación

| ID | Comportamiento obligatorio |
|---|---|
| FRO-01 | Sin configuración, el panel muestra que la conexión está pendiente; nunca se anuncia conectado ni se hacen peticiones a Fintoc. |
| FRO-02 | Configuración privada del servidor: FINTOC_ENABLED, FINTOC_PERSONAL_FREE_ACCESS_CONFIRMED, FINTOC_MODE (test/live), FINTOC_OWNER_USER_ID, FINTOC_SECRET_KEY, FINTOC_LINK_TOKEN y FINTOC_ACCOUNT_ID. Ninguna variable secreta usa REACT_APP_. Ambas banderas deben ser true para hacer tráfico externo. Los sufijos de la clave secreta y de Link Token admiten caracteres URL-safe alfanuméricos, guion y guion bajo, conservando validación estricta del prefijo sk y modo, del ID de Link y de la longitud máxima. Una clave pk pública nunca se acepta como secreta. |
| FRO-03 | Todas las rutas exigen autenticación, espacio propio y coincidencia del actor con el dueño configurado. Un miembro, otro dueño o un header de espacio ajeno nunca recibe datos de la conexión. |
| FRO-04 | Solo GET contra api.fintoc.com/v1, versión fijada 2026-02-01, sin redirects, retries, refrescos de pago, widget ni endpoints de escritura. Recupera el Link propio mediante token privado y comprueba institución cl_banco_de_chile, país cl, titular individual, modo y conexión activa. |
| FRO-05 | Solo la cuenta configurada, checking_account CLP y no removida. IDs externos solo del proveedor y configuración, nunca elegibles desde el cliente. Los secretos no aparecen en respuestas, errores, logs ni almacenamiento del navegador. |
| FRO-06 | El preview mantiene período year/month estricto, since/until inclusivos por post_date y confirmed_only=true. Importes CLP enteros seguros, dirección por signo, texto y fecha válidos. Exige status y pending booleano: faltantes fallan; cualquier estado no confirmado o pending=true se excluye del preview. Epic18 añade readSnapshot interno con confirmed_only=false para observar estados y detectar discrepancias, bajo FDS-03/08. No confundir post_date con transaction_date. |
| FRO-07 | Paginación completa y acotada: máximo 10 páginas de hasta 300 registros, tiempo total limitado, sin seguir URLs externas ni entregar lotes parciales como completos. IDs repetidos y payloads inválidos fallan de forma segura. |
| FRO-08 | Diferencia queriedAt de bankUpdatedAt; null o fecha antigua se muestran como tal. Consultar la API no se presenta como un refresco bancario nuevo ni como cumplimiento diario. |
| FRO-09 | **Original Epic17:** ninguna dependencia ejecutaba escrituras ni persistía movimientos. **Enmienda Epic18:** los endpoints públicos de preview siguen siendo de solo lectura y sin caché; el motor interno puede escribir metadatos aditivos e INSERT de novedades inequívocas según FDS-04–10. Prohibidos UPDATE/DELETE financieros, cambios de saldo y cualquier modificación de registros o clasificaciones preexistentes. |
| FRO-10 | Errores de configuración, autenticación upstream, sesión bancaria, límites, timeout o lotes incompletos se muestran con códigos y mensajes seguros, sin detalles crudos del proveedor. |
| FRO-11 | Vista móvil vertical accesible y compatible con Claro/Oscuro; el preview solo consulta por acción explícita. Limpia y aborta ante cambio de usuario, espacio o período. No muestra datos de prueba como movimientos reales. Estado diario y pendientes de Epic18 consultan exclusivamente la base local. |
| FRO-12 | Namespace Fintoc NetworkOnly en PWA y Cache-Control:no-store en todas las respuestas; no reutiliza IndexedDB/readCache ni comparte respuestas entre sesiones. |

## API propia

Namespace independiente `/api/checking/fintoc`, montado antes del router de Checking. `GET /status` consulta únicamente configuración local. Campo `state`: `disabled`, `configuration_required`, `access_unconfirmed`, `ready`. Campo `mode`: `test`, `live` o null; campos `provider: fintoc`, `readOnly: true`, `writesEnabled: false`, `message`. Sin secretos ni IDs de configuración. Si hay dueño configurado y el actor difiere: 403. Un dueño sin configuración puede ver el estado pendiente.

`GET /preview?year=2026&month=10`: exige estado ready y dueño configurado. Respuesta:

```json
{
  "provider": "fintoc", "mode": "test", "readOnly": true, "imported": false,
  "period": {"year": 2026, "month": 10, "since": "2026-10-01", "until": "2026-10-31"},
  "account": {"name": "Cuenta corriente", "currency": "CLP", "numberLast4": "1234"},
  "queriedAt": "2026-10-31T20:00:00.000Z", "bankUpdatedAt": null,
  "items": [{"externalId": "mov_example", "date": "2026-10-03", "description": "Ejemplo ficticio", "type": "cargo", "amount": "12500", "status": "confirmed"}],
  "total": 1, "coverage": {"complete": true, "excludedNonConfirmed": 0}
}
```

No devuelve saldo para no reemplazar o confundir el de la web. Métodos diferentes de GET no ejecutan acciones. Parámetros desconocidos o fechas inválidas:400. No habilitado:503 con código FINTOC_NOT_READY; permisos:401/403; errores upstream: código estable seguro y HTTP apropiado (429,502,503,504). Nunca devuelve e.message, response.data o config de Axios.

Epic18 añade `GET /daily-status` y `GET /review` en el mismo namespace, con iguales permisos y no-store, sin activar la sincronización desde HTTP. Sus respuestas y programación interna se especifican en el [contrato diario](fintoc-daily-sync-contract.md). `writesEnabled:false` de `/status` describe la API pública de consulta y no es el estado del motor interno; para este último se usa `/daily-status`.

## SDD/TDD y activación

Primero pruebas RED de servicio, rutas, vista y política de caché; después implementación y regresiones aisladas. Jest con transporte ficticio y Express loopback; Playwright frontend estático con API simulada y bloqueo de tráfico externo/escrituras. Prohibido ejecutar helpers API que cargan .env y borran datos. No se utiliza la base existente en tests.

La [guía de activación](fintoc-readonly-activation.md) conserva el flujo oficial de cuenta propia desde Dashboard Fintoc y secretos solo en el .env privado del servidor. **Histórico:** Epic17 se desplegó inicialmente deshabilitado y no creó la cuenta ni programó consultas. **Actualización:** el titular completó el alta y la autorización; los términos canónicos de Chile, 2.3 y QUINTO(a), confirmaron gratuidad hasta cinco cuentas personales para el alcance actual y la lectura live fue exitosa. No queda pendiente una confirmación escrita adicional para habilitar esas lecturas. Epic18 consulta diariamente lo disponible, registra la fecha bancaria y no promete SLA de refresco ni autoriza servicios pagados, Refresh Intents o pagos.

Fuentes oficiales verificadas: [cuenta propia y Link Token](https://docs.fintoc.com/guides/movements/integration-with-exchange-token), [Link](https://docs.fintoc.com/api/movements-api/links/links-get), [movimientos](https://docs.fintoc.com/api/movements-api/movements/movements-list), [paginación](https://docs.fintoc.com/api/fintoc-api/pagination), [versión y autenticación](https://docs.fintoc.com/api/fintoc-api/authentication), [términos canónicos de Chile, selector Para desarrolladores](https://www.fintoc.com/cl/legal/terminos). La [investigación](../proposals/checking-daily-sync.md) conserva los antecedentes y la resolución posterior. La cobertura de esta entrega es cuenta corriente CLP; el detalle de compras de tarjeta no está documentado para Banco de Chile en la [cobertura oficial](https://docs.fintoc.com/guides/movements/overview-data-aggregation/products-and-institutions-movements).
