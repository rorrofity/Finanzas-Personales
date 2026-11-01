# Epic17 — Fintoc: consulta privada de cuenta propia

**Estado:** conector implementado, verificado y desplegado el 2026-10-31; conexión bancaria pendiente y deshabilitada. La especificación se escribió antes del código. Solicitud del 2026-10-31: construir la conexión Fintoc para obtener movimientos de la cuenta personal Banco de Chile. El titular confirmó que todavía no tiene cuenta Fintoc. La conexión real depende de alta, autorización del titular, credenciales y habilitación del proveedor. Se mantiene costo cero.

## Alcance y privacidad

La selección expresa de Fintoc autoriza construir esta integración externa de lectura. Se documenta como excepción acotada al principio DATA-001: al vincular su banco, el titular autorizará a Fintoc a procesar la información de esa cuenta. No se habilita otro proveedor, pagos, transferencias, escritura bancaria ni exportación de los gastos o clasificaciones de nuestra base. Ningún secreto bancario o del proveedor se solicita por chat.

Entrega: consultar movimientos confirmados de un mes, en una previsualización separada. No importa, concilia ni modifica registros, saldos o categorías. No crea tablas ni modifica scheduler. La sincronización diaria con inserción de novedades requiere la conciliación inicial CSYNC, por lo que no se anuncia como activa con esta entrega.

## Contrato de aceptación

| ID | Comportamiento obligatorio |
|---|---|
| FRO-01 | Sin configuración, el panel muestra que la conexión está pendiente; nunca se anuncia conectado ni se hacen peticiones a Fintoc. |
| FRO-02 | Configuración privada del servidor: FINTOC_ENABLED, FINTOC_PERSONAL_FREE_ACCESS_CONFIRMED, FINTOC_MODE (test/live), FINTOC_OWNER_USER_ID, FINTOC_SECRET_KEY, FINTOC_LINK_TOKEN y FINTOC_ACCOUNT_ID. Ninguna variable secreta usa REACT_APP_. Ambas banderas deben ser true para hacer tráfico externo. |
| FRO-03 | Todas las rutas exigen autenticación, espacio propio y coincidencia del actor con el dueño configurado. Un miembro, otro dueño o un header de espacio ajeno nunca recibe datos de la conexión. |
| FRO-04 | Solo GET contra api.fintoc.com/v1, versión fijada 2026-02-01, sin redirects, retries, refrescos de pago, widget ni endpoints de escritura. Recupera el Link propio mediante token privado y comprueba institución cl_banco_de_chile, país cl, titular individual, modo y conexión activa. |
| FRO-05 | Solo la cuenta configurada, checking_account CLP y no removida. IDs externos solo del proveedor y configuración, nunca elegibles desde el cliente. Los secretos no aparecen en respuestas, errores, logs ni almacenamiento del navegador. |
| FRO-06 | Período year/month validado estrictamente; consulta since/until inclusivos por post_date, confirmed_only=true. Importes CLP enteros seguros, dirección por signo, texto y fecha válidos. El contrato fijado exige status y pending booleano: faltantes fallan; cualquier estado no confirmado o pending=true se excluye. No confundir post_date con transaction_date. |
| FRO-07 | Paginación completa y acotada: máximo 10 páginas de hasta 300 registros, tiempo total limitado, sin seguir URLs externas ni entregar lotes parciales como completos. IDs repetidos y payloads inválidos fallan de forma segura. |
| FRO-08 | Diferencia queriedAt de bankUpdatedAt; null o fecha antigua se muestran como tal. Consultar la API no se presenta como un refresco bancario nuevo ni como cumplimiento diario. |
| FRO-09 | Ninguna dependencia del conector ejecuta INSERT/UPDATE/DELETE ni llama al importador o modelo Checking. No hay migración, persistencia de movimientos, caché del preview, escritura de saldo ni cambio de clasificaciones. |
| FRO-10 | Errores de configuración, autenticación upstream, sesión bancaria, límites, timeout o lotes incompletos se muestran con códigos y mensajes seguros, sin detalles crudos del proveedor. |
| FRO-11 | Vista móvil vertical accesible y compatible con Claro/Oscuro; solo consulta por acción explícita. Limpia y aborta ante cambio de usuario, espacio o período. No muestra datos de prueba como movimientos reales. |
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

## SDD/TDD y activación

Primero pruebas RED de servicio, rutas, vista y política de caché; después implementación y regresiones aisladas. Jest con transporte ficticio y Express loopback; Playwright frontend estático con API simulada y bloqueo de tráfico externo/escrituras. Prohibido ejecutar helpers API que cargan .env y borran datos. No se utiliza la base existente en tests.

La guía de activación debe usar el flujo oficial de cuenta propia desde Dashboard Fintoc. Credenciales solo en .env privado del servidor, inicialmente deshabilitado. Modo test permanece identificado; live requiere acceso autorizado y confirmación de gratuidad para persona natural y frecuencia disponible. Esta entrega no registra una cuenta Fintoc, acepta contratos, conecta el banco ni establece una programación.

Fuentes oficiales verificadas: [cuenta propia y Link Token](https://docs.fintoc.com/guides/movements/integration-with-exchange-token), [Link](https://docs.fintoc.com/api/movements-api/links/links-get), [movimientos](https://docs.fintoc.com/api/movements-api/movements/movements-list), [paginación](https://docs.fintoc.com/api/fintoc-api/pagination), [versión y autenticación](https://docs.fintoc.com/api/fintoc-api/authentication). Elegibilidad pendiente en [investigación](../proposals/checking-daily-sync.md).
