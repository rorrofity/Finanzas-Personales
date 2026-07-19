# spec.md — Especificación Funcional: Finanzas Personales PWA

> **Nota para el Agente de IA:** Esta especificación funcional está **subordinada al archivo `constitution.md`**. En caso de cualquier conflicto percibido, las reglas del documento constitucional (seguridad, arquitectura, infraestructura) tienen **prioridad absoluta**.

---

## 1. Resumen del Producto

Finanzas Personales es una PWA (Progressive Web App) **mobile-first** para gestión integral de finanzas individuales. Permite al usuario registrar transacciones, proyectar gastos futuros, sincronizar automáticamente movimientos bancarios desde emails, y monitorear su salud financiera en tiempo real.

### 1.1 Fuera de Alcance (Out of Scope)

Para evitar la sobre-ingeniería, **NO** se debe implementar lo siguiente:

- **No aplicaciones nativas:** El esfuerzo será 100% PWA. No se generará código para iOS/Android nativo.
- **No multi-tenant abierto:** El modelo es **dueño + hasta 2 miembros invitados por espacio** (Epic 11, enmienda constitucional 1.1 del 2026-07-18). NO hay: registro público de espacios/organizaciones, espacios anidados, permisos por categoría o módulo, transferencia de propiedad del espacio, ni notificaciones por email (la invitación es in-app).
- **No colaboración en tiempo real:** Sin websockets ni resolución de conflictos concurrentes; aplica last-write-wins.
- **No red social:** No habrá sistema de mensajería, "likes", ni compartir datos con otros usuarios.
- **No criptomonedas:** No se manejarán activos digitales ni inversiones complejas.
- **No facturación electrónica:** No se emitirán documentos tributarios.

---

## 2. Stack Tecnológico Base

| Capa | Tecnología |
|---|---|
| **Frontend** | React 18 + Material-UI (MUI), configurado como PWA |
| **Backend** | Node.js + Express.js + PostgreSQL |
| **Automatización** | N8N (Docker) para workflows de sincronización |
| **Autenticación** | JWT local + Google OAuth 2.0 |
| **Base de Datos** | PostgreSQL 14+ (self-hosted en Digital Ocean) |
| **Infraestructura** | Digital Ocean Droplet + Caddy (reverse proxy + SSL) |
| **Procesos** | PM2 para gestión de procesos Node.js |

---

## 3. Principios Constitucionales (Restricciones Innegociables)

### AUTH-001 — Autenticación Obligatoria para Escritura
- **Nivel:** MUST (Obligatorio)
- **Restricción:** Todas las operaciones de escritura (POST/PUT/DELETE) DEBEN requerir JWT válido.
- **Patrón:** Login local (email/password) + Google OAuth 2.0 opcional.
- **Justificación:** Proteger datos financieros sensibles.

### DATA-001 — Privacidad de Datos
- **Nivel:** MUST (Obligatorio)
- **Restricción:** Los datos financieros NUNCA deben salir del servidor personal del usuario.
- **Patrón:** PostgreSQL local, sin servicios de analytics de terceros, sin tracking.
- **Justificación:** Control total sobre información financiera sensible.

### ARCH-001 — Separación Frontend/Backend
- **Nivel:** MUST (Obligatorio)
- **Restricción:** El sistema DEBE mantener separación estricta entre frontend (React) y backend (Express).
- **Patrón:** API REST con CORS configurado por ambiente.
- **Justificación:** Mantenibilidad y claridad de responsabilidades.

### PWA-001 — Funcionalidad Offline-First
- **Nivel:** MUST (Obligatorio)
- **Restricción:** La aplicación DEBE funcionar sin conexión con sincronización posterior.
- **Patrón:** Service Worker + IndexedDB + Background Sync API.
- **Justificación:** Acceso a datos financieros en cualquier momento, incluso sin internet.

### N8N-001 — Automatización Controlada *(enmendado 2026-07-19)*
- **Nivel:** MUST (Obligatorio)
- **Restricción:** La sincronización desde emails puede ser **on-demand (botón)** y/o **programada (recurrente)**, pero SIEMPRE bajo control del dueño: la programación es **opt-in** (el dueño la activa) y con horarios acotados; nunca se sincroniza en nombre de un miembro invitado.
- **Patrón:** Webhook de backend a N8N (mismo webhook para manual y programado); un scheduler del backend dispara la sync recurrente. N8N responde con datos parseados.
- **Justificación:** El usuario quiere recibir sus movimientos sin recordar sincronizar manualmente; se mantiene el control (activar/desactivar, horarios) y se evita sobrecarga limitando la frecuencia.

### PUSH-001 — Notificaciones Push Consentidas
- **Nivel:** MUST (Obligatorio)
- **Restricción:** Las notificaciones push solo se envían a dispositivos que hayan **otorgado permiso explícito** y estén suscritos; una suscripción pertenece a un usuario y solo recibe notificaciones de ese usuario. Las claves privadas (VAPID, web-push) viven en el servidor y NUNCA se exponen al cliente.
- **Patrón:** Web Push estándar (VAPID) + Service Worker; suscripciones almacenadas por usuario; envío desde el backend con `web-push`.
- **Justificación:** Respeto por el consentimiento del usuario y por la privacidad de datos financieros (DATA-001).

### SEC-001 — Headers de Seguridad
- **Nivel:** MUST (Obligatorio)
- **Restricción:** Todas las respuestas HTTPS DEBEN incluir headers de seguridad estándar.
- **Patrón:** HSTS, CSP, X-Frame-Options, X-Content-Type-Options vía Caddy/Express.
- **Justificación:** Protección contra XSS, clickjacking, y ataques comunes.

### ACL-001 — Autorización de Espacio Compartido Verificada por Request
- **Nivel:** MUST (Obligatorio)
- **Restricción:** Toda petición sobre un espacio ajeno DEBE validar membresía y permisos **contra la base de datos en cada request** (nunca embebidos en el JWT).
- **Patrón:** Header `X-Space-Owner` + middleware `resolveSpace`; el JWT solo identifica a la persona (AUTH-001), la autorización del espacio se resuelve en BD.
- **Justificación:** Activar/desactivar permisos o membresías debe tener efecto inmediato, sin esperar expiración de tokens (24h).

### TEST-001 — Desarrollo Guiado por Pruebas (Test-First)
- **Nivel:** MUST (Obligatorio)
- **Restricción:** NINGUNA implementación de código se realiza sin una prueba previa que falle.
- **Patrón:** Ciclo Red-Green: (1) escribir prueba → (2) ejecutar y verificar que **falla** → (3) implementar el mínimo código para pasar → (4) ejecutar y verificar que **pasa**. Pruebas E2E con **Playwright**; unitarias con Jest/React Testing Library.
- **Justificación:** Garantiza que cada requerimiento del `spec.md` tenga cobertura verificable, previene regresiones en la funcionalidad existente (crítico al no haber staging), y documenta el comportamiento esperado.

---

## 4. Actores del Sistema

| Actor | Estado | Permisos |
|---|---|---|
| **Dueño del espacio** | Autenticado (JWT) | Lectura + escritura completa sobre SU espacio. Único que administra miembros, configuración (tarjetas, período de facturación) y sincronización N8N. |
| **Miembro invitado** | Autenticado (JWT) con membresía activa | Sobre el espacio compartido: ver (siempre que esté activo), crear/editar si `can_edit`, eliminar si `can_delete`. Sobre SU propio espacio: dueño pleno. |

---

## 5. Epics, Flujos y Criterios de Aceptación

Los criterios de aceptación usan **notación EARS**:
- *"Cuando [evento], el sistema debe [respuesta]"*
- *"Si [condición], el sistema debe [respuesta]"*

---

### Epic 1: Autenticación y Sesión

**Flujo:** Login con email/password local o Google OAuth. JWT con expiración de 24 horas.

**Principios aplicados:** `AUTH-001`, `SEC-001`

| ID | Criterio de Aceptación |
|---|---|
| Req 1.1 | Cuando un usuario intente iniciar sesión con credenciales válidas, el sistema **debe** generar un JWT y retornarlo en la respuesta. |
| Req 1.2 | Si el email no existe o la contraseña es incorrecta, el sistema **debe** retornar HTTP 401 sin distinguir cuál fue el error. |
| Req 1.3 | Cuando un usuario autenticado realice cualquier petición, el sistema **debe** validar el JWT en el header `Authorization: Bearer <token>`. |
| Req 1.4 | Si el JWT está expirado o es inválido, el sistema **debe** retornar HTTP 401 y redirigir al login. |
| Req 1.5 | Cuando un usuario cierre sesión, el sistema **debe** invalidar el token del lado cliente (el servidor es stateless). |

**Casos de borde:**
- Si Google OAuth no responde en 10 segundos, mostrar error y ofrecer login tradicional.
- El token JWT debe incluir `user_id` y `email` en el payload.

---

### Epic 2: Gestión de Transacciones

**Flujo:** CRUD completo de transacciones financieras (gastos, ingresos, pagos). Categorización y metadatos.

**Principios aplicados:** `DATA-001`, `AUTH-001`

| ID | Criterio de Aceptación |
|---|---|
| Req 2.1 | Cuando un usuario autenticado cree una transacción, el sistema **debe** persistirla con `user_id`, timestamp del servidor, y generar UUID. |
| Req 2.2 | Si el monto de la transacción es negativo o cero, el sistema **debe** rechazar con HTTP 400. |
| Req 2.3 | Cuando se liste transacciones, el sistema **debe** permitir filtrar por período de facturación (billing_year/billing_month). |
| Req 2.4 | Si una transacción tiene `tipo = 'desestimar'`, el sistema **debe** excluirla de todos los totales y gráficos. |
| Req 2.5 | Cuando se edite una transacción, el sistema **debe** actualizar `updated_at` automáticamente. |
| Req 2.6 | Si se elimina una transacción que fue importada desde email (tiene `email_id` en metadata), el sistema **debe** permitir su recreación en futuras sincronizaciones. |

**Casos de borde:**
- La descripción debe truncarse a 255 caracteres si excede el límite.
- El período de facturación (billing_period) se calcula automáticamente: día >= 22 → mes+2, día < 22 → mes+1.

---

### Epic 3: Importación y Sincronización

**Flujo:** Importación manual (CSV/Excel) y sincronización automática desde emails bancarios vía N8N.

**Principios aplicados:** `N8N-001`, `DATA-001`, `AUTH-001`

| ID | Criterio de Aceptación |
|---|---|
| Req 3.1 | Cuando un usuario pulse "Sincronizar Emails", el sistema **debe** llamar al webhook de N8N y esperar respuesta con transacciones parseadas. |
| Req 3.2 | Si N8N no responde en 30 segundos, el sistema **debe** retornar error amigoso al usuario. |
| Req 3.3 | Cuando N8N retorne transacciones, el sistema **debe** verificar duplicados por `email_id` en metadata antes de insertar. |
| Req 3.4 | Si una transacción duplicada es detectada, el sistema **debe** omitirla y contarla en `skipped`. |
| Req 3.5 | Cuando se importe desde CSV/Excel, el sistema **debe** detectar duplicados por fecha + monto + descripción normalizada. |
| Req 3.6 | Si una transacción importada coincide con fecha+monto pero descripción diferente, el sistema **debe** marcarla como "sospechosa" para revisión manual. |

**Casos de borde:**
- El endpoint `/api/sync/sync-save` (llamado por N8N) no requiere JWT porque es interno (solo localhost).
- Si el parsing de un email falla, N8N debe retornar el error en el array de respuesta pero no abortar todo el proceso.

---

### Epic 4: Cuenta Corriente (Checking)

**Flujo:** Importación de cartolas del Banco de Chile y seguimiento de saldo.

**Principios aplicados:** `DATA-001`, `AUTH-001`

| ID | Criterio de Aceptación |
|---|---|
| Req 4.1 | Cuando se importe una cartola Excel, el sistema **debe** parsear fila 23 en adelante (headers: Fecha, Descripción, Cargos, Abonos, Saldo). |
| Req 4.2 | El sistema **debe** extraer el saldo de la primera transacción como "saldo conocido" inicial. |
| Req 4.3 | Cuando se listen transacciones de cuenta corriente, el sistema **debe** mostrar los últimos 6 meses sin filtro de mes específico. |
| Req 4.4 | Si una transacción de checking coincide en fecha + monto + descripción con una existente, el sistema **debe** omitirla (detección de duplicados). |

---

### Epic 5: Compras en Cuotas

**Flujo:** Creación de planes de cuotas con proyección automática de pagos futuros.

**Principios aplicados:** `AUTH-001`, `DATA-001`

| ID | Criterio de Aceptación |
|---|---|
| Req 5.1 | Cuando se cree un plan de cuotas, el sistema **debe** generar automáticamente las ocurrencias (occurrences) para cada mes futuro. |
| Req 5.2 | Si el número de cuotas es > 48, el sistema **debe** rechazar con HTTP 400. |
| Req 5.3 | Cuando se pague una cuota individual, el sistema **debe** marcarla como `pagada = true` sin afectar las demás. |
| Req 5.4 | Si se elimina un plan de cuotas, el sistema **debe** ofrecer: eliminar solo cuotas pendientes o todo el plan incluyendo pagadas. |

---

### Epic 6: Transacciones Internacionales

**Flujo:** Registro de compras en USD con conversión a CLP.

**Principios aplicados:** `AUTH-001`, `DATA-001`

| ID | Criterio de Aceptación |
|---|---|
| Req 6.1 | Cuando se cree una transacción internacional, el sistema **debe** almacenar `amount_usd` y `exchange_rate`. |
| Req 6.2 | El sistema **debe** calcular automáticamente el monto en CLP como `amount_usd * exchange_rate`. |
| Req 6.3 | Si no se proporciona `exchange_rate`, el sistema **debe** usar una tasa por defecto configurable. |

---

### Epic 7: Dashboard y Visualización

**Flujo:** Vista general de finanzas con gráficos interactivos (treemap, barras, evolución).

**Principios aplicados:** `AUTH-001`, `PWA-001`

| ID | Criterio de Aceptación |
|---|---|
| Req 7.1 | Cuando el Dashboard cargue, el sistema **debe** mostrar estadísticas del período de facturación seleccionado. |
| Req 7.2 | El sistema **debe** renderizar un treemap de gastos por categoría en menos de 2 segundos. |
| Req 7.3 | Cuando se cambie el período seleccionado, el sistema **debe** actualizar todos los widgets sin recargar la página. |
| Req 7.4 | Si no hay transacciones en el período, el sistema **debe** mostrar estado vacío con llamada a la acción. |

---

### Epic 8: Salud Financiera

**Flujo:** Proyección de balance futuro, cálculo de health score, y sistema de alertas.

**Principios aplicados:** `AUTH-001`, `DATA-001`

| ID | Criterio de Aceptación |
|---|---|
| Req 8.1 | Cuando se solicite el resumen de salud financiera, el sistema **debe** calcular: saldo cuenta corriente + compromisos TC + proyecciones. |
| Req 8.2 | El sistema **debe** calcular un `health_score` entre 0-100 basado en cobertura de compromisos vs saldo actual. |
| Req 8.3 | Si la proyección del mes siguiente es negativa, el sistema **debe** generar una alerta `projection_negative`. |
| Req 8.4 | Cuando una alerta sea descartada, el sistema **debe** marcarla como `is_dismissed = true` sin eliminarla. |
| Req 8.5 | El sistema **debe** cachear snapshots diarios en la tabla `financial_snapshots` para consultas rápidas. |

---

### Epic 9: PWA y Adaptación Mobile *(Épica Principal - NUEVA)*

**Flujo:** Convertir la aplicación en PWA instalable con optimización completa para dispositivos móviles. El soporte offline es **solo para consulta/lectura**; las operaciones de escritura (crear/editar/eliminar transacciones) requieren conexión activa.

**Principios aplicados:** `PWA-001`, `SEC-001`, `ARCH-001`

| ID | Criterio de Aceptación |
|---|---|
| Req 9.1 | Cuando la PWA se instale, el sistema **debe** registrar un Service Worker con Workbox para caching estratégico. |
| Req 9.2 | El sistema **debe** proveer un `manifest.json` válido con íconos en múltiples tamaños, tema, y shortcuts. |
| Req 9.3 | Cuando el usuario esté offline, el sistema **debe** mostrar un banner indicando el estado y permitir **lectura** de datos previamente cacheados (solo visualización, no modificaciones). |
| Req 9.4 | Si el usuario intenta crear/editar/eliminar una transacción estando offline, el sistema **debe** mostrar mensaje indicando que la operación requiere conexión y **no** permitir la acción. |
| Req 9.5 | El sistema **debe** cachear las páginas principales (App Shell) para carga instantánea. |
| Req 9.6 | Cuando se actualice el Service Worker, el sistema **debe** mostrar notificación para "Actualizar a nueva versión". |
| Req 9.7 | El sistema **debe** funcionar correctamente en modo standalone (sin barra de navegador) cuando se instala en home screen. |
| Req 9.8 | En pantallas menores a 768px (mobile), el sistema **debe** adaptar el layout: drawer lateral se convierte en bottom sheet o menú hamburguesa, y las tablas se transforman en cards. |
| Req 9.9 | En pantallas mobile, el sistema **debe** mantener todos los controles de acción (botones, filtros, selects) accesibles sin scroll horizontal. |
| Req 9.10 | El sistema **debe** soportar gestos táctiles comunes: swipe para cerrar drawers, pull-to-refresh en listados, y zoom pinch en gráficos. |
| Req 9.11 | En modo standalone (instalado), el sistema **debe** ocupar todo el viewport sin mostrar la barra de direcciones del navegador. |
| Req 9.12 | Cuando el usuario retome la conexión después de estar offline, el sistema **debe** refrescar automáticamente los datos para mostrar información actualizada. |

**Casos de borde:**
- El límite de almacenamiento IndexedDB debe respetar quotas del navegador (mostrar advertencia al 80%).
- En modo offline, los botones de "Nueva Transacción" y "Editar" deben visualizarse deshabilitados (disabled) con tooltip explicativo, no ocultos.
- La sincronización N8N requiere conexión; si el usuario pulsa "Sincronizar Emails" estando offline, debe mostrar error inmediato sin intentar la llamada.

---

### Epic 10: Detección y Resolución de Duplicados

**Flujo:** Sistema de revisión de transacciones sospechosas de duplicación.

**Principios aplicados:** `AUTH-001`, `DATA-001`

| ID | Criterio de Aceptación |
|---|---|
| Req 10.1 | Cuando se detecte un posible duplicado, el sistema **debe** crear un registro en `suspicious_duplicates` con estado `pending`. |
| Req 10.2 | El sistema **debe** mostrar un badge con el conteo de sospechosos pendientes en el menú lateral. |
| Req 10.3 | Cuando el usuario resuelva un duplicado (eliminar uno o mantener ambos), el sistema **debe** actualizar el estado y ejecutar la acción correspondiente. |
| Req 10.4 | Si el usuario elige "eliminar", el sistema **debe** borrar la transacción duplicada y marcar el registro como `resolved`. |

---

### Epic 11: Espacio Compartido del Hogar *(Épica Actual — NUEVA)*

**Flujo:** El dueño invita por email a un miembro de su hogar (máx. 2). El miembro, con su propia cuenta, accede al espacio compartido mediante un selector de espacio. El dueño administra permisos granulares (crear+editar, eliminar) y puede activar/desactivar el acceso con efecto inmediato. Toda escritura queda auditada (quién creó/modificó).

**Decisiones de diseño (2026-07-18, acordadas con el dueño del producto):**
- Modelo **ACL sobre la cuenta del dueño**: los datos financieros permanecen bajo el `user_id` del dueño; NO se migran a un modelo de workspaces. Tabla nueva `space_members` define membresías y permisos.
- Permisos: **ver** (implícito con membresía activa), **crear+editar** (`can_edit`, incluye importación de archivos y gestión de categorías), **eliminar** (`can_delete`). Switch maestro `is_active`.
- **Sincronización N8N: exclusiva del dueño** (el workflow lee SU Gmail).
- Invitación **in-app sin emails**: el dueño ingresa el email del invitado; si la cuenta existe, la membresía queda activa; si no, queda `pending` y se activa cuando esa persona se registre con ese email.

**Principios aplicados:** `AUTH-001`, `ACL-001`, `DATA-001`, `SEC-001`, `N8N-001`

| ID | Criterio de Aceptación |
|---|---|
| Req 11.1 | Cuando el dueño invite un email con cuenta existente, el sistema **debe** crear la membresía activa y el espacio compartido **debe** aparecer al miembro en su siguiente carga de la app. |
| Req 11.2 | Si el email invitado no tiene cuenta, el sistema **debe** guardar la invitación `pending` y activarla automáticamente cuando ese email se registre. |
| Req 11.3 | Si el dueño intenta invitar un tercer miembro, su propio email, o un email ya invitado, el sistema **debe** rechazar con HTTP 400/409. |
| Req 11.4 | Cuando un usuario autenticado consulte sus espacios (`GET /api/space/memberships`), el sistema **debe** retornar su espacio propio y los espacios compartidos con membresía activa. |
| Req 11.5 | Cuando una petición incluya `X-Space-Owner` distinto del propio usuario, el sistema **debe** validar en BD la membresía activa; si no existe o está inactiva, **debe** retornar HTTP 403. |
| Req 11.6 | Si un miembro sin `can_edit` intenta POST/PUT (crear, editar, importar, categorizar), el sistema **debe** retornar HTTP 403. |
| Req 11.7 | Si un miembro sin `can_delete` intenta DELETE (individual o bulk), el sistema **debe** retornar HTTP 403. |
| Req 11.8 | Cuando el dueño cambie permisos o desactive una membresía, el efecto **debe** ser inmediato en la siguiente petición del miembro (sin re-login) — ACL-001. |
| Req 11.9 | Si un miembro invoca la sincronización N8N (`/api/sync/sync-emails`) sobre un espacio ajeno, el sistema **debe** retornar HTTP 403; en la UI el botón **debe** verse deshabilitado con tooltip. |
| Req 11.10 | La administración de miembros, tarjetas de crédito y configuración de período de facturación **debe** ser exclusiva del dueño (HTTP 403 para miembros; secciones ocultas o solo-lectura en UI). |
| Req 11.11 | Cuando se cree o edite una transacción, el sistema **debe** registrar `created_by`/`updated_by` con el `user_id` de la persona que ejecutó la acción (no el dueño del espacio). |
| Req 11.12 | Cuando el espacio tenga más de un participante, la UI **debe** mostrar quién registró cada transacción (indicador discreto). |
| Req 11.13 | Cuando el usuario tenga acceso a más de un espacio, la UI **debe** mostrar un selector de espacio persistente (localStorage) y todas las vistas **deben** reflejar el espacio activo sin recargar la página. |
| Req 11.14 | El caché offline de lectura (IndexedDB) **debe** llavear sus entradas por espacio activo; en modo offline NUNCA se **deben** mostrar datos de un espacio en otro. |
| Req 11.15 | Cuando el usuario cierre sesión, el sistema **debe** limpiar el caché de lectura local (readCache). |

**Casos de borde:**
- Miembro activo sin `can_edit`: botones de escritura visibles pero disabled con tooltip "Sin permiso de edición" (mismo patrón que offline, Req 9.4).
- Si el dueño desactiva la membresía mientras el miembro navega el espacio compartido, la siguiente petición retorna 403 y la UI **debe** volver automáticamente al espacio propio con un aviso.
- `X-Space-Owner` ausente o igual al propio `user_id` → espacio propio con permisos plenos (comportamiento actual, retrocompatible).
- El selector de espacio NO aparece si el usuario solo tiene su espacio propio (UX idéntica a hoy para usuarios sin membresías).
- Los endpoints internos de N8N (`/api/sync/sync-save`) no cambian: siguen escribiendo al espacio del dueño.

---

### Epic 12: Rediseño del Dashboard y Sistema de Diseño Compacto *(Épica Actual — NUEVA)*

**Problema:** El dashboard actual apila verticalmente cards gigantes ($0 ocupando ~200px cada una) y 3+ gráficos a página completa; en el teléfono exige scroll excesivo y no comunica lo importante. Las páginas de datos repiten el mismo patrón (3 cards de totales enormes antes del contenido).

**Objetivo:** Un dashboard que responda en un vistazo las 3 preguntas de las finanzas del hogar — **¿cómo voy este período? · ¿en qué se va la plata? · ¿qué se viene?** — con un sistema de diseño compacto reutilizable en el resto de la app.

**Principios aplicados:** `AUTH-001`, `ACL-001`, `PWA-001`, `TEST-001`

#### 12.A Indicadores (KPIs) del período de facturación seleccionado

| # | KPI | Cálculo (datos existentes) |
|---|---|---|
| K1 | **Balance del período** | ingresos CC − (gastos TC facturables + gastos CC) |
| K2 | **Gasto total del período** + Δ% vs período anterior | suma gastos (excluye `desestimar`) |
| K3 | **Tasa de ahorro** | (ingresos − gastos) / ingresos, en %; "—" si no hay ingresos |
| K4 | **Gasto promedio diario** + proyección de cierre | gasto acumulado / días transcurridos × días del período |
| K5 | **Compromisos próximos** | TC no facturado + cuotas del período siguiente + proyectados (reusa lógica financial-health) |
| K6 | **Disponible hoy** | saldo cuenta corriente (known balance + movimientos) |
| K7 | **Top 5 categorías** | % del gasto del período + Δ vs período anterior por categoría |

#### 12.B Requerimientos

| ID | Criterio de Aceptación |
|---|---|
| Req 12.1 | El sistema **debe** exponer `GET /api/dashboard/overview?year&month` que retorna K1–K7 en UNA sola respuesta (con `resolveSpace`: funciona en espacio propio y compartido). |
| Req 12.2 | Cuando el Dashboard cargue, el sistema **debe** mostrar una fila de **stat-cards compactas** (K1, K2, K3, K6): número grande, etiqueta pequeña, delta con flecha y color (verde baja de gasto / rojo alza). Grid: 2 columnas en mobile, 4 en desktop. Altura máxima 96px por card. |
| Req 12.3 | El sistema **debe** mostrar "Compromisos próximos" (K5) como una card-resumen expandible con el detalle (TC, cuotas, proyectados) colapsado por defecto. |
| Req 12.4 | El sistema **debe** mostrar el Top 5 de categorías (K7) como lista compacta con barras de progreso horizontales y % — NO treemap en mobile. Tap en una categoría navega a su detalle (drill-down existente). |
| Req 12.5 | Los gráficos de evolución (historia mensual, evolución por categoría) **deben** vivir bajo un selector de pestañas/segmentos en UNA sola zona de gráfico (no apilados), con altura máxima 260px en mobile. |
| Req 12.6 | Si un KPI no tiene datos, el sistema **debe** mostrar la card con estado vacío discreto ("Sin datos del período") sin romper la grilla, y las cards con datos deben renderizarse normalmente. |
| Req 12.7 | Mientras carga, el sistema **debe** mostrar skeletons con la misma geometría de las cards (sin saltos de layout, CLS ≈ 0). |
| Req 12.8 | El Dashboard **debe** conservar: selector de período, botón Sincronizar (solo dueño), y funcionar con caché offline de lectura por espacio (Reqs 9.3 y 11.14). |
| Req 12.9 | El sistema de diseño **debe** quedar en componentes reutilizables (`StatCard`, `TrendDelta`, `SectionCard`, `CategoryBar`) con densidad estándar: paddings 12–16px, valores `h5`/`h6`, labels `caption`. |
| Req 12.10 | Las páginas de transacciones (TC, Intl, Checking, Projected) **deben** reemplazar sus 3 cards gigantes de totales por una fila de stat-cards compactas del mismo sistema (Req 12.9), sin cambiar su lógica. |
| Req 12.11 | En 375px ninguna vista rediseñada **debe** exceder el ancho del viewport (criterio absoluto, test estilo `mobile-responsive-fixes`). |
| Req 12.12 | El rediseño **no debe** alterar endpoints existentes ni romper la suite E2E actual (los tests que dependan del layout anterior se ACTUALIZAN en la misma fase, nunca se debilitan). |

**Casos de borde:**
- Período sin transacciones: stat-cards en 0/vacío + CTA "Importar o sincronizar" (reemplaza al estado vacío actual).
- Δ% cuando el período anterior es 0: mostrar "—" (no ∞).
- Miembro invitado sin `can_edit`: los accesos rápidos de escritura siguen el gating de Epic 11.
- Offline: overview se sirve desde readCache; los skeletons no deben quedar infinitos (timeout → estado vacío).

---

### Epic 13: Sincronización Automática Programada + Notificaciones Push *(Épica Actual — NUEVA)*

**Problema:** Hoy Rodrigo debe acordarse de pulsar "Sincronizar Emails" para traer sus cargos de tarjeta. Quiere que ocurra solo, dos veces al día, y que le avise para ir a categorizar lo nuevo.

**Flujo:** Un scheduler del backend ejecuta la sincronización automáticamente en horarios configurables (por defecto **13:00 y 22:00 America/Santiago**), reutilizando el mismo webhook de N8N que la sync manual. Si la sincronización trae transacciones nuevas, el backend envía una **notificación push** a los dispositivos del dueño con un recordatorio para categorizarlas; al tocarla, la PWA abre la vista de transacciones.

**Decisiones de diseño (2026-07-19):**
- **Scheduler en el backend** (`node-cron`, zona horaria America/Santiago), no en N8N: mantiene al backend como orquestador, permite decidir el push según el resultado y es testeable. El webhook de N8N no cambia.
- **Opt-in por dueño:** la sync programada se activa/desactiva desde Configuración (`auto_sync_enabled`); si está desactivada, nada ocurre automáticamente (comportamiento actual).
- **Push solo si hay novedades:** se notifica únicamente cuando `imported > 0` (evita ruido).
- **Web Push estándar (VAPID):** funciona en la PWA instalada (iOS 16.4+ agregada a inicio, Android Chrome). Requiere permiso explícito del usuario.
- **Solo el dueño** sincroniza y recibe push de su espacio (coherente con N8N-001 y Epic 11); un miembro invitado no dispara sync ni recibe estas notificaciones.

**Principios aplicados:** `N8N-001`, `PUSH-001`, `AUTH-001`, `DATA-001`, `SEC-001`

#### 13.A Sincronización programada

| ID | Criterio de Aceptación |
|---|---|
| Req 13.1 | El sistema **debe** ejecutar la sincronización automáticamente en los horarios configurados (default 13:00 y 22:00 America/Santiago), reutilizando el flujo de N8N de la sync manual. |
| Req 13.2 | La sincronización programada **debe** ejecutarse solo para usuarios con `auto_sync_enabled = true`; si nadie la tiene activa, no se llama a N8N. |
| Req 13.3 | El dueño **debe** poder activar/desactivar la sincronización programada desde Configuración, con efecto en la próxima ejecución. |
| Req 13.4 | Si N8N falla o no responde, el scheduler **debe** registrar el error y continuar (no romper el proceso ni reintentar en loop); la próxima ejecución programada procede normalmente. |
| Req 13.5 | La sincronización programada **debe** registrar su resultado (timestamp, importadas, omitidas, error) consultable para diagnóstico. |
| Req 13.6 | El scheduler **no debe** ejecutarse en entornos de desarrollo/test salvo activación explícita (evita llamadas accidentales a N8N). |

#### 13.B Notificaciones push

| ID | Criterio de Aceptación |
|---|---|
| Req 13.7 | Cuando la PWA esté instalada y el usuario no haya decidido aún, el sistema **debe** poder solicitar permiso de notificaciones de forma no intrusiva (acción del usuario, no pop-up automático al cargar). |
| Req 13.8 | Al conceder permiso, el sistema **debe** suscribir el dispositivo (Web Push/VAPID) y persistir la suscripción asociada al usuario (`POST /api/push/subscribe`). |
| Req 13.9 | Tras una sincronización programada con `imported > 0`, el sistema **debe** enviar una notificación push a las suscripciones del dueño con un resumen ("Se sincronizaron N transacciones nuevas — toca para categorizar"). |
| Req 13.10 | Al tocar la notificación, la PWA **debe** enfocarse/abrirse en la vista de transacciones para categorizar. |
| Req 13.11 | Si el envío a una suscripción devuelve 404/410 (expirada), el sistema **debe** eliminarla para no reintentar. |
| Req 13.12 | El usuario **debe** poder desactivar las notificaciones (desuscribir) desde Configuración; una suscripción eliminada no vuelve a recibir push. |
| Req 13.13 | Si `imported = 0`, el sistema **no debe** enviar notificación (sin ruido). |

**Casos de borde:**
- Sin suscripciones push: la sync programada corre igual, sin enviar push.
- Permiso denegado por el navegador: la UI lo refleja y no reintenta automáticamente; el usuario puede reintentar desde Configuración.
- Dos dispositivos del mismo dueño: ambos reciben la notificación (todas sus suscripciones).
- El scheduler y el push **no** aplican a miembros invitados (solo dueño).
- iOS: el push solo funciona con la PWA **instalada** (agregada a pantalla de inicio); en Safari normal no. La UI debe explicarlo si el permiso no está disponible.

---

## 6. Modelo de Datos (PostgreSQL)

### 6.1 Tablas Principales

#### `users`
| Atributo | Tipo | Rol | Notas |
|---|---|---|---|
| `id` | UUID | **PK** | gen_random_uuid() |
| `nombre` | VARCHAR(100) | — | NOT NULL |
| `email` | VARCHAR(100) | Único | NOT NULL |
| `password` | VARCHAR(255) | — | bcrypt hash |
| `google_id` | VARCHAR(255) | Nullable | Para OAuth |
| `profile_picture` | TEXT | Nullable | URL avatar |
| `created_at` | TIMESTAMPTZ | — | DEFAULT NOW() |
| `updated_at` | TIMESTAMPTZ | — | trigger auto |

#### `transactions`
| Atributo | Tipo | Rol | Notas |
|---|---|---|---|
| `id` | UUID | **PK** | gen_random_uuid() |
| `user_id` | UUID | **FK** | → users(id) ON DELETE CASCADE |
| `fecha` | DATE | — | NOT NULL |
| `descripcion` | VARCHAR(255) | — | NOT NULL |
| `monto` | NUMERIC(12,2) | — | NOT NULL, > 0 |
| `category_id` | INTEGER | **FK** | → categories(id) |
| `tipo` | VARCHAR(20) | — | CHECK: ingreso/gasto/pago/desestimar |
| `cuotas` | INTEGER | — | DEFAULT 1 |
| `import_id` | UUID | **FK** | → imports(id) |
| `metadata` | JSONB | — | {email_id, source, parsed_at, ...} |
| `billing_year` | INTEGER | — | NULLable |
| `billing_month` | INTEGER | — | NULLable |
| `created_at` | TIMESTAMPTZ | — | DEFAULT NOW() |
| `updated_at` | TIMESTAMPTZ | — | trigger auto |

#### `financial_snapshots`
| Atributo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | PK |
| `user_id` | UUID | FK → users |
| `snapshot_date` | DATE | Fecha del cálculo |
| `checking_balance` | NUMERIC(14,2) | Saldo cuenta corriente |
| `cc_visa_unbilled` | NUMERIC(14,2) | Compromisos Visa no facturados |
| `cc_mastercard_unbilled` | NUMERIC(14,2) | Compromisos MC no facturados |
| `cc_visa_installments` | NUMERIC(14,2) | Cuotas Visa próximo mes |
| `cc_mastercard_installments` | NUMERIC(14,2) | Cuotas MC próximo mes |
| `cc_intl_visa` | NUMERIC(14,2) | Internacional Visa |
| `cc_intl_mastercard` | NUMERIC(14,2) | Internacional MC |
| `projected_expenses` | NUMERIC(14,2) | Gastos proyectados mes siguiente |
| `projected_income` | NUMERIC(14,2) | Ingresos proyectados mes siguiente |
| `total_commitments` | NUMERIC(14,2) | Total compromisos (TC + fijos) |
| `projected_balance` | NUMERIC(14,2) | Balance proyectado mes siguiente |
| `health_score` | INTEGER | 0-100 |
| `health_status` | VARCHAR(20) | critical/warning/healthy/excellent |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |

#### `space_members` *(Nueva, Epic 11)*
| Atributo | Tipo | Rol | Notas |
|---|---|---|---|
| `id` | UUID | **PK** | gen_random_uuid() |
| `owner_user_id` | UUID | **FK** | → users(id) ON DELETE CASCADE. Dueño del espacio. |
| `member_user_id` | UUID | **FK** Nullable | → users(id). NULL mientras la invitación esté `pending`. |
| `invited_email` | VARCHAR(100) | — | Email invitado (para vincular al registrarse). |
| `can_edit` | BOOLEAN | — | DEFAULT false. Crear/editar/importar/categorizar. |
| `can_delete` | BOOLEAN | — | DEFAULT false. Eliminar (individual y bulk). |
| `is_active` | BOOLEAN | — | DEFAULT true. Switch maestro del dueño. |
| `status` | VARCHAR(10) | — | CHECK: `pending` / `linked`. |
| `created_at` / `updated_at` | TIMESTAMPTZ | — | trigger auto |

Restricciones: `UNIQUE(owner_user_id, invited_email)`; máx. 2 filas por `owner_user_id` (validado en API); `owner_user_id != member_user_id` (CHECK indirecto en API).

#### Auditoría en `transactions` *(Epic 11)*
Se agregan `created_by UUID NULL` y `updated_by UUID NULL` (FK → users). Histórico queda NULL (se muestra como registrado por el dueño).

#### `push_subscriptions` *(Nueva, Epic 13)*
| Atributo | Tipo | Rol | Notas |
|---|---|---|---|
| `id` | UUID | **PK** | gen_random_uuid() |
| `user_id` | UUID | **FK** | → users(id) ON DELETE CASCADE |
| `endpoint` | TEXT | Único | URL del push service del navegador |
| `p256dh` | TEXT | — | Clave pública del cliente (encriptación) |
| `auth` | TEXT | — | Secreto de autenticación del cliente |
| `user_agent` | TEXT | Nullable | Para que el usuario identifique el dispositivo |
| `created_at` | TIMESTAMPTZ | — | DEFAULT NOW() |

#### `auto_sync_enabled` en `users` *(Epic 13)*
Se agrega `auto_sync_enabled BOOLEAN NOT NULL DEFAULT false`: opt-in del dueño a la sincronización programada.

#### `sync_runs` *(Nueva, Epic 13 — bitácora)*
| Atributo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | PK |
| `user_id` | UUID | FK → users |
| `trigger` | VARCHAR(12) | `manual` / `scheduled` |
| `imported` | INTEGER | Transacciones nuevas |
| `skipped` | INTEGER | Omitidas (duplicadas) |
| `error` | TEXT | Nullable (mensaje si falló) |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |

#### `pending_sync` *(Nueva, Epic 9)*
Tabla para operaciones offline pendientes (o almacenamiento en IndexedDB del frontend).

| Atributo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | PK |
| `user_id` | UUID | FK → users |
| `operation` | VARCHAR(20) | CREATE/UPDATE/DELETE |
| `entity_type` | VARCHAR(20) | transaction/installment/etc |
| `entity_data` | JSONB | Datos completos de la entidad |
| `created_at` | TIMESTAMPTZ | Cuándo se creó la operación offline |
| `retry_count` | INTEGER | Cuántos intentos de sync |
| `last_error` | TEXT | Mensaje de error si falló |
| `synced_at` | TIMESTAMPTZ | NULL hasta que se sincronice |

### 6.2 Relaciones

```
users ||--o{ transactions : "1:N"
users ||--o{ categories : "1:N"
users ||--o{ financial_snapshots : "1:N"
users ||--o{ pending_sync : "1:N"
transactions }o--|| categories : "N:1"
transactions }o--|| imports : "N:1"
users ||--o{ installment_plans : "1:N"
users ||--o{ checking_transactions : "1:N"
users ||--o{ intl_unbilled : "1:N"
```

---

## 7. Endpoints de la API

### 7.1 Autenticación (`/api/auth`)
| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| POST | `/login` | No | Login email/password |
| POST | `/google` | No | Login con Google OAuth |
| POST | `/register` | No | Registro nuevo usuario |
| GET | `/profile` | JWT | Obtener perfil usuario |

### 7.2 Transacciones (`/api/transactions`)
| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| GET | `/` | JWT | Listar con filtros (período, tipo, etc.) |
| POST | `/` | JWT | Crear transacción |
| PUT | `/:id` | JWT | Actualizar transacción |
| DELETE | `/:id` | JWT | Eliminar transacción |
| POST | `/bulk-delete` | JWT | Eliminar múltiples |
| POST | `/import` | JWT | Importar CSV/Excel |

### 7.3 Sincronización (`/api/sync`)
| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| POST | `/sync-emails` | JWT | Trigger sincronización N8N |
| POST | `/sync-save` | No* | Recibir datos de N8N (*local only) |
| GET | `/sync-status` | JWT | Estado última sincronización |

### 7.4 Dashboard (`/api/dashboard`)
| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| GET | `/stats` | JWT | Estadísticas generales |
| GET | `/treemap` | JWT | Datos para treemap |
| GET | `/monthly-comparison` | JWT | Comparación mes a mes |

### 7.5 Salud Financiera (`/api/financial-health`)
| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| GET | `/summary` | JWT | Resumen completo |
| POST | `/refresh` | JWT | Forzar recálculo snapshot |
| GET | `/alerts` | JWT | Listar alertas |
| PUT | `/alerts/:id/dismiss` | JWT | Descartar alerta |

### 7.6 Espacio Compartido (`/api/space`) *(Epic 11)*
| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| GET | `/memberships` | JWT | Espacios accesibles (propio + compartidos activos, con nombre del dueño y permisos) |
| GET | `/members` | JWT (dueño) | Miembros/invitaciones de MI espacio |
| POST | `/members` | JWT (dueño) | Invitar por email `{email, can_edit, can_delete}` |
| PUT | `/members/:id` | JWT (dueño) | Actualizar `{can_edit, can_delete, is_active}` |
| DELETE | `/members/:id` | JWT (dueño) | Revocar membresía/invitación |

Todos los endpoints de datos existentes (7.2–7.5) aceptan el header **`X-Space-Owner: <uuid>`** para operar sobre un espacio compartido (validado por `resolveSpace`, ACL-001). Sin el header operan sobre el espacio propio.

### 7.8 Notificaciones Push (`/api/push`) *(Epic 13)*
| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| GET | `/vapid-public-key` | JWT | Clave pública VAPID para suscribir el navegador |
| POST | `/subscribe` | JWT | Guardar la suscripción `{endpoint, keys:{p256dh, auth}}` del dispositivo |
| POST | `/unsubscribe` | JWT | Eliminar la suscripción `{endpoint}` |
| POST | `/test` | JWT (dueño) | Enviar una push de prueba a los dispositivos del usuario |

### 7.9 Sincronización programada (`/api/sync`) *(Epic 13, extiende 7.3)*
| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| GET | `/settings` | JWT | Estado de `auto_sync_enabled` y horarios |
| PUT | `/settings` | JWT (dueño) | Activar/desactivar `auto_sync_enabled` |
| GET | `/runs` | JWT | Últimas ejecuciones (bitácora `sync_runs`) |

El scheduler del backend (`node-cron`, America/Santiago) no es un endpoint: corre en el proceso Express (solo en producción o con `ENABLE_SCHEDULER=true`).

### 7.7 PWA Offline Sync (`/api/pwa`)
| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| POST | `/batch-sync` | JWT | Sincronizar operaciones offline pendientes |
| GET | `/sync-conflicts` | JWT | Obtener conflictos de sincronización |

---

## 8. Integración con N8N

### 8.1 Flujo de Sincronización

```
Usuario pulsa "Sincronizar Emails"
    ↓
Frontend → POST /api/sync/sync-emails (JWT)
    ↓
Backend → POST http://localhost:5678/webhook/sync-bank-emails
    ↓
N8N:
    1. Gmail API: busca emails no leídos
    2. Parsea transacciones (monto, descripción, fecha, tarjeta)
    3. POST http://localhost:3001/api/sync/sync-save
    ↓
Backend:
    1. Verifica duplicados por email_id
    2. Inserta transacciones nuevas
    3. Retorna {imported, skipped, errors}
    ↓
Frontend muestra resultado al usuario
```

### 8.2 Contrato N8N ↔ Backend

**Request a N8N Webhook:**
```json
{
  "userId": "uuid-del-usuario",
  "timestamp": "2026-06-07T12:00:00Z"
}
```

**Response de N8N:**
```json
{
  "parsed": 18,
  "valid": 15,
  "invalid": 3,
  "transactions": [
    {
      "email_id": "msg_18f3a2b4c5d6",
      "fecha": "2026-06-05",
      "descripcion": "COMERCIO EJEMPLO",
      "monto": 45990,
      "tipo": "gasto",
      "cuotas": 1,
      "banco": "banco_chile",
      "tarjeta": "visa",
      "email_subject": "Compra por $45.990",
      "email_date": "2026-06-05T10:30:00Z"
    }
  ],
  "errors": [
    {
      "email_id": "msg_xxx",
      "error": "No se pudo parsear el monto"
    }
  ]
}
```

---

## 9. Mapeo Constitucional

| Componente | Principio satisfecho |
|---|---|
| JWT en todos los endpoints de escritura | AUTH-001 |
| PostgreSQL local, sin servicios externos | DATA-001 |
| Separación `/src` (React) vs `/backend` (Express) | ARCH-001 |
| Service Worker + IndexedDB + Background Sync | PWA-001 |
| Botón "Sync" on-demand, no automático (solo dueño) | N8N-001 |
| Headers de seguridad en Caddy/Express | SEC-001 |
| Middleware `resolveSpace`: membresía y permisos desde BD por request | ACL-001 |

---

## 10. Decisiones Técnicas Definitivas

### ¿Por qué PostgreSQL y no DynamoDB?
El sistema está ya construido sobre PostgreSQL con 27 migraciones y lógica de negocio compleja (proyecciones, cuotas, joins). Migrar a NoSQL sería reescritura completa sin beneficio claro para un único usuario.

### ¿Por qué N8N y no AWS Lambda?
N8N ya está deployado y funcionando en producción. Provee UI visual para ajustar workflows sin código, retry logic integrado, y debugging fácil.

### ¿Por qué PWA y no app nativa?
- Menor costo de desarrollo y mantenimiento
- Un solo código para todas las plataformas
- Funciona inmediatamente sin app store
- Offline-first es suficiente para el uso case

### ¿Por qué Workbox y no SW manual?
Workbox simplifica el caching, routing, y background sync con APIs probadas y bien documentadas. Reduce riesgo de errores en el Service Worker.

---

*Versión: 1.3.0 — agrega Epic 13 (Sincronización Automática Programada + Push) y principio PUSH-001*
*Última actualización: 2026-07-19*
