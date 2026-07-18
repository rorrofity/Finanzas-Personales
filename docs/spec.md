# spec.md — Especificación Funcional: Finanzas Personales PWA

> **Nota para el Agente de IA:** Esta especificación funcional está **subordinada al archivo `constitution.md`**. En caso de cualquier conflicto percibido, las reglas del documento constitucional (seguridad, arquitectura, infraestructura) tienen **prioridad absoluta**.

---

## 1. Resumen del Producto

Finanzas Personales es una PWA (Progressive Web App) **mobile-first** para gestión integral de finanzas individuales. Permite al usuario registrar transacciones, proyectar gastos futuros, sincronizar automáticamente movimientos bancarios desde emails, y monitorear su salud financiera en tiempo real.

### 1.1 Fuera de Alcance (Out of Scope)

Para evitar la sobre-ingeniería, **NO** se debe implementar lo siguiente:

- **No aplicaciones nativas:** El esfuerzo será 100% PWA. No se generará código para iOS/Android nativo.
- **No multi-usuario** *(en revisión)*: El sistema está diseñado para un único usuario propietario y esta spec (v1.x) no lo cambia. **Nota de roadmap (julio 2026):** existe la decisión de evolucionar a un modelo de **dos usuarios del hogar** (propietario + pareja) compartiendo las finanzas. Esa funcionalidad se especificará en una épica futura con su propia enmienda a `constitution.md` y nuevos spec/plan/tasks; mientras tanto, sigue fuera del alcance de esta versión. No se contempla multi-tenant abierto ni registro público.
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

### N8N-001 — Automatización Controlada
- **Nivel:** MUST (Obligatorio)
- **Restricción:** La sincronización desde emails DEBE ser on-demand (botón), no automática periódica.
- **Patrón:** Webhook de backend a N8N, N8N responde con datos parseados.
- **Justificación:** Control del usuario sobre cuándo sincronizar; evita sobrecarga de APIs.

### SEC-001 — Headers de Seguridad
- **Nivel:** MUST (Obligatorio)
- **Restricción:** Todas las respuestas HTTPS DEBEN incluir headers de seguridad estándar.
- **Patrón:** HSTS, CSP, X-Frame-Options, X-Content-Type-Options vía Caddy/Express.
- **Justificación:** Protección contra XSS, clickjacking, y ataques comunes.

### TEST-001 — Desarrollo Guiado por Pruebas (Test-First)
- **Nivel:** MUST (Obligatorio)
- **Restricción:** NINGUNA implementación de código se realiza sin una prueba previa que falle.
- **Patrón:** Ciclo Red-Green: (1) escribir prueba → (2) ejecutar y verificar que **falla** → (3) implementar el mínimo código para pasar → (4) ejecutar y verificar que **pasa**. Pruebas E2E con **Playwright**; unitarias con Jest/React Testing Library.
- **Justificación:** Garantiza que cada requerimiento del `spec.md` tenga cobertura verificable, previene regresiones en la funcionalidad existente (crítico al no haber staging), y documenta el comportamiento esperado.

---

## 4. Actores del Sistema

| Actor | Estado | Permisos |
|---|---|---|
| **Usuario Propietario** | Autenticado (JWT) | Lectura + Escritura completa. Gestiona todas sus finanzas. |

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

### 7.6 PWA Offline Sync (`/api/pwa`)
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
| Botón "Sync" on-demand, no automático | N8N-001 |
| Headers de seguridad en Caddy/Express | SEC-001 |

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

*Versión: 1.0.0*
*Última actualización: 2026-06-07*
