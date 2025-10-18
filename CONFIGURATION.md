# ⚙️ Guía de Configuración - Finanzas Personales

Esta guía documenta todas las configuraciones del proyecto en ambientes de desarrollo y producción.

⚠️ **NOTA IMPORTANTE DE SEGURIDAD**:  
Esta documentación usa **placeholders** genéricos para secretos y passwords. Los valores reales están configurados en tu archivo `.env` local (que NO se commitea al repositorio). Para obtener los valores reales de Google OAuth, consulta [GOOGLE_OAUTH_SETUP.md](./GOOGLE_OAUTH_SETUP.md).

---

## 📋 Tabla de Contenidos

1. [Variables de Entorno](#variables-de-entorno)
2. [Base de Datos](#base-de-datos)
3. [Google OAuth](#google-oauth)
4. [Servidor de Producción](#servidor-de-producción)
5. [Scripts de Deployment](#scripts-de-deployment)
6. [Troubleshooting](#troubleshooting)

---

## 🔐 Variables de Entorno

### Ubicación de Archivos `.env`

⚠️ **IMPORTANTE**: El archivo `.env` debe estar en la **raíz del proyecto**, NO en `/backend/`:

```
Finanzas-Personales/
├── .env                    ← AQUÍ (producción/desarrollo backend)
├── .env.development        ← Frontend development
├── .env.example           ← Template
└── backend/
    └── server.js          ← Lee ../.env
```

**Razón**: El `server.js` carga el `.env` así:
```javascript
dotenv.config({ path: path.join(__dirname, '../.env') });
```

---

### Ambiente de Desarrollo (Local)

#### `.env` (raíz del proyecto - Backend)

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=finanzas_personales
DB_USER=rpizarro                    # Tu usuario local de PostgreSQL
DB_PASSWORD=admin123                # Tu password local

# Server Configuration
PORT=3001
JWT_SECRET=finanzas_secret_key_2024

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Environment
NODE_ENV=development
```

#### `.env.development` (raíz del proyecto - Frontend)

```bash
PORT=3000

# Google OAuth - Frontend
REACT_APP_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
```

---

### Ambiente de Producción

#### `.env` (raíz del proyecto en servidor)

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=finanzas_personales
DB_USER=finanzas_user
DB_PASSWORD=your_secure_password

# Server Configuration
PORT=3001
JWT_SECRET=your_jwt_secret_generated_with_openssl

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Frontend
FRONTEND_URL=https://finanzas.rocketflow.cl

# Environment
NODE_ENV=production
```

**Ubicación en servidor**: `/var/www/finanzas-personales/.env`

---

## 🗄️ Base de Datos

### Configuración Local (Desarrollo)

#### PostgreSQL Local

```bash
# Usuario de desarrollo
Usuario: rpizarro
Password: admin123
Base de datos: finanzas_personales
Host: localhost
Puerto: 5432
```

#### Crear Base de Datos Local

```bash
# Conectar a PostgreSQL
psql -U postgres

# Crear base de datos
CREATE DATABASE finanzas_personales;

# Crear usuario (si no existe)
CREATE USER rpizarro WITH PASSWORD 'admin123';

# Dar permisos
GRANT ALL PRIVILEGES ON DATABASE finanzas_personales TO rpizarro;
```

#### Ejecutar Migraciones Local

```bash
cd /Users/rpizarro/CascadeProjects/Finanzas-Personales/backend/migrations

# Ejecutar en orden
psql -U rpizarro -d finanzas_personales < 00_init_schema.sql
psql -U rpizarro -d finanzas_personales < 01_create_users_table.sql
# ... continuar con todas las migraciones
```

---

### Configuración de Producción

#### PostgreSQL en Servidor

```bash
# Usuario de producción
Usuario: finanzas_user
Password: FinanzasSecure2024!
Base de datos: finanzas_personales
Host: localhost
Puerto: 5432
IP Servidor: 137.184.12.234
```

#### Configuración Inicial (Ya completado)

```bash
# Conectar al servidor
ssh root@137.184.12.234

# Crear usuario y base de datos
sudo -u postgres psql << 'EOF'
CREATE DATABASE finanzas_personales;
CREATE USER finanzas_user WITH PASSWORD 'FinanzasSecure2024!';
GRANT ALL PRIVILEGES ON DATABASE finanzas_personales TO finanzas_user;
EOF

# Dar permisos sobre tablas
sudo -u postgres psql finanzas_personales << 'EOF'
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO finanzas_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO finanzas_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO finanzas_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO finanzas_user;
GRANT USAGE ON SCHEMA public TO finanzas_user;
EOF
```

#### Verificar Conexión

```bash
# Probar conexión
PGPASSWORD='FinanzasSecure2024!' psql -h localhost -U finanzas_user -d finanzas_personales -c "SELECT 1;"
```

---

### Schema de Base de Datos

#### Estructura de Tablas

**Tabla `transactions`** (12 columnas):
```sql
- id (uuid)
- user_id (uuid)
- fecha (date)
- descripcion (varchar)
- monto (numeric)
- categoria (varchar)
- tipo (varchar)
- cuotas (integer)          ← Agregada en producción
- created_at (timestamp)
- updated_at (timestamp)
- import_id (uuid)
- category_id (integer)
```

**Otras tablas**:
- `users` - Usuarios del sistema
- `categories` - Categorías de transacciones
- `imports` - Registro de importaciones
- `checking_balances` - Saldos de cuenta corriente
- `checking_transactions` - Transacciones de cuenta corriente
- `projected_templates` - Plantillas de transacciones proyectadas
- `projected_occurrences` - Ocurrencias de transacciones proyectadas
- `installment_plans` - Planes de cuotas
- `installment_occurrences` - Ocurrencias de cuotas
- `intl_unbilled` - Transacciones internacionales no facturadas

---

## 🔑 Google OAuth

### Configuración en Google Cloud Console

1. **Proyecto**: Finanzas Personales
2. **Client ID**: Configurado en Google Cloud Console
3. **Client Secret**: Configurado en `.env`

### URIs Autorizados

#### JavaScript Origins (Authorized JavaScript origins)

```
http://localhost:3000
http://localhost:3001
https://finanzas.rocketflow.cl
```

#### Redirect URIs (Authorized redirect URIs)

```
http://localhost:3000
http://localhost:3001
https://finanzas.rocketflow.cl
https://finanzas.rocketflow.cl/auth/google/callback
```

### Configurar en Google Cloud Console

1. Ve a: https://console.cloud.google.com/apis/credentials
2. Selecciona tu OAuth 2.0 Client ID
3. Agrega los URIs mencionados arriba
4. Guarda los cambios

---

## 🖥️ Servidor de Producción

### Información del Servidor

```bash
Proveedor: Digital Ocean
IP: 137.184.12.234
OS: Ubuntu 22.04 LTS
RAM: 2GB
CPU: 1 vCPU
Disco: 25GB
```

### Dominios

```bash
Dominio principal: rocketflow.cl → N8N
Dominio app: finanzas.rocketflow.cl → Aplicación de Finanzas
```

### Arquitectura

```
Internet → Caddy (puerto 80/443)
              ↓
    ┌─────────┴─────────┐
    ↓                   ↓
N8N:5678          Backend:3001 (PM2)
(Docker)               ↓
                 PostgreSQL:5432
```

### Servicios Corriendo

#### 1. Caddy (Reverse Proxy)

```bash
# Contenedor Docker
Nombre: n8n-docker-caddy-caddy-1
Puerto: 80, 443
SSL: Automático (Let's Encrypt)
```

**Caddyfile**:
```caddyfile
rocketflow.cl {
    reverse_proxy n8n:5678 {
      flush_interval -1
    }
}

finanzas.rocketflow.cl {
    reverse_proxy host.docker.internal:3001
}
```

#### 2. N8N (Automatización)

```bash
# Contenedor Docker
Nombre: n8n-docker-caddy-n8n-1
Puerto Interno: 5678
URL: https://rocketflow.cl
```

#### 3. Backend (Node.js/Express)

```bash
# PM2 Process
Nombre: finanzas-backend
Puerto: 3001
Ubicación: /var/www/finanzas-personales/backend
Comando: pm2 start server.js --name finanzas-backend
```

**Ver estado**:
```bash
pm2 status
pm2 logs finanzas-backend
pm2 restart finanzas-backend
```

#### 4. PostgreSQL

```bash
Puerto: 5432
Base de datos: finanzas_personales
Usuario: finanzas_user
```

---

## 🚀 Scripts de Deployment

### Scripts Disponibles

#### 1. `verify-environment.sh`

Verifica que el ambiente de producción esté correcto.

```bash
# Ejecutar en el servidor
bash /var/www/finanzas-personales/scripts/verify-environment.sh
```

**Verifica**:
- ✅ 12 columnas en `transactions` (incluyendo `cuotas`)
- ✅ Todas las tablas necesarias
- ✅ Archivos del backend
- ✅ PM2 corriendo
- ✅ Estado de Git

#### 2. `sync-migrations.sh`

Sincroniza archivos de migración desde local al servidor.

```bash
# Ejecutar desde tu Mac
cd /Users/rpizarro/CascadeProjects/Finanzas-Personales
./scripts/sync-migrations.sh
```

#### 3. `deploy-to-production.sh`

Script principal de deployment automatizado.

```bash
# Deployment normal (mantiene datos)
./scripts/deploy-to-production.sh

# Deployment con base de datos fresca
./scripts/deploy-to-production.sh --fresh-db
```

**Pasos que ejecuta**:
1. Push a GitHub
2. Pull en servidor
3. Instalar dependencias backend
4. Build frontend
5. Ejecutar migraciones
6. Reiniciar backend
7. Verificar ambiente

### Proceso Manual de Deployment

Si necesitas hacer deployment manual:

```bash
# 1. En tu Mac: Push cambios
git add .
git commit -m "feat: Nueva funcionalidad"
git push origin main

# 2. En el servidor: Pull cambios
ssh root@137.184.12.234
cd /var/www/finanzas-personales
git pull origin main

# 3. Instalar dependencias (si cambió package.json)
cd backend
npm install --production

# 4. Build frontend (si cambió código de React)
cd ../frontend
npm install
npm run build

# 5. Reiniciar backend
pm2 restart finanzas-backend

# 6. Ver logs
pm2 logs finanzas-backend --lines 30
```

---

## 🛠️ Troubleshooting

### Error: "password authentication failed for user finanzas_user"

**Causa**: El password en `.env` no coincide con PostgreSQL.

**Solución**:
```bash
# Verificar que el .env tiene el password correcto
cat /var/www/finanzas-personales/.env | grep DB_PASSWORD

# Actualizar password en PostgreSQL
sudo -u postgres psql << 'EOF'
ALTER USER finanzas_user WITH PASSWORD 'FinanzasSecure2024!';
EOF

# Reiniciar backend
pm2 delete finanzas-backend
cd /var/www/finanzas-personales/backend
pm2 start server.js --name finanzas-backend
pm2 save
```

---

### Error: "permission denied for table users"

**Causa**: El usuario no tiene permisos sobre las tablas.

**Solución**:
```bash
sudo -u postgres psql finanzas_personales << 'EOF'
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO finanzas_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO finanzas_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO finanzas_user;
GRANT USAGE ON SCHEMA public TO finanzas_user;
EOF

pm2 restart finanzas-backend
```

---

### Error: "column cuotas does not exist"

**Causa**: La base de datos en producción no tiene el schema actualizado.

**Solución**:
```bash
# Opción 1: Agregar la columna manualmente
sudo -u postgres psql finanzas_personales << 'EOF'
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cuotas INTEGER DEFAULT 1;
EOF

# Opción 2: Deployment completo con DB fresca
./scripts/deploy-to-production.sh --fresh-db
```

---

### Error: "Backend no carga el .env"

**Causa**: El `.env` está en `backend/` en lugar de la raíz.

**Solución**:
```bash
# Mover al lugar correcto
mv /var/www/finanzas-personales/backend/.env /var/www/finanzas-personales/.env

# Reiniciar backend
pm2 restart finanzas-backend
```

---

### Error: "502 Bad Gateway" en finanzas.rocketflow.cl

**Posibles causas y soluciones**:

1. **Backend no está corriendo**:
```bash
pm2 status
pm2 restart finanzas-backend
```

2. **Puerto incorrecto**:
```bash
# Verificar que el backend escucha en 3001
cat /var/www/finanzas-personales/.env | grep PORT
# Debe ser: PORT=3001
```

3. **Caddy no puede conectar**:
```bash
# Ver logs de Caddy
docker logs n8n-docker-caddy-caddy-1 --tail 50

# Verificar Caddyfile
docker exec n8n-docker-caddy-caddy-1 cat /etc/caddy/Caddyfile
```

---

### Error: Google OAuth "redirect_uri_mismatch"

**Causa**: El dominio no está autorizado en Google Cloud Console.

**Solución**:
1. Ve a: https://console.cloud.google.com/apis/credentials
2. Selecciona tu OAuth Client ID
3. Agrega `https://finanzas.rocketflow.cl` en:
   - Authorized JavaScript origins
   - Authorized redirect URIs
4. Guarda los cambios
5. Espera 5-10 minutos para que se propague

---

## 📊 Comandos Útiles

### Servidor

```bash
# Conectar al servidor
ssh root@137.184.12.234

# Ver recursos
htop
df -h

# Ver logs del sistema
journalctl -f
```

### PM2

```bash
# Estado de procesos
pm2 status

# Ver logs
pm2 logs finanzas-backend
pm2 logs finanzas-backend --lines 50

# Reiniciar
pm2 restart finanzas-backend

# Monitoreo
pm2 monit

# Guardar configuración
pm2 save
```

### PostgreSQL

```bash
# Conectar a la base de datos
sudo -u postgres psql finanzas_personales

# Verificar tablas
\dt

# Ver estructura de transactions
\d transactions

# Contar registros
SELECT COUNT(*) FROM transactions;

# Salir
\q
```

### Docker (Caddy/N8N)

```bash
# Ver contenedores
docker ps

# Logs de Caddy
docker logs n8n-docker-caddy-caddy-1 --tail 50

# Logs de N8N
docker logs n8n-docker-caddy-n8n-1 --tail 50

# Reiniciar Caddy
docker restart n8n-docker-caddy-caddy-1
```

### Git

```bash
# Ver estado
git status

# Ver último commit
git log -1 --oneline

# Ver cambios
git diff

# Ver rama actual
git branch
```

---

## 🔐 Seguridad

### Variables Sensibles

**NUNCA commitees** estos archivos:
- `.env`
- `backend/.env`
- Cualquier archivo con passwords o secrets

**Archivos seguros para commitear**:
- `.env.example` ✅
- `.env.development` ✅ (si no tiene secrets de producción)

### Generar Secrets Seguros

```bash
# JWT Secret
openssl rand -base64 32

# Password seguro
openssl rand -base64 16
```

### Backup de Configuración

```bash
# Backup del .env (LOCAL SOLAMENTE)
cp .env .env.backup.$(date +%Y%m%d)

# En el servidor (NUNCA descargar a local)
sudo cp /var/www/finanzas-personales/.env /root/.env.backup.$(date +%Y%m%d)
```

---

## 📚 Referencias

- [Documentación de Deployment](./DEPLOYMENT.md)
- [Documentación de Deployment Automatizado](./DEPLOYMENT_PROCESS.md)
- [Configuración de Google OAuth](./GOOGLE_OAUTH_SETUP.md)
- [Guía de Desarrollo](./DEVELOPMENT.md)

---

**Última actualización**: 2025-10-18
