# Finanzas Personales - Aplicación Web

Una aplicación web completa para el seguimiento y gestión de finanzas personales, construida con React, Node.js, Express y PostgreSQL.

## Características

- Autenticación de usuarios
- Gestión de transacciones financieras
- Sistema de categorización avanzado
- Importación de transacciones desde CSV
- Visualización de datos financieros
- Análisis de gastos e ingresos
- Soporte para categorías globales y personalizadas
- Interfaz intuitiva con edición inline

## Importación de Estados de Cuenta

El sistema soporta la importación automática de estados de cuenta bancarios en diferentes formatos:

### Formatos Soportados

1. **Movimientos Facturados**
   - Formato: Excel (.xls, .xlsx)
   - Detecta automáticamente fechas, descripciones y montos
   - Clasificación automática de pagos y gastos

2. **Movimientos No Facturados**
   - Formato: Excel (.xls, .xlsx)
   - Procesamiento especial para la estructura específica del archivo
   - Soporte para múltiples hojas de cálculo

### Características de Importación

- Detección automática del tipo de archivo
- Validación de datos y formato
- Prevención de duplicados
- Procesamiento inteligente de fechas y montos
- Feedback detallado del proceso de importación
- Detección automática de pagos basada en montos negativos
- Cálculo preciso de deuda total considerando gastos y pagos

### Dashboard Financiero

- Resumen mensual de gastos, ingresos y pagos
- Cálculo automático de deuda total
- Visualización de tendencias financieras
- Gráficos interactivos de gastos por categoría
- Actualización en tiempo real de totales

## Tecnologías Utilizadas

### Frontend
- React
- Material-UI (MUI)
- Axios
- Recharts (para gráficos)
- React Router

### Backend
- Node.js
- Express
- PostgreSQL
- JWT para autenticación
- bcryptjs para encriptación
- csv-parse para procesamiento de CSV

## Estructura de la Base de Datos

### Tabla `users`
```sql
- id (UUID, PRIMARY KEY)
- nombre (VARCHAR)
- email (VARCHAR, UNIQUE)
- password (VARCHAR)
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
- tipo (VARCHAR) - 'ingreso' o 'gasto'
- cuotas (INTEGER)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

## Estructura del Proyecto

```
windsurf-project/
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
Crear un archivo `.env` en la raíz del proyecto:
```env
PORT=3001
NODE_ENV=development
JWT_SECRET=finanzas_secret_key_2024
DB_USER=postgres
DB_PASSWORD=admin123
DB_HOST=localhost
DB_PORT=5432
DB_NAME=finanzas_personales
```

### Instalación

1. Clonar el repositorio:
```bash
git clone [url-del-repositorio]
cd windsurf-project
```

2. Instalar dependencias:
```bash
# Instalar dependencias del backend
cd backend
npm install

# Instalar dependencias del frontend
cd ../
npm install
```

3. Configurar la base de datos:
```bash
# Ejecutar las migraciones en pgAdmin o usando psql
psql -U postgres -d finanzas_personales -f backend/migrations/categories.sql
```

4. Iniciar los servidores:
```bash
# Backend (Puerto 3001)
cd backend
npm run dev

# Frontend (Puerto 3000)
cd ../
npm start
```

## Documentación Adicional

Para más detalles sobre el desarrollo, arquitectura y decisiones técnicas, consulta el archivo [DEVELOPMENT.md](./DEVELOPMENT.md).

## Licencia

Este proyecto está bajo la Licencia MIT. Ver el archivo `LICENSE` para más detalles.
