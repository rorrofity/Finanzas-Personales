# 💰 Finanzas Personales

Aplicación web para gestión de finanzas personales con React, Node.js, Express y PostgreSQL.

🌐 **Producción**: https://finanzas.rocketflow.cl

---

## ✨ Características Principales

- 🔐 **Autenticación** - Login local + Google OAuth
- 💳 **Transacciones** - Gestión de gastos/ingresos con categorías
- 📊 **Dashboard** - Visualización de finanzas con gráficos
- 📥 **Importación** - CSV/Excel desde bancos
- 🔁 **Compras en Cuotas** - Manejo de cuotas con proyección
- 🌍 **Transacciones Internacionales** - Soporte multi-moneda
- 📧 **Sincronización de Emails** - Importación automática desde Gmail (en desarrollo)

---

## 🚀 Inicio Rápido

```bash
# 1. Clonar repositorio
git clone <repo-url>
cd Finanzas-Personales

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# 4. Crear base de datos
createdb finanzas_personales

# 5. Ejecutar migraciones
npm run migrate

# 6. Iniciar en desarrollo
npm run dev
```

Abre: http://localhost:3000

---

## �� Documentación

### Configuración
- **[SETUP.md](./SETUP.md)** - Guía completa de configuración local y producción
  - Variables de entorno
  - Google OAuth
  - Base de datos
  - Troubleshooting

### Funcionalidades
- **[EMAIL_SYNC.md](./EMAIL_SYNC.md)** - Sincronización automática de emails
  - Overview del flujo
  - Configuración de N8N
  - Gmail API
  - Testing y deployment

### Deployment
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Guía de deployment a producción
  - Scripts automatizados
  - Deployment manual
  - Verificación
  - Rollback

---

## 🏗️ Tecnologías

**Frontend**
- React + Material-UI
- Axios + React Router
- Recharts (gráficos)

**Backend**
- Node.js + Express
- PostgreSQL
- JWT + Google OAuth
- PM2 (producción)

**Infraestructura**
- Digital Ocean Droplet
- Caddy (reverse proxy + SSL)
- N8N (automatización)
- Docker

---

## 📁 Estructura del Proyecto

```
Finanzas-Personales/
├── backend/
│   ├── routes/          # API endpoints
│   ├── controllers/     # Lógica de negocio
│   ├── config/          # Configuraciones
│   └── migrations/      # Migraciones de BD
├── src/
│   ├── components/      # Componentes React
│   ├── pages/           # Páginas
│   ├── contexts/        # Context API
│   └── utils/           # Utilidades
├── scripts/             # Scripts de deployment
├── SETUP.md             # Guía de configuración
├── EMAIL_SYNC.md        # Doc de sincronización
└── DEPLOYMENT.md        # Guía de deployment
```

---

## 🗄️ Base de Datos

### Tablas Principales

```sql
users                    -- Usuarios (local + Google OAuth)
categories               -- Categorías de transacciones
transactions             -- Transacciones principales
  └── metadata (JSONB)   -- Incluye email_id para sync
imports                  -- Registro de importaciones
installment_plans        -- Planes de cuotas
installment_occurrences  -- Ocurrencias de cuotas
intl_unbilled           -- Transacciones internacionales
checking_account        -- Cuenta corriente
```

Ver migraciones en: `backend/migrations/`

---

## 🔧 Scripts Disponibles

```bash
# Desarrollo
npm run dev              # Backend + Frontend simultáneo
npm run server           # Solo backend (nodemon)
npm run client           # Solo frontend

# Producción
npm start                # Backend en producción
npm run build            # Build del frontend

# Base de datos
npm run migrate          # Ejecutar migraciones

# Deployment
./scripts/deploy-to-production.sh           # Deploy automatizado
./scripts/deploy-to-production.sh --fresh-db  # Con BD fresca
```

---

## 🌟 Funcionalidades Destacadas

### Dashboard Financiero
- Resumen mensual de ingresos/gastos
- Gráficos interactivos (treemap, barras)
- Filtros por período y tarjeta
- Toggle de cuenta corriente

### Transacciones
- Gestión completa (CRUD)
- Categorización inline
- Filtros avanzados (tarjeta, tipo, período)
- Toggle "ocultar desestimados"

### Importación
- Soporte CSV y Excel (.xls, .xlsx)
- Templates configurables por banco
- Selección de banco y tarjeta
- Detección automática de formato

### Compras en Cuotas
- Crear planes de cuotas
- Proyección automática de meses futuros
- Edición individual de cuotas
- Eliminación selectiva o completa

### Sincronización de Emails (🚧 En desarrollo)
- Botón "Sincronizar Emails" en UI
- Integración con N8N + Gmail API
- Detección automática de duplicados
- Parsing inteligente de emails bancarios

---

## 🔐 Seguridad

- ✅ Autenticación JWT
- ✅ Google OAuth 2.0
- ✅ Headers de seguridad (Caddy)
- ✅ SSL/HTTPS automático (Let's Encrypt)
- ✅ Variables de entorno (.env no commiteado)
- ✅ Passwords hasheados (bcryptjs)

---

## 🚀 Producción

### Arquitectura

```
Caddy (80/443) - SSL Automático
  ├── finanzas.rocketflow.cl → Backend:3001
  └── rocketflow.cl → N8N:5678

Backend (PM2)
  ├── API REST
  └── Frontend (build estático)

PostgreSQL:5432
  └── finanzas_personales
```

### URLs

- **App**: https://finanzas.rocketflow.cl
- **N8N**: https://rocketflow.cl
- **Servidor**: 137.184.12.234

Ver detalles en [DEPLOYMENT.md](./DEPLOYMENT.md)

---

## 🐛 Troubleshooting

Ver sección de troubleshooting en:
- [SETUP.md](./SETUP.md#troubleshooting)
- [DEPLOYMENT.md](./DEPLOYMENT.md#troubleshooting)
- [EMAIL_SYNC.md](./EMAIL_SYNC.md#troubleshooting)

---

## 📝 Changelog

### v2.0 (En desarrollo)
- 🚧 Sincronización automática de emails

### v1.5 (Actual)
- ✅ Compras en cuotas
- ✅ Transacciones internacionales
- ✅ Filtros por tarjeta
- ✅ Dashboard mejorado

### v1.0
- ✅ Sistema base de transacciones
- ✅ Google OAuth
- ✅ Importación CSV/Excel
- ✅ Categorización

---

## 👤 Autor

Rodrigo Pizarro

## 📄 Licencia

MIT

---

**Última actualización**: 2025-10-28
