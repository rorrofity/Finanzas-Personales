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

### Ya Completado:
- ✅ Base de datos PostgreSQL creada
- ✅ Node.js 18.x instalado
- ✅ Repositorio clonado en `/var/www/finanzas-personales`
- ✅ Variables de entorno configuradas (`.env`)
- ✅ Dependencias instaladas
- ✅ Migraciones ejecutadas
- ✅ Backend corriendo con PM2
- ✅ Frontend buildeado
- ✅ Backend configurado para servir frontend

### Falta Completar:
- ⏳ Configurar Caddy para `finanzas.rocketflow.cl`
- ⏳ Configurar Google OAuth con dominio
- ⏳ Abrir puerto 3001 en firewall
- ⏳ Probar acceso a la aplicación

---

## 🔧 Pasos Finales en el Servidor

### **Paso 1: Actualizar Código desde GitHub**

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

### **Paso 6: Configurar Google OAuth**

1. Ve a: https://console.cloud.google.com/apis/credentials
2. Click en tu **OAuth 2.0 Client ID**
3. En **"Authorized JavaScript origins"**:
   - ✅ Agrega: `https://finanzas.rocketflow.cl`
   - ❌ Elimina: `http://localhost:3000` (opcional, solo si no desarrollas más en local)
4. En **"Authorized redirect URIs"**:
   - ✅ Agrega: `https://finanzas.rocketflow.cl`
5. Click **"Save"**

---

### **Paso 7: Probar la Aplicación**

Abre en tu navegador:

```
https://finanzas.rocketflow.cl
```

**✅ Deberías ver:**
- Tu aplicación cargando correctamente
- Sin errores de CORS
- Botón "Sign in with Google" funcionando

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

Una vez que todo funcione, podrás implementar el botón "Sync" que:

1. **Frontend** → `POST /api/transactions/sync-emails`
2. **Backend** → `POST http://localhost:5678/webhook/sync-emails` (N8N)
3. **N8N** → Procesa emails y responde con transacciones
4. **Backend** → Guarda transacciones en PostgreSQL
5. **Frontend** → Muestra resultado al usuario

**Ventajas:**
- ✅ Latencia cero (todo en mismo servidor)
- ✅ Sin necesidad de webhooks públicos
- ✅ Comunicación interna segura

---

## 📝 Comandos Útiles

```bash
# Ver logs del backend
pm2 logs finanzas-backend

# Reiniciar backend
pm2 restart finanzas-backend

# Ver estado de todos los procesos
pm2 status

# Ver logs de Caddy
docker logs n8n-docker-caddy-caddy-1 --tail 50

# Ver logs de N8N
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
- `DB_PASSWORD`
- `JWT_SECRET`
- `GOOGLE_CLIENT_ID`

### SSL/HTTPS
Caddy maneja automáticamente los certificados SSL con Let's Encrypt. No necesitas configurar nada adicional.

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

- [ ] Git pull ejecutado
- [ ] Backend reiniciado con cambios nuevos
- [ ] Caddyfile actualizado con `finanzas.rocketflow.cl`
- [ ] Caddy reloaded sin errores
- [ ] Puerto 3001 abierto en firewall
- [ ] Google OAuth configurado con dominio
- [ ] Aplicación accesible en `https://finanzas.rocketflow.cl`
- [ ] Login con Google funcionando
- [ ] Sin errores en logs (`pm2 logs`)

---

¡Deployment completado! 🎉
