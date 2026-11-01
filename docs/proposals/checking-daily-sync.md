# Propuesta — sincronización diaria de cuenta corriente

**Estado al 2026-11-01:** investigación inicial conservada como antecedente. El titular ya vinculó Banco de Chile Individual en live; gratuidad publicada hasta cinco cuentas personales confirmada y primera lectura real exitosa sin escrituras financieras. Epic18 tiene implementación y pruebas listas, con despliegue próximo. La especificación vigente es el [contrato FDS-01–14](../implementation/fintoc-daily-sync-contract.md) y el resultado de activación se registra en su [plan y evidencia](../implementation/fintoc-daily-sync-plan.md).

**Consulta inicial:** 2026-10-31, America/Santiago. **Identificadores históricos:** `CSYNC-*`, provisionales; Epic18 los concreta mediante `FDS-*`, sin cambiar Epic14 o Epic15.

**Antecedente histórico de vinculación:** el titular pudo abrir Conexiones live, elegir Bancaria / Individual y vincular personalmente Banco de Chile. En esa etapa el Dashboard mostraba el Link activo con actualización inicial en curso y la aplicación permanecía deshabilitada, pendiente de verificar costo y lectura. La configuración quedó privada en el servidor. Esa incertidumbre se resolvió posteriormente mediante los términos canónicos y la primera lectura exitosa, según la actualización final de este documento. No se publican IDs, tokens, claves, respuestas ni datos bancarios.

**Lectura de los antecedentes:** las secciones 1–9 describen la investigación y alternativas originales. Sus condiciones pendientes y propuestas de frecuencia no constituyen instrucciones actuales de activación; prevalecen la resolución final y el contrato Epic18 enlazado arriba.

## 1. Necesidad y condiciones confirmadas

La cuenta es **personal de Banco de Chile**. Hoy su cartola se descarga y se importa manualmente; ese flujo funciona y debe conservarse. El usuario no recibe por correo cartolas ni avisos de cargos/abonos. Aceptaría evaluar un proveedor externo si es factible, seguro y **sin costo adicional**. La solución debe permitir alta y uso directamente como **persona natural, sin exigir una empresa**. Esto expresa el requisito elegido, sin afirmar si el usuario dispone de una empresa.

Objetivo: incorporar cargos, abonos y saldo con una actualización bancaria comprobable al menos una vez al día, sin tener que descargar y cargar el archivo manualmente. No modificar gastos, clasificaciones ni información bancaria histórica existente.

**Conclusión histórica tras la segunda revisión, posteriormente resuelta para Fintoc:** había conectores para Banco de Chile Personas, pero todavía no se había acreditado habilitación gratuita de producción para este titular. Se propuso aclarar la discrepancia entre términos gratuitos y requisitos empresariales. Banco de Chile ofrecía una API cuyo circuito público era empresarial y contemplaba tarifas contractuales. La vinculación live, la lectura exitosa y la verificación canónica posterior resolvieron la vía Fintoc para este proyecto; la alternativa API directa del banco no quedó habilitada. La frecuencia de refresco bancario no constituye una garantía diaria ante MFA.

## 2. Tres alternativas evaluadas — histórico

| Alternativa | Encaje con este caso | Costo y automatización | Recomendación |
|---|---|---|---|
| **A. Fuente bancaria mediante API de lectura** | El banco publica una API de consultas. Falta confirmar expresamente alta y uso productivo para una persona natural. Los agregadores revisados no aportan una opción gratuita personal habilitable confirmada | Una API puede permitir consulta diaria sin entrar al portal cada vez. No se verificó acceso de producción gratuito para este caso | Priorizar una consulta de disponibilidad al banco para esta cuenta personal, sin contratar ni conectar en esta entrega. Avanzar solo si se acredita acceso personal y costo cero |
| **B. Cartola o avisos enviados por el banco** | Hoy no existe ese correo como fuente. Se puede consultar al banco si ofrece envío automático con frecuencia suficiente | Sin una cartola o fuente completa diaria, n8n no puede obtener movimientos que nunca recibe. Avisos aislados no demuestran saldo ni cobertura completa | No proponerlo como solución lista. Si el banco habilita una fuente completa, automatizar su ingesta puede reutilizar parte del flujo actual |
| **C. Descarga asistida desde navegador del dispositivo propio y envío al servidor** | Reutiliza el Excel que ya se sabe importar. El usuario autentica su sesión bancaria y atiende MFA cuando se solicite | Sin cuota de proveedor, usando dispositivo e infraestructura existentes; requiere mantenimiento y disponibilidad del dispositivo. La caducidad de sesión, MFA, CAPTCHA o cambios del portal pueden impedir la ejecución desatendida | Alternativa exploratoria si no hay API personal gratuita habilitable. Un piloto debe demostrar descarga de solo lectura y reconocer cuándo requiere intervención; no prometer funcionamiento autónomo diario |

Un horario diario no es una fuente de datos: es necesario resolver primero cómo obtener información bancaria completa y autorizada. Tampoco basta consultar diariamente la caché de un proveedor para afirmar que ese día se obtuvo información nueva del banco.

## 3. Hallazgos iniciales de proveedores y costo — histórico

### Fintoc: soporte de cuenta personal y alta de desarrollador son cosas distintas

Su documentación de instituciones incluye **Banco de Chile Personas**, cuentas corrientes/vista y CLP/USD. El producto Connections describe actualizaciones varias veces al día y reconexión cuando la conexión queda desactualizada. Esto hace que el objetivo técnico sea plausible, sujeto al plan y a la disponibilidad bancaria. [Instituciones soportadas](https://docs.fintoc.com/guides/movements/overview-data-aggregation/products-and-institutions-movements), [Connections](https://www.fintoc.com/cl/producto/connections).

Los términos actuales para desarrolladores publican, en la cláusula **2.3**, acceso gratuito hasta cinco cuentas bancarias de personas naturales; la obligación 5(a) lo reafirma. Se verificó en la URL canónica seleccionando **«Para desarrolladores → Términos y condiciones»**; el contenido inicial visible es de Payments y no contiene esa sección. El documento reconoce desarrolladores naturales o jurídicos. [Términos de Chile](https://www.fintoc.com/cl/legal/terminos).

Sin embargo, las guías actuales de Movements exigen para producción RUT de empresa, cuenta bancaria de la empresa, correo corporativo y al menos seis meses de actividad; excluyen expresamente el alta de personas naturales, incluso con giro, y señalan que aplica a todos los productos. El quickstart distingue la prueba de la habilitación live. **Soportar una cuenta bancaria personal no equivale a admitir como desarrollador a su titular persona natural.** [Requisitos actuales y frecuencia según plan](https://docs.fintoc.com/guides/movements/overview-data-aggregation), [Quickstart y modo live](https://docs.fintoc.com/guides/movements/overview-data-aggregation/quickstart).

**Evaluación histórica:** estas guías motivaron proponer una aclaración de elegibilidad; no demostraban que la cláusula gratuita hubiera desaparecido o fuera exclusiva de clientes antiguos. **Resolución posterior para este titular:** la vinculación Individual live y la lectura real fueron exitosas, y la verificación de 2.3 y QUINTO(a) en la canónica confirmó la gratuidad para hasta cinco cuentas personales. La aclaración escrita dejó de ser un requisito pendiente para este acceso. Se consulta lo disponible; no se promete refresco diario del banco ni se fuerza uno pagado.

El flujo documentado usa Widget y tokens; nuestra aplicación no necesita almacenar la contraseña bancaria, pero el proveedor sí interviene en la conexión y procesa información financiera. No equivale a afirmar que los datos permanecen exclusivamente en el servidor personal. [Flujo de integración](https://docs.fintoc.com/guides/movements/integration-with-exchange-token).

### Banco de Chile: API oficial publicada, habilitación personal no confirmada

APIStore publica **Consultas → MovimientosySaldos**, con operaciones para obtener movimientos, resumen y período. Su descripción se orienta a software de gestión empresarial. No se pudo verificar una oferta contractual de producción para esta cuenta personal con costo cero. El registro gratuito en el portal y los límites del sandbox no prueban gratuidad o acceso productivo. Confirmar elegibilidad, autenticación, disponibilidad y tarifa directamente con el banco sería un paso de evaluación, sin contratar ni enviar credenciales en esta entrega. [Portal oficial](https://apistore.bancochile.cl/banco-chile/sandbox/), [Consultas](https://apistore.bancochile.cl/banco-chile/sandbox/product/883).

**Segunda revisión del sitio comercial oficial:** el centro de ayuda indica contratación mediante ejecutivo cash, tarifas pactadas con cobro fijo mensual o por volumen y un límite de 5.000 consultas por cliente al mes. Describe acceso a información equivalente a la cartola en línea, habilitación aproximada de cuatro semanas, token de una hora y certificado firmado por una CA. Las facultades exigidas incluyen una referencia explícita a Canales Remotos Empresa. Se leyó el contenido dinámico en navegador, sin enviar formularios. [Centro de ayuda API Store](https://sitiospublicos.bancochile.cl/api-store/help-center).

El formulario de contratación pide **Nombre Empresa y RUT Empresa**. Es evidencia de un proceso empresarial, no una prohibición legal expresa de cualquier excepción individual. No aparece un alta productiva de autoservicio para el titular de una cuenta de Personas. [Formulario oficial](https://sitiospublicos.bancochile.cl/api-store/start-integration), [producto Saldos y movimientos](https://sitiospublicos.bancochile.cl/api-store/saldos-y-movimientos).

### Otros conectores revisados

- **Khipu:** documenta endpoints Banco de Chile Personas y un catálogo de instituciones para su flujo OAuth. Se verificó capacidad documentada, no una tarifa cero para un consumidor live personal; los términos de pagos no se extrapolan al precio de Open Finance. [Accounts Banco de Chile Personas](https://docs.khipu.com/en/apis/v1/cl/banking/personal/bancochile.cl/openapi/other/productsaccounts), [instituciones OAuth](https://docs.khipu.com/data-solutions/open-finance/oauth-institutions-list).
- **CBank:** publica espacios personales y catálogo Banco de Chile Personas, pero su web informa **$19.990 CLP + IVA**, sin confirmar aquí periodicidad o condiciones particulares. Además declara que las conexiones reales son experimentales y no están certificadas para producción. No cumple la condición de costo cero para recomendarlo como solución de esta entrega. [Producto y precio](https://cbank.cl/), [documentación](https://cbank.cl/documentacion).

**Resultado histórico de la comparación:** en la investigación inicial aún no se había acreditado la opción personal gratuita. La evidencia posterior sí permitió elegir Fintoc dentro del límite publicado; no implica una promesa de gratuidad permanente ante cambios futuros de condiciones ni habilita servicios adicionales.

## 4. Sistema de Finanzas Abiertas: calendario relevante

No debe suponerse que en 2026 ya exista una API bancaria obligatoria universal lista para una app personal. La CMF modificó la NCG 514 mediante **NCG 569, de 1 de junio de 2026**, y pospuso la entrada en vigor del sistema hasta julio de 2027, con implementación gradual. El sandbox ATENA se lanzó el 30 de septiembre de 2026 para pruebas previas. Esto es contexto de disponibilidad; no constituye una conexión bancaria ni garantiza gratuidad futura. [Comunicado CMF de modificación](https://www.cmfchile.cl/portal/prensa/625/w4-article-110881.html), [NCG 569](https://www.cmfchile.cl/portal/normativa/624/w4-article-111273.html), [lanzamiento ATENA](https://www.cmfchile.cl/portal/prensa/625/w4-article-113897.html).

### Acceso a los datos propios y API diaria

Al 2026-10-31, el artículo 12 de la Ley 19.628 reconoce el derecho a solicitar información sobre los datos personales y su tratamiento. Banco de Chile reconoce ese acceso en su política y establece el canal Derechos ARCO; publica `protecciondatos@bancochile.cl` como contacto de protección de datos. La política no entrega un enlace accionable al formulario ARCO, por lo que no se inventa una dirección. [Ley vigente hasta el 2026-11-30](https://www.bcn.cl/leychile/Navegar/imprimir?idNorma=141599&idParte=), [política del banco](https://sitiospublicos.bancochile.cl/personas/politica-de-privacidad).

**Interpretación para este proyecto:** ser titular y tener derecho de acceso no acredita por sí solo un derecho actual a credenciales de API gratuitas, permanentes y con consultas diarias. Una solicitud de datos y una conexión recurrente tienen alcances distintos.

La reforma de la Ley 21.719 entra en vigor el **2026-12-01**. Su artículo 9 incorpora portabilidad bajo condiciones: tratamiento automatizado y basado en consentimiento, con transmisión directa cuando sea técnicamente posible. No permite prometer que toda cartola contractual quedará automáticamente cubierta ni una API bancaria diaria gratuita. El SFA tiene su propio calendario gradual; julio de 2027 no es una fecha garantizada de acceso a esta cuenta personal. [Ley 21.719, artículo 9 y transitorio primero](https://www.bcn.cl/leychile/navegar?i=1209272), [fecha oficial de vigencia](https://www.consejotransparencia.cl/datos-personales/).

## 5. Encaje con el proyecto al investigar — histórico

- `backend/controllers/checkingController.js#importFile` ya parsea fecha, descripción, cargo/abono y saldo desde Excel. Su importación llama `Checking.bulkImport` y después actualiza el saldo conocido. Reutilizar el formato de entrada es viable; invocar el importador actual sin validación no equivale a una sincronización bancaria robusta.
- `Checking.bulkImport` omite coincidencias por fecha/monto/tipo/descripción normalizada. No persiste un identificador externo por movimiento ni maneja vinculación de fuentes o correcciones. Repeticiones legítimas idénticas y datos ya importados necesitan tratarse con multiplicidad y procedencia, no con una nueva deduplicación por parecido.
- El scheduler existente programa TC mediante n8n a las 13:00 y 22:00, America/Santiago. `runSync` llama al webhook y registra resultados. Se puede reutilizar su patrón de orquestación y notificación, conservando flujos y permisos actuales; cuenta corriente requiere una fuente y ejecución independientes.
- El saldo actual combina un saldo conocido con movimientos posteriores a su fecha. Un nuevo conector necesita definir la fecha/hora real del saldo y el alcance de la consulta, para evitar sumar de nuevo movimientos que ese saldo ya incluye.
- La [constitución](../constitution.md) exigía una excepción expresa para el procesamiento bancario por un agregador. La elección de Fintoc, vinculación autorizada por el titular y alcance de privacidad quedaron documentados posteriormente en [Epic17](../implementation/fintoc-readonly-contract.md), con ampliación acotada de persistencia en Epic18. No se exportan los gastos o clasificaciones de nuestra base al proveedor.

## 6. Flujo propuesto antes de elegir y habilitar fuente — histórico

```text
Fuente autorizada de lectura
  → obtención de movimientos y saldo con fecha real
  → normalización en servidor: cuenta, moneda, cargo/abono, fecha y referencia
  → validación de páginas, cobertura y estado del refresco bancario
  → identificación estable por proveedor + conexión + cuenta + movimiento
  → vincular referencias ya verificadas, sin modificar el registro financiero
  → insertar solo movimientos nuevos inequívocos, sin categoría automática
  → guardar cursor, fecha de obtención, fecha bancaria y bitácora
  → actualizar la consulta web y avisar solo si hay novedades o intervención
```

La primera conexión debe realizar una **previsualización de conciliación contra la cartola ya cargada**. Los movimientos históricos actuales no tienen ID del proveedor: no se puede prometer que el primer lote sea idempotente solo porque el proveedor sí entregue IDs. Las coincidencias ambiguas se revisan; no se duplican ni se descartan silenciosamente. Las referencias se guardan en metadatos separados, preservando IDs, categorías, notas y montos de los registros financieros existentes. No se activa la conciliación pendiente de Epic14 como efecto secundario.

Después del corte inicial, usar cursor/paginación y ventana solapada configurable para llegadas tardías, con unicidad del ID externo y un bloqueo por conexión que evite carreras entre ejecución manual y diaria. Los reintentos no deben duplicar inserciones. El cursor solo avanza al completar todas las páginas y confirmar la operación.

Cargar movimientos confirmados. Si un proveedor cambia monto/estado o revierte un movimiento previamente registrado, conservar el registro y su clasificación y mostrar una discrepancia; no reescribir ni borrar automáticamente el gasto. Fintoc documenta estados `confirmed`, `pending` y `reversed`; no confundir pendiente con gasto asentado. [Estados de movimientos](https://docs.fintoc.com/changelog/status-de-los-movimientos).

Una futura programación podría consultar, por ejemplo, a las 07:00 y 19:00 America/Santiago, con reintentos limitados. Es una elección técnica propuesta, **no una programación creada**. La UI mostraría última consulta, última actualización bancaria confirmada, rango cubierto y estados «Al día», «Sin actualizar» o «Requiere reconectar». Un fallo de MFA o de banco requiere intervención visible, no saltarse una protección ni renovar indefinidamente intentos de acceso.

Al elegir proveedor se debe fijar un único producto y versión de API, con su contrato de refresco documentado. No mezclar endpoints, frecuencias ni estados de Movements y Connections porque aparezcan en documentación comercial de la misma empresa.

## 7. Requisitos SDD provisionales — histórico

| ID | Criterio de aceptación propuesto |
|---|---|
| CSYNC-01 | Cuando se habilite una fuente, el dueño debe conocer proveedor, costo confirmado, alcance de lectura, información compartida y forma de desconexión. No habilitar pagos ni transferencias. |
| CSYNC-02 | Mientras rigen los requisitos de persona natural y costo cero, ningún proceso debe exigir alta o cuenta empresarial, contratar un plan de pago ni agotar una prueba y continuar con cobro. |
| CSYNC-03 | Si el proveedor procesa información bancaria fuera del servidor, debe explicitarse y aprobarse la excepción al principio de privacidad antes de conectar; esta propuesta no modifica la constitución. |
| CSYNC-04 | Cuando se consulte diariamente, debe distinguirse consultar datos almacenados de completar un refresco de información en el banco; registrar las dos fechas. |
| CSYNC-05 | Cuando llegue un movimiento nuevo confirmado, debe importarse a la cuenta y moneda correctas con identidad externa estable e idempotencia; no modificar categorías existentes. |
| CSYNC-06 | Si el movimiento coincide potencialmente con una cartola ya cargada o existen varias coincidencias, debe preservarse la multiplicidad y solicitar conciliación; no deduplicar solo por fecha/monto/descripción. |
| CSYNC-07 | Si una ejecución falla o se repite, no debe duplicar movimientos, avanzar el cursor incompleto ni anunciar la cuenta como actualizada. |
| CSYNC-08 | Cuando el banco exija MFA, CAPTCHA o una renovación de sesión, debe detenerse la ejecución automática y mostrarse una acción del titular; no evadir la protección. |
| CSYNC-09 | Cuando se actualice el saldo, deben conservarse procedencia y fecha/hora bancaria y evitar contabilizar otra vez los movimientos incluidos en ese saldo. |
| CSYNC-10 | Mientras opere la sincronización, debe respetar espacio/propietario y permisos, cifrar secretos del conector, ocultarlos de logs y permitir detenerla sin alterar gastos históricos. |
| CSYNC-11 | Si una fuente no demuestra cobertura completa, debe indicarse su limitación; no presentar avisos de correo o consultas fallidas como una cartola completa. |
| CSYNC-12 | Si el proveedor corrige o revierte un movimiento existente, debe registrarse la discrepancia para revisión sin sobrescribir monto, fecha, notas o clasificación financiera. |
| CSYNC-13 | Si transcurren 24 horas sin actualización bancaria confirmada, debe mostrarse que no se cumplió la frecuencia diaria, aunque las consultas al proveedor hayan respondido correctamente. |

El conector necesita persistencia de identidad/cursor/ejecuciones que hoy no existe para CC. Su esquema y cualquier migración se especificarían y revisarían antes de implementarse. No se ha creado esa persistencia ni se ha ejecutado DDL/DML en esta investigación.

## 8. TDD y piloto de aceptación propuestos — histórico

1. **RED:** fixtures sintéticos de proveedor/cuenta/moneda, paginación, dos movimientos legítimos idénticos, reenvío del mismo ID, llegada tardía, referencia bancaria corregida y lotes parciales. Probar que categorías/notas/montos de registros previos permanecen idénticos.
2. **GREEN:** adaptador y normalizador separados del importador; comparación inicial en solo lectura, metadatos independientes y transacción controlada para nuevos registros autorizados.
3. **VERIFY:** API simulada y PostgreSQL efímero; no usar credenciales reales ni bases existentes. Verificar autenticación, bloqueo por conexión, reintentos, cursor, permisos, saldo, monedas y cambios de día en Santiago.
4. **Piloto por aprobar:** conexión de solo lectura tras validar costo y consentimiento; primero previsualización sin insertar. Contrastar cargos, abonos, saldo y fechas con una cartola conocida. Tras aceptar el corte inicial, verificar varios días, incluido un fallo o reautenticación, antes de afirmar actualización diaria autónoma.

## 9. Decisiones de la investigación inicial — histórico

- Se propuso pedir aclaración a Fintoc sobre la contradicción documental y el acceso personal gratuito. No se envió la consulta. La verificación canónica y la operación live posteriores resolvieron el requisito para este titular; no queda pendiente una respuesta escrita para las lecturas GET autorizadas. El refresco bancario conserva sus límites publicados según modalidad.
- ¿Banco de Chile ofrece habilitación API de producción para esta cuenta personal, con alta de persona natural y sin costo adicional, o entrega programada completa gratuita? Es la validación complementaria a la aclaración de Fintoc; no se verificó que así sea y no se ha contactado al banco.
- Para el banco, precisar cuenta corriente de Personas, RUT personal sin empresa, uso propio y solo lectura; pedir requisitos de autorización, costo total, rango de movimientos y mecanismo de actualización diaria. El circuito API público remite al ejecutivo cash. Separadamente, el canal ARCO permite solicitar los datos y preguntar por su entrega electrónica; no reemplaza la habilitación API.
- Si no hay acceso personal gratuito confirmado, ¿se prefiere conservar el Excel manual o probar una descarga asistida desde el dispositivo propio, sin cuota de proveedor, con autenticación del titular y limitaciones explícitas?
- ¿Se aprueba compartir datos con el proveedor y la correspondiente excepción de privacidad, o se mantiene todo el tratamiento bajo el servidor y dispositivo propios?

**Trabajo de la investigación inicial:** revisión de código y documentación pública, sin conectar cuentas, configurar credenciales, contactar a terceros, programar procesos o modificar datos en esa etapa. La vinculación y primera lectura posteriores se distinguen a continuación.

## 10. Resolución e implementación Epic18 — 2026-11-01

Los términos canónicos de Chile, seleccionando **Para desarrolladores → Términos y condiciones**, reconocen desarrolladores naturales o jurídicos, incluyen Conciliación Bancaria en Servicios y establecen gratuidad hasta cinco cuentas personales en 2.3 y QUINTO(a). La cuenta vinculada es Individual, está dentro de ese límite y no se ha contratado un instrumento pagado. La primera lectura productiva mediante Movements v1, versión 2026-02-01, fue completa y exitosa, con configuración temporal en memoria y sin escrituras financieras. Las credenciales y respuestas permanecen en el servidor privado.

La solución implementada consulta tres meses calendario una vez al día a las **07:00 America/Santiago**, sin ejecución automática al arrancar ni reintentos inmediatos. Baseline establece un corte inmutable, vincula coincidencias exactas 1:1 y guarda pendientes; no inserta historia. Después solo añade novedades confirmadas inequívocas posteriores al corte, con categoría/notas NULL. Identidad externa, multiplicidad, bloqueo compartido y transacción protegen el historial; correcciones, reversiones, reemisiones y referencias eliminadas quedan en revisión sin reescribir o recrear gastos. No se escribe el saldo conocido.

**Alcance:** cuenta corriente CLP Banco de Chile. La [cobertura oficial](https://docs.fintoc.com/guides/movements/overview-data-aggregation/products-and-institutions-movements) no documenta el detalle de compras de tarjeta de crédito para esa institución; TC/N8N mantiene su programación existente. Un pago de tarjeta desde la cuenta no equivale a sus compras individuales.

La web distingue última consulta completa, fecha bancaria, cobertura y pendientes. La consulta diaria no garantiza un nuevo refresco bancario cada 24 horas; no activa Refresh Intents, planes, pagos ni servicios opcionales. HTTP402 detiene la ejecución. La implementación y sus pruebas están listas; el despliegue productivo es el siguiente paso. Contrato, verificación y resultado definitivo: [Epic18 FDS-01–14](../implementation/fintoc-daily-sync-contract.md) y [plan y evidencia](../implementation/fintoc-daily-sync-plan.md).
