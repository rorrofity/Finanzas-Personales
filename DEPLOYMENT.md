# 🚀 Guía de Deployment - Finanzas Personales

## 📋 Resumen de la Arquitectura

```
┌─────────────────────────────────────────────┐
│  Caddy (puerto 80/443) - SSL Automático    │
│  ├─ rocketflow.cl → N8N (Docker)           │
│  └─ finanzas.rocketflow.cl → Backend       │
└─────────────────────────────────────────────┘
            ↓                    ↓
     N8N:5678 (Docker)    Backend:3001 (PM2)
                                 ↓
                          PostgreSQL:5432
```

---

## ✅ Estado Actual del Deployment

### ✅ Completado 100%:
- ✅ Base de datos PostgreSQL creada y configurada
- ✅ Node.js 18.x instalado
- ✅ Repositorio clonado en `/var/www/finanzas-personales`
- ✅ Variables de entorno configuradas (`.env` en raíz del proyecto)
- ✅ Dependencias instaladas
- ✅ Migraciones ejecutadas (schema con 12 columnas en transactions)
- ✅ Permisos de BD configurados para finanzas_user
- ✅ Backend corriendo con PM2 en puerto 3001
- ✅ Frontend buildeado y servido por el backend
- ✅ Caddy configurado para `finanzas.rocketflow.cl`
- ✅ Google OAuth funcionando con dominio
- ✅ SSL automático configurado (Let's Encrypt)
- ✅ Scripts de deployment automatizados creados

### 🌐 URLs Activas:
- **Aplicación**: https://finanzas.rocketflow.cl
- **N8N**: https://rocketflow.cl

### 📊 Credenciales de Producción:
- **Base de datos**: finanzas_personales
- **Usuario BD**: finanzas_user
- **Backend puerto**: 3001
- **Servidor**: 137.184.12.234

---

## 🔧 Pasos Finales en el Servidor

### **Opción A: Deployment Automatizado (Recomendado)**

Usa los scripts automatizados:

```bash
# Desde tu Mac
cd /Users/rpizarro/CascadeProjects/Finanzas-Personales

# Deployment normal (mantiene datos)
./scripts/deploy-to-production.sh

# Deployment con base de datos fresca
./scripts/deploy-to-production.sh --fresh-db
```

Ver [DEPLOYMENT_PROCESS.md](./DEPLOYMENT_PROCESS.md) para más detalles.

---

### **Opción B: Deployment Manual**

#### **Paso 1: Actualizar Código desde GitHub**

```bash
cd /var/www/finanzas-personales
git pull origin main
pm2 restart finanzas-backend
pm2 logs finanzas-backend --lines 20
```

**✅ Deberías ver:** `Servidor corriendo en puerto 3001`

---

### **Paso 2: Editar Caddyfile**

```bash
# Copiar Caddyfile actual del contenedor
docker exec n8n-docker-caddy-caddy-1 cat /etc/caddy/Caddyfile > /tmp/Caddyfile

# Editar el archivo
nano /tmp/Caddyfile
```

**Contenido del Caddyfile** (reemplaza todo):

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

**Guardar:** `Ctrl+O` → Enter → `Ctrl+X`

---

### **Paso 3: Aplicar Configuración de Caddy**

```bash
# Copiar Caddyfile al contenedor
docker cp /tmp/Caddyfile n8n-docker-caddy-caddy-1:/etc/caddy/Caddyfile

# Recargar Caddy (sin downtime)
docker exec n8n-docker-caddy-caddy-1 caddy reload --config /etc/caddy/Caddyfile

# Verificar que Caddy está OK
docker logs n8n-docker-caddy-caddy-1 --tail 20
```

**✅ Deberías ver:** Mensajes de reload exitoso, sin errores.

---

### **Paso 4: Abrir Puerto 3001 en Firewall**

```bash
# Permitir tráfico en puerto 3001
sudo ufw allow 3001/tcp

# Verificar reglas
sudo ufw status
```

---

### **Paso 5: Verificar Backend**

```bash
# Test directo al backend
curl http://localhost:3001/api/health

# Debería responder:
# {"status":"healthy","timestamp":"...","database":"connected"}
```

---

### **Paso 6: Configurar Google OAuth** ✅ (Ya Completado)

**Configuración actual**:

1. **Client ID**: Configurado en Google Cloud Console (ver CONFIGURATION.md)
2. **Client Secret**: Configurado en `.env` (ver CONFIGURATION.md)
3. **Authorized JavaScript origins**:
   - ✅ `http://localhost:3000` (desarrollo)
   - ✅ `http://localhost:3001` (desarrollo)
   - ✅ `https://finanzas.rocketflow.cl` (producción)
4. **Authorized redirect URIs**:
   - ✅ `http://localhost:3000` (desarrollo)
   - ✅ `http://localhost:3001` (desarrollo)
   - ✅ `https://finanzas.rocketflow.cl` (producción)
   - ✅ `https://finanzas.rocketflow.cl/auth/google/callback`

**Para modificar**: https://console.cloud.google.com/apis/credentials

---

### **Paso 7: Probar la Aplicación**

#### Opción A: Acceso Directo (sin Netskope)

Abre en tu navegador:

```
https://finanzas.rocketflow.cl
```

**✅ Deberías ver:**
- Tu aplicación cargando correctamente
- Sin errores de CORS
- Botón "Sign in with Google" funcionando

#### Opción B: Túnel SSH (bypass Netskope)

Si Netskope bloquea el acceso directo:

```bash
# Crear túnel SSH desde tu Mac
ssh -L 8080:localhost:3001 root@137.184.12.234

# Dejar terminal abierta (túnel activo)
```

**Acceder vía túnel**:
- Abrir navegador: `http://localhost:8080`
- Funciona como producción pero vía localhost
- Netskope no puede interceptar

**Explicación**:
- El puerto 8080 local → forward → puerto 3001 del servidor
- Tráfico encriptado por SSH
- Netskope solo ve conexión SSH (permitida)

---

## 🔍 Troubleshooting

### Error: "Cannot GET /"
**Causa:** Backend no está sirviendo el frontend  
**Solución:**
```bash
cd /var/www/finanzas-personales
pm2 restart finanzas-backend
pm2 logs finanzas-backend
```

### Error: "CORS policy"
**Causa:** CORS no permite el dominio  
**Solución:** Verificar que `.env` tenga `FRONTEND_URL=https://finanzas.rocketflow.cl`

### Error: "502 Bad Gateway"
**Causa:** Backend no está corriendo o Caddy no puede conectar  
**Solución:**
```bash
pm2 status  # Verificar que finanzas-backend esté "online"
docker logs n8n-docker-caddy-caddy-1
```

### Error: Google OAuth redirect_uri_mismatch
**Causa:** Dominio no está autorizado en Google Cloud Console  
**Solución:** Agregar `https://finanzas.rocketflow.cl` en Google OAuth settings

---

## 🎯 Integración con N8N

docker logs n8n-docker-caddy-n8n-1 --tail 50

# Actualizar código desde GitHub
cd /var/www/finanzas-personales
git pull
npm run build  # Si hay cambios en frontend
pm2 restart finanzas-backend
```

---

## 🔐 Seguridad

### Variables de Entorno Sensibles
**NUNCA** commitees el archivo `.env` al repositorio. Contiene:
- `DB_PASSWORD`: (Ver CONFIGURATION.md)
- `JWT_SECRET`: (Ver CONFIGURATION.md)
- `GOOGLE_CLIENT_SECRET`: (Ver CONFIGURATION.md)

**Ubicación correcta**: `/var/www/finanzas-personales/.env` (raíz del proyecto)

### SSL/HTTPS ✅
Caddy maneja automáticamente los certificados SSL con Let's Encrypt. No necesitas configurar nada adicional.

### Permisos de Base de Datos ✅
El usuario `finanzas_user` tiene todos los permisos necesarios sobre las tablas del schema public.

---

## 📊 Monitoreo

```bash
# Uso de memoria y CPU
htop

# Espacio en disco
df -h

# Ver uso de recursos por proceso
pm2 monit
```

---

## ✅ Checklist Final

- [x] Git pull ejecutado
- [x] Backend reiniciado con cambios nuevos
- [x] Caddyfile actualizado con `finanzas.rocketflow.cl`
- [x] Caddy reloaded sin errores
- [x] Puerto 3001 abierto en firewall
- [x] Google OAuth configurado con dominio
- [x] Aplicación accesible en `https://finanzas.rocketflow.cl`
- [x] Login con Google funcionando
- [x] Sin errores en logs (`pm2 logs`)
- [x] Base de datos con schema correcto (12 columnas en transactions)
- [x] Permisos de BD configurados correctamente
- [x] Scripts de deployment automatizados creados

### 📚 Documentación Relacionada

- [CONFIGURATION.md](./CONFIGURATION.md) - Configuración completa
- [DEPLOYMENT_PROCESS.md](./DEPLOYMENT_PROCESS.md) - Scripts automatizados
- [GOOGLE_OAUTH_SETUP.md](./GOOGLE_OAUTH_SETUP.md) - Setup de OAuth

---

¡Deployment completado! 🎉
