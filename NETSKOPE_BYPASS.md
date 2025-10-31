# 🔓 Bypass Netskope - Acceso a Producción

Guía rápida para acceder a la aplicación de producción cuando Netskope bloquea el acceso directo.

---

## 🚫 Problema

Netskope intercepta y bloquea el acceso a `https://finanzas.rocketflow.cl`

---

## ✅ Solución: Túnel SSH

### Paso 1: Crear Túnel

Abre una terminal y ejecuta:

```bash
ssh -L 5679:localhost:5678 root@137.184.12.234
```

**Dejar esta terminal abierta** (el túnel estará activo mientras la terminal esté abierta)

### Paso 2: Acceder a la Aplicación

Abre tu navegador en:

```
http://localhost:8080
```

✅ **La aplicación funcionará exactamente como en producción**

---

## 📝 ¿Cómo Funciona?

```
Tu Mac (localhost:8080)
    ↓ [Túnel SSH encriptado]
Servidor (137.184.12.234:3001)
    ↓
Aplicación de Producción
```

**Ventajas**:
- ✅ Netskope solo ve conexión SSH (permitida)
- ✅ Tráfico encriptado
- ✅ Sin configuraciones adicionales
- ✅ Funciona igual que producción

---

## 🔧 Comandos Útiles

### Túnel SSH básico
```bash
ssh -L 8080:localhost:3001 root@137.184.12.234
```

### Túnel en background (opcional)
```bash
ssh -f -N -L 8080:localhost:3001 root@137.184.12.234
```

**Flags**:
- `-f`: Pone SSH en background
- `-N`: No ejecuta comandos remotos
- `-L`: Local port forwarding

### Verificar túnel activo
```bash
# Ver procesos SSH
ps aux | grep ssh

# Verificar puerto local
lsof -i :8080
```

### Cerrar túnel en background
```bash
# Encontrar PID del proceso SSH
ps aux | grep "ssh -f -N -L 8080"

# Matar el proceso
kill <PID>
```

---

## 🧪 Testing

### 1. Health Check vía Túnel
```bash
curl http://localhost:8080/api/health
```

Debería responder:
```json
{
  "status": "healthy",
  "timestamp": "...",
  "database": "connected"
}
```

### 2. Login en la UI
1. Abrir: `http://localhost:8080`
2. Click en "Sign in with Google"
3. Login normal
4. ✅ Deberías ver tu Dashboard

### 3. Probar Sincronización de Emails
1. Ir a Dashboard
2. Click en "Sincronizar Emails"
3. ✅ Debería funcionar igual que en producción

---

## ⚠️ Notas Importantes

### Google OAuth
⚠️ **OAuth funciona con localhost** porque ya está configurado en Google Cloud Console:
- `http://localhost:3000` ✅
- `http://localhost:3001` ✅
- `http://localhost:8080` ✅ (cualquier puerto localhost)

### Cookies y Sesiones
- Las cookies se guardan para `localhost`
- La sesión persiste mientras no cierres el navegador
- Al cerrar el túnel, debes volver a iniciar sesión

### Múltiples Túneles
Si `8080` está ocupado, usa otro puerto:
```bash
ssh -L 9090:localhost:3001 root@137.184.12.234
# Acceder en: http://localhost:9090
```

---

## 🆘 Troubleshooting

### Error: "bind: Address already in use"

Puerto 8080 ya está ocupado:

```bash
# Ver qué está usando el puerto
lsof -i :8080

# Matar el proceso o usar otro puerto
ssh -L 9090:localhost:3001 root@137.184.12.234
```

### Error: "Connection refused"

Backend no está corriendo:

```bash
# Conectar al servidor
ssh root@137.184.12.234

# Verificar PM2
pm2 list
pm2 restart finanzas-backend
```

### Error: "Permission denied (publickey)"

No tienes la llave SSH:

```bash
# Copiar tu llave pública al servidor
ssh-copy-id root@137.184.12.234

# O especificar llave
ssh -i ~/.ssh/tu_llave -L 8080:localhost:3001 root@137.184.12.234
```

---

## 📚 Referencias

- [SETUP.md](./SETUP.md#acceso-bloqueado-por-netskope-producción) - Sección completa de troubleshooting
- [DEPLOYMENT.md](./DEPLOYMENT.md#paso-7-probar-la-aplicación) - Opciones de acceso post-deployment
- [EMAIL_SYNC.md](./EMAIL_SYNC.md#4-verificación-post-deployment) - Testing de sincronización

---

## 🌐 Acceder a la Aplicación Web de Finanzas

### Túnel SSH para la Aplicación Web

Si necesitas acceder a la aplicación de finanzas personales en producción:

```bash
ssh -L 8080:localhost:3001 root@137.184.12.234
```

**Acceder**:
- URL: `http://localhost:8080`
- Esto conecta tu puerto local 8080 al puerto 3001 del servidor (donde corre el backend que sirve el frontend)

**Mantener abierto** durante toda tu sesión de trabajo.

---

## 📋 Resumen de Túneles SSH

```bash
# Túnel 1: Acceso a N8N UI
ssh -L 5679:localhost:5678 root@137.184.12.234
# Acceder: http://localhost:5679

# Túnel 2: Acceso a Aplicación Web de Finanzas
ssh -L 8080:localhost:3001 root@137.184.12.234
# Acceder: http://localhost:8080

# Túnel 3: Túnel Inverso (para testing N8N → Backend Local)
ssh -R 80:localhost:3001 localhost.run
# N8N puede enviar requests al backend local via URL generada
```

---

**Última actualización**: 2025-10-31


