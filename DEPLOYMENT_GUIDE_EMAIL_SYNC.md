# 🚀 Guía de Deployment: Funcionalidad Email Sync

## 📋 Checklist Pre-Deployment

- [x] Backend routes implementadas
- [x] Frontend component creado
- [x] Rama feature/email-sync creada
- [ ] Testing local completo
- [ ] N8N workflow configurado
- [ ] Merge a main
- [ ] Deploy a producción

---

## 🧪 Testing Local

### 1. Instalar Dependencias

```bash
npm install
```

### 2. Iniciar Servicios

```bash
# Terminal 1: Backend
npm run server

# Terminal 2: Frontend  
npm run client
```

### 3. Probar Botón de Sync

1. Login en la app
2. Ir a Dashboard
3. Click en "Sincronizar Emails"
4. Verificar mensaje de error (esperado si N8N no está configurado)

---

## 🔄 Merge a Main

```bash
git checkout main
git merge feature/email-sync
git push origin main
```

---

## 🚀 Deploy a Producción

```bash
./scripts/deploy-to-production.sh
```

---

## 📝 Post-Deployment

1. Configurar N8N workflow en producción
2. Probar sincronización
3. Monitorear logs: `pm2 logs finanzas-backend`

---

**Última actualización**: 2025-10-27
