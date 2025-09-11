# Finanzas Personales - Aplicación Web

Una aplicación web completa para el seguimiento y gestión de finanzas personales, construida con React, Node.js, Express y PostgreSQL.

## Características

- Autenticación de usuarios
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

### Flujo de Importación con Período

1. Abre la página `Transacciones` y presiona `Importar CSV`.
2. Selecciona el archivo (CSV/XLS/XLSX).
3. Selecciona el `Banco` y, si corresponde, la `Tarjeta` (Visa/Mastercard para Banco de Chile).
4. Selecciona el `Mes` y `Año` del extracto. Por defecto se propone el mes siguiente al actual (ej.: si hoy es 5 de septiembre, propondrá octubre).
5. Importa. Todas las transacciones de ese archivo quedarán etiquetadas con ese período de extracto, y el Dashboard/Transacciones mostrarán datos según el `Mes/Año` seleccionado en el `MonthPicker`.

Nota: el filtrado se realiza por período de importación (no por la fecha individual de la transacción), lo que asegura que el período seleccionado en la UI coincida exactamente con el extracto subido.

### Dashboard Financiero

- Resumen mensual de gastos, ingresos y pagos
- Cálculo automático de deuda total
- Visualización de tendencias financieras
- Gráficos interactivos de gastos por categoría
- Actualización en tiempo real de totales

#### Tarjetas de Crédito (Visa / Mastercard)

- Bloque dedicado con métricas por tarjeta: Gastos del Mes, Pagos del Mes y Saldo neto del mes (Pagos − Gastos), excluyendo transacciones marcadas como `desestimar`.
- Se muestran 2 tarjetas: `Visa` y `Mastercard`. Los totales generales (Gastos/Pagos/Saldo) se mantienen en la sección superior.
- El cálculo responde al selector de período (Mes/Año) y a cambios inmediatos en la tabla de Transacciones.

Branding opcional (logos):
- Puedes colocar logos en `public/assets/cards/` con los nombres exactos:
  - Visa: `public/assets/cards/visa.png`
  - Mastercard: `public/assets/cards/mastercard.png`
- Recomendaciones: PNG con fondo transparente, alto ~28–36 px. Si los archivos no existen, la UI usará solo el color de marca.

#### Transacciones Proyectadas

- Permite crear y gestionar ingresos/gastos manuales (fuera de tarjeta) por Mes/Año.
- Campos: Nombre (3–60), Tipo (Ingreso/Gasto), Monto (>0), Día del mes (1–31; si el día no existe se usa el último día), Categoría (opcional), Notas (<=140), Estado (Activo/Inactivo), Repetir todos los meses (solo en creación).
- Listado por mes responde al selector `MonthPicker`. Las proyecciones inactivas no se consideran en los totales de la página.
- Repetición: si está ON, se materializa on‑demand solo el mes consultado; al editar un mes específico, el cambio aplica solo a ese mes (override) y no altera meses futuros ni pasados.
- Acciones disponibles en la lista:
  - Editar: modifica solo la occurrence del mes (override).
  - Eliminar (solo este mes): elimina la occurrence del mes.
  - Eliminar plantilla (desde este mes en adelante): borra la plantilla y todas sus repeticiones futuras; meses anteriores quedan como histórico.

Ubicación en la app
- Menú lateral: `Transacciones Proyectadas` (ruta `/projected-transactions`).
- La sección existente `Transacciones` fue renombrada visualmente a `Transacciones No Facturadas (TC)` y mantiene su ruta `/transactions`.

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
 - xlsx para procesamiento de Excel

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

Para más detalles sobre el desarrollo, arquitectura y decisiones técnicas, consulta el archivo [DEVELOPMENT.md](./DEVELOPMENT.md).

## Notas y Solución de Problemas

- Si cambias el `Mes/Año` en el `MonthPicker` y ves los mismos datos, reinicia el backend y verifica que el frontend envíe `periodYear` y `periodMonth` en las peticiones a `/api/transactions` y `/api/dashboard/summary`.
- Los extractos importados antes de esta versión no tienen `period_year/period_month`. Para que aparezcan al filtrar por período, vuelve a importar el extracto con el período correcto o aplica un backfill a la tabla `imports`.
- La UI por defecto propone el mes siguiente al actual en el diálogo de importación; puedes ajustarlo manualmente si tu extracto corresponde a otro período.

## Licencia

Este proyecto está bajo la Licencia MIT. Ver el archivo `LICENSE` para más detalles.
