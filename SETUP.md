# ⚙️ Guía de Configuración - Finanzas Personales

Guía completa para configurar el proyecto en local y producción.

---

## 📋 Contenido

1. [Configuración Inicial](#configuración-inicial)
2. [Variables de Entorno](#variables-de-entorno)
3. [Base de Datos](#base-de-datos)
4. [Google OAuth](#google-oauth)
5. [Producción](#producción)

---

## 🚀 Configuración Inicial

### Pre-requisitos

- Node.js (v16+)
- PostgreSQL (v13+)
- npm o yarn

### Instalación

```bash
# 1. Clonar repositorio
git clone <repo-url>
cd Finanzas-Personales

# 2. Instalar dependencias
npm install

# 3. Crear base de datos
createdb finanzas_personales

# 4. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores

# 5. Ejecutar migraciones
npm run migrate

# 6. Iniciar desarrollo
npm run dev
```

---

## 🔐 Variables de Entorno

### Ubicación de Archivos

⚠️ **IMPORTANTE**: El `.env` debe estar en la **raíz del proyecto**:

```
Finanzas-Personales/
├── .env                    ← Backend (desarrollo y producción)
├── .env.example           ← Template
└── backend/
    └── server.js          ← Lee ../.env
```

### Ambiente de Desarrollo

Crear `.env` en la raíz:

```bash
# Base de datos
DB_HOST=localhost
DB_PORT=5432
DB_NAME=finanzas_personales
DB_USER=tu_usuario
DB_PASSWORD=tu_password

# Servidor
PORT=3001
NODE_ENV=development
JWT_SECRET=clave_secreta_local_segura

# Google OAuth (obtener de Google Cloud Console)
GOOGLE_CLIENT_ID=tu_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=tu_client_secret

# Frontend (opcional, por defecto localhost:3000)
FRONTEND_URL=http://localhost:3000
```

### Ambiente de Producción

En el servidor (mismo formato):

```bash
# Base de datos
DB_HOST=localhost
DB_PORT=5432
DB_NAME=finanzas_personales
DB_USER=finanzas_user
DB_PASSWORD=password_seguro_produccion

# Servidor
PORT=3001
NODE_ENV=production
JWT_SECRET=clave_secreta_produccion_muy_segura

# Google OAuth
GOOGLE_CLIENT_ID=tu_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=tu_client_secret

# Frontend
FRONTEND_URL=https://finanzas.rocketflow.cl
```

---

## 🗄️ Base de Datos

### Crear Base de Datos Local

```bash
# Crear base de datos
createdb finanzas_personales

# O con psql
psql -U postgres
CREATE DATABASE finanzas_personales;
\q
```

### Ejecutar Migraciones

```bash
npm run migrate
```

### Estructura Principal

```sql
-- Usuarios
users (id, nombre, email, password, google_id, created_at)

-- Transacciones
transactions (
  id, user_id, fecha, descripcion, monto,
  tipo, categoria, cuotas, import_id,
  metadata JSONB,  -- Para email_id y otros
  created_at, updated_at
)

-- Importaciones
imports (id, user_id, provider, network, product_type, created_at)

-- Categorías
categories (id, name, user_id, is_global, created_at)

-- Cuenta corriente
checking_account (user_id, initial_balance, updated_at)

-- Compras en cuotas
installment_plans (id, user_id, descripcion, total_amount, ...)
installment_occurrences (id, plan_id, year, month, ...)

-- Transacciones internacionales
intl_unbilled (id, user_id, fecha, descripcion, amount_usd, ...)
```

---

## 🔐 Google OAuth

### 1. Crear Proyecto en Google Cloud

1. Ir a: https://console.cloud.google.com/
2. Crear nuevo proyecto: "Finanzas Personales"
3. Seleccionar el proyecto creado

### 2. Habilitar APIs

1. Ir a: **APIs y servicios** → **Biblioteca**
2. Buscar y habilitar: **Google+ API** o **Google Identity**

### 3. Configurar Pantalla de Consentimiento

1. **APIs y servicios** → **Pantalla de consentimiento OAuth**
2. Tipo: **Externo** (o Interno si tienes Google Workspace)
3. Completar:
   - Nombre: Finanzas Personales
   - Email de soporte: tu email
   - Dominios autorizados: `localhost` (desarrollo)
4. Scopes necesarios:
   - `email`
   - `profile`
   - `openid`

### 4. Crear Credenciales OAuth

1. **APIs y servicios** → **Credenciales**
2. **Crear credenciales** → **ID de cliente de OAuth 2.0**
3. Tipo: **Aplicación web**
4. Configurar:

**Para Desarrollo:**
```
Nombre: Finanzas Dev
URIs autorizados: http://localhost:3000
URIs de redirección: http://localhost:3000
```

**Para Producción:**
```
Nombre: Finanzas Prod
URIs autorizados: https://finanzas.rocketflow.cl
URIs de redirección: https://finanzas.rocketflow.cl
```

5. Copiar **Client ID** y **Client Secret** al `.env`

### 5. Configurar Frontend

El frontend ya está configurado en `src/index.js`:

```javascript
<GoogleOAuthProvider clientId={process.env.REACT_APP_GOOGLE_CLIENT_ID}>
  <App />
</GoogleOAuthProvider>
```

Solo necesitas crear `.env.development` en la raíz:

```bash
REACT_APP_GOOGLE_CLIENT_ID=tu_client_id.apps.googleusercontent.com
```

---

## 🌐 Producción

### Arquitectura en Digital Ocean

```
IP: 137.184.12.234

Caddy (80/443) → SSL automático
  ├── rocketflow.cl → N8N (puerto 5678)
  └── finanzas.rocketflow.cl → Backend (puerto 3001)

Backend: Node.js + PM2
  - Proceso: finanzas-backend
  - Puerto: 3001
  - Sirve: Frontend build + API

PostgreSQL: Puerto 5432
N8N: Docker container en puerto 5678
```

### Servicios Corriendo

```bash
# Backend
pm2 list
pm2 logs finanzas-backend

# N8N
docker ps | grep n8n

# PostgreSQL
sudo systemctl status postgresql

# Caddy
sudo systemctl status caddy
```

### Archivo Caddyfile

```caddyfile
rocketflow.cl {
  reverse_proxy localhost:5678
}

finanzas.rocketflow.cl {
  reverse_proxy localhost:3001
  header {
    Strict-Transport-Security "max-age=31536000;"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "SAMEORIGIN"
  }
}
```

---

## 🔧 Troubleshooting

### Error: "Cannot connect to database"

```bash
# Verificar que PostgreSQL esté corriendo
# Mac
brew services list

# Linux
sudo systemctl status postgresql

# Verificar conexión
psql -U tu_usuario -d finanzas_personales -h localhost
```

### Error: "Google OAuth not working"

1. Verificar que `GOOGLE_CLIENT_ID` esté en `.env`
2. Verificar que el dominio esté autorizado en Google Cloud Console
3. Verificar que los scopes estén correctos
4. Limpiar cache del navegador

### Error: "Frontend cannot reach backend"

1. Verificar que backend esté en puerto 3001: `curl http://localhost:3001/api/health`
2. Verificar proxy en `package.json`: `"proxy": "http://localhost:3001"`
3. Reiniciar ambos servicios

### Logs Útiles

```bash
# Backend local
npm run server

# Backend producción
pm2 logs finanzas-backend

# Base de datos
tail -f /var/log/postgresql/postgresql-13-main.log
```

---

## ✅ Verificación Final

Después de configurar todo, verifica:

```bash
# 1. Backend health check
curl http://localhost:3001/api/health

# 2. Frontend carga
open http://localhost:3000

# 3. Login funciona
# Probar con Google OAuth

# 4. Base de datos conectada
psql -U tu_usuario -d finanzas_personales -c "SELECT COUNT(*) FROM users;"
```

Si todo funciona: ✅ **Configuración completa!**

---

**Última actualización**: 2025-10-28
