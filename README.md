# Finanzas Personales - Aplicación Web

Una aplicación web completa para el seguimiento y gestión de finanzas personales, construida con React, Node.js, Express y PostgreSQL.

## Características

- **Autenticación de usuarios**
  - Login tradicional con email/password
  - **Google Sign-On** (OAuth 2.0)
  - Soporte para autenticación híbrida
- Gestión de transacciones financieras
- Sistema de categorización avanzado
- Importación de transacciones desde CSV/Excel
- Visualización de datos financieros
- Análisis de gastos e ingresos
- Soporte para categorías globales y personalizadas
- Interfaz intuitiva con edición inline
- Selector de período (Mes/Año) por extracto de tarjeta
- Selección de Banco y Tarjeta (Visa/Mastercard) al importar
- Filtro por período de importación en Dashboard y Transacciones
- Filtro por Tarjeta en listas de transacciones (TC): Visa/Mastercard/Todas, con persistencia por período en sessionStorage y conteo en títulos
- Toggle "Ocultar desestimados" en tablas TC; Internacionales homologado con paginación y toggle
- Toggle en Dashboard para incluir el saldo actual de Cuenta Corriente en la proyección del mes (aplica inmediato por período)
- Puedes colocar logos en `public/assets/cards/` con los nombres exactos:
  - Visa: `public/assets/cards/visa.png`
  - Mastercard: `public/assets/cards/mastercard.png`
- Recomendaciones: PNG con fondo transparente, alto ~28–36 px. Si los archivos no existen, la UI usará solo el color de marca.

#### Novedades recientes

### Compras en Cuotas (TC)
- Backend: Tablas `installment_plans` y `installment_occurrences` (migración `14_create_installment_plans.sql`).
- API:
  - `GET /api/installments/plans` — Listar planes.
  - `GET /api/installments/occurrences?year=YYYY&month=M` — Listar cuotas del mes.
  - `POST /api/installments/plans` — Crear compra en cuotas (materializa cuotas futuras).
  - `PUT /api/installments/plans/:planId` — Actualizar plan.
  - `PUT /api/installments/occurrences/:occurrenceId` — Actualizar una cuota.
  - `DELETE /api/installments/occurrences/:occurrenceId` — Eliminar una cuota puntual.
  - `DELETE /api/installments/plans/:planId?fromYear=YYYY&fromMonth=M` — Eliminar desde un mes en adelante.
- Frontend: Página `Compras en Cuotas (TC)` (`/installments`) y suma de cuotas del mes en Dashboard (Visa/MC + Consolidado).
  - Editar: modifica solo la occurrence del mes (override).
  - Eliminar (solo este mes): elimina la occurrence del mes.
  - Eliminar plantilla (desde este mes en adelante): borra la plantilla y todas sus repeticiones futuras; meses anteriores quedan como histórico.

### Filtros por Tarjeta y Homologación Internacionales (TC)
- Transacciones No Facturadas (Nacionales): Select "Tarjeta" (Todas/Visa/Mastercard) con persistencia por período en `sessionStorage` (`tcFilterCard::transactions::<YYYY-MM>`), conteo dinámico en título y paginación basada en el subconjunto filtrado. Toggle "Ocultar desestimados" aplicado al conjunto antes del filtro por tarjeta.
- Transacciones No Facturadas Internacionales: Homologado con Nacionales. Incluye paginación (`TablePagination`), toggle "Ocultar desestimados" y filtro de tarjeta con persistencia por período (`tcFilterCard::transactionsIntl::<YYYY-MM>`). Se muestran contadores coherentes con el subset filtrado.

### Dashboard: Saldo Cuenta Corriente (Snapshot)
- Toggle para incluir el saldo actual de Cuenta Corriente en la proyección de ingresos del mes. Aplica de inmediato sin confirmación y persiste por período en `sessionStorage` (`ccInclude::<YYYY-MM>`). Botón para recapturar snapshot.

Ubicación en la app
- Menú lateral: `Transacciones Proyectadas` (ruta `/projected-transactions`).
- La sección `Transacciones` corresponde a `Transacciones No Facturadas (TC)` nacionales y mantiene su ruta `/transactions`.

## Tecnologías Utilizadas

### Frontend
- React
- Material-UI (MUI)
- Axios
- Recharts (para gráficos)
- React Router
- @react-oauth/google (Google Sign-In)

### Backend
- Node.js
- Express
- PostgreSQL
- JWT para autenticación
- bcryptjs para encriptación
- Google OAuth 2.0
- csv-parse para procesamiento de CSV
- xlsx para procesamiento de Excel

## Estructura de la Base de Datos

### Tabla `users`
```sql
- id (UUID, PRIMARY KEY)
- nombre (VARCHAR)
- email (VARCHAR, UNIQUE)
- password (VARCHAR, nullable para usuarios de Google)
- auth_provider (VARCHAR) - 'local' | 'google'
- google_id (VARCHAR, UNIQUE)
- profile_picture (TEXT)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
- ultimo_inicio_sesion (TIMESTAMP)
```

### Tabla `categories`
```sql
- id (SERIAL, PRIMARY KEY)
- name (VARCHAR(50))
- description (TEXT)
- user_id (UUID, REFERENCES users(id))
- created_at (TIMESTAMP)
```

### Tabla `transactions`
```sql
- id (UUID, PRIMARY KEY)
- user_id (UUID, FOREIGN KEY)
- fecha (DATE)
- descripcion (TEXT)
- monto (DECIMAL)
- category_id (INTEGER, REFERENCES categories(id))
- tipo (VARCHAR) - 'ingreso' | 'gasto' | 'pago' | 'desestimar'
- cuotas (INTEGER)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

### Tabla `imports`
```sql
- id (UUID, PRIMARY KEY)
- user_id (UUID, FOREIGN KEY)
- provider (VARCHAR) – banco (p.ej., 'banco_chile', 'banco_cencosud')
- network (VARCHAR) – tarjeta (p.ej., 'visa', 'mastercard')
- product_type (VARCHAR)
- original_filename (TEXT)
- period_year (INTEGER)
- period_month (INTEGER)
- created_at (TIMESTAMP)
```

## Estructura del Proyecto

```
Finanzas-Personales/
├── backend/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── migrations/
│   └── server.js
├── src/
│   ├── components/
│   ├── contexts/
│   ├── layouts/
│   ├── pages/
│   └── App.js
├── public/
├── .env
├── README.md
└── DEVELOPMENT.md
```

## Configuración del Proyecto

### Requisitos Previos
- Node.js (v14 o superior)
- PostgreSQL (v12 o superior)
- npm o yarn

### Variables de Entorno

⚠️ **IMPORTANTE**: El archivo `.env` debe estar en la **raíz del proyecto**, NO en `/backend/`.

Crear un archivo `.env` en la raíz del proyecto:
```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=finanzas_personales
DB_USER=rpizarro
DB_PASSWORD=admin123

# Server Configuration
PORT=3001
JWT_SECRET=finanzas_secret_key_2024

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Environment
NODE_ENV=development
```

Crear/actualizar archivo `.env.development` en la raíz (frontend):
```env
PORT=3000

# Google OAuth - Frontend
REACT_APP_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
```

**Nota**: Para obtener el `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`, consulta la guía [GOOGLE_OAUTH_SETUP.md](./GOOGLE_OAUTH_SETUP.md).

**Para configuración de producción**, ver [CONFIGURATION.md](./CONFIGURATION.md).

### Instalación

1. Clonar el repositorio:
```bash
git clone [url-del-repositorio]
cd Finanzas-Personales
```

2. Instalar dependencias:
```bash
npm install
```

3. Configurar la base de datos:
```bash
# Ejecutar las migraciones del proyecto
npm run migrate
```

4. Iniciar los servidores:
```bash
# Ambos (backend en 3001 y frontend en 3000)
npm run dev
```

## Documentación Adicional

- **[CONFIGURATION.md](./CONFIGURATION.md)**: Guía completa de configuración (desarrollo y producción)
- **[DEPLOYMENT.md](./DEPLOYMENT.md)**: Guía de deployment a producción
- **[DEPLOYMENT_PROCESS.md](./DEPLOYMENT_PROCESS.md)**: Scripts automatizados de deployment
- **[DEVELOPMENT.md](./DEVELOPMENT.md)**: Guía de desarrollo, arquitectura y decisiones técnicas
- **[GOOGLE_OAUTH_SETUP.md](./GOOGLE_OAUTH_SETUP.md)**: Configuración paso a paso de Google Sign-On
- **[NETSKOPE_RESOLUTION.md](./NETSKOPE_RESOLUTION.md)**: Solución para bloqueos de Netskope y proxies corporativos

## Notas y Solución de Problemas

- Si cambias el `Mes/Año` en el `MonthPicker` y ves los mismos datos, reinicia el backend y verifica que el frontend envíe `periodYear` y `periodMonth` en las peticiones a `/api/transactions` y `/api/dashboard/summary`.
- Los extractos importados antes de esta versión no tienen `period_year/period_month`. Para que aparezcan al filtrar por período, vuelve a importar el extracto con el período correcto o aplica un backfill a la tabla `imports`.
- La UI por defecto propone el mes siguiente al actual en el diálogo de importación; puedes ajustarlo manualmente si tu extracto corresponde a otro período.

## Licencia

Este proyecto está bajo la Licencia MIT. Ver el archivo `LICENSE` para más detalles.
