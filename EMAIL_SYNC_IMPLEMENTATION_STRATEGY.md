# 🔄 Estrategia de Implementación: Sincronización de Emails

**Fecha de inicio**: 2025-10-27  
**Rama de trabajo**: `feature/email-sync`  
**Estado**: 🚧 En desarrollo

---

## 📋 Resumen Ejecutivo

Esta estrategia detalla cómo implementaremos la funcionalidad de sincronización automática de transacciones desde emails bancarios usando N8N, **sin impactar** los ambientes de producción y desarrollo actuales.

### Objetivos

- ✅ Sincronizar transacciones de tarjetas de crédito (Visa/Mastercard)
- ✅ Soportar movimientos no facturados nacionales e internacionales
- ✅ Integración con N8N para automatización
- ✅ Desarrollo aislado en rama feature
- ✅ Testing completo antes de merge a main
- ✅ Deployment controlado a producción

---

## 🌳 Estrategia de Branching

### Estructura de Ramas

```
main (producción estable)
  └── feature/email-sync (desarrollo de sincronización)
       ├── Commits incrementales
       ├── Testing local
       └── Preparación para merge
```

### Flujo de Trabajo

1. **Desarrollo en Feature Branch**
   ```bash
   git checkout -b feature/email-sync
   # Desarrollo iterativo con commits frecuentes
   ```

2. **Testing Local Completo**
   - Backend: Probar endpoints en local
   - Frontend: Probar UI en local
   - N8N: Crear y probar workflow local (si es posible)

3. **Merge a Main** (cuando esté listo)
   ```bash
   git checkout main
   git merge feature/email-sync
   git push origin main
   ```

4. **Deployment a Producción**
   - Usar script automatizado: `./scripts/deploy-to-production.sh`
   - Verificar funcionamiento
   - Monitorear logs

---

## 📦 Componentes a Implementar

### 1. Backend (Node.js/Express)

**Archivo nuevo**: `backend/routes/syncRoutes.js`

**Endpoints**:
- `POST /api/transactions/sync-emails` - Endpoint principal (frontend → backend)
- `POST /api/transactions/sync-save` - Endpoint interno (N8N → backend)

**Características**:
- ✅ Autenticación JWT
- ✅ Validación de duplicados por `email_id` en metadata
- ✅ Transacciones atómicas (BEGIN/COMMIT/ROLLBACK)
- ✅ Logging detallado para debugging
- ✅ Error handling robusto

**Integración en `server.js`**:
```javascript
const syncRoutes = require('./routes/syncRoutes');
app.use('/api/transactions', syncRoutes);
```

---

### 2. Frontend (React)

**Archivo nuevo**: `src/components/SyncButton.jsx`

**Características**:
- ✅ Botón con loading state
- ✅ Progress indicator (LinearProgress)
- ✅ Dialog de resultado con estadísticas
- ✅ Snackbar notifications
- ✅ Callback para refrescar datos

**Integración**:
- Dashboard principal: `src/pages/Dashboard.jsx`
- Página de transacciones: `src/pages/Transactions.jsx`
- Transacciones internacionales: `src/pages/TransactionsIntl.jsx`

---

### 3. N8N Workflow

**Nombre**: "Sync Bank Transactions from Gmail"

**Flujo**:
```
1. Webhook Trigger (/webhook/sync-bank-emails)
2. Gmail Search (unread emails from banco)
3. Loop: Process each email
4. Parse Email → Extract transaction data
5. Filter: Only valid transactions
6. Aggregate: Collect all transactions
7. HTTP Request: POST to backend sync-save
8. Response: Return statistics
```

**Configuración**:
- Gmail OAuth 2.0 credentials
- Webhook URL: `http://localhost:5678/webhook/sync-bank-emails` (local)
- Webhook URL: `https://rocketflow.cl/webhook/sync-bank-emails` (producción)

---

## 🔐 Consideraciones de Seguridad

### Datos Sensibles

- ❌ NO commitear credenciales de Gmail en código
- ✅ Usar N8N credentials vault para OAuth
- ✅ Webhook interno sin autenticación (localhost only)
- ✅ Rate limiting: 1 sync cada 5 min por usuario (futuro)

### Validación de Datos

- ✅ Validar estructura de transacciones desde N8N
- ✅ Sanitizar descripciones antes de guardar
- ✅ Verificar que `userId` existe antes de insertar
- ✅ Transacciones atómicas en PostgreSQL

---

## 🧪 Plan de Testing

### Fase 1: Testing de Componentes Aislados

**Backend**:
```bash
# Test endpoint sync-emails (mock de N8N)
curl -X POST http://localhost:3001/api/transactions/sync-emails \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Frontend**:
- Probar botón en Dashboard
- Verificar loading states
- Validar dialogs y notificaciones
- Probar refresh de datos

**N8N**:
- Crear workflow en N8N local (Docker)
- Ejecutar manualmente
- Verificar parsing de emails reales
- Ajustar regex patterns

---

### Fase 2: Testing de Integración

**Flujo completo**:
1. Usuario hace click en "Sincronizar"
2. Frontend → Backend (sync-emails)
3. Backend → N8N (webhook)
4. N8N → Gmail API
5. N8N → Backend (sync-save)
6. Backend → PostgreSQL
7. Respuesta → Frontend
8. UI actualizada

**Casos de prueba**:
- ✅ Transacciones nuevas se importan
- ✅ Transacciones duplicadas se omiten
- ✅ Errores se manejan correctamente
- ✅ UI refleja el resultado

---

### Fase 3: Testing de Edge Cases

- Email sin monto detectado
- Email con formato inesperado
- N8N no disponible
- Base de datos con error
- Usuario sin permisos
- Gmail sin emails nuevos

---

## 🚀 Plan de Deployment

### Ambiente Local (Desarrollo)

**Requisitos**:
- PostgreSQL local corriendo
- Backend en puerto 3001
- Frontend en puerto 3000
- N8N local (opcional): Docker en puerto 5678

**Setup N8N Local** (opcional):
```bash
docker run -d \
  --name n8n-local \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n
```

**Desarrollo iterativo**:
```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
npm start

# Terminal 3: N8N
# Acceder a http://localhost:5678
```

---

### Ambiente de Producción

**Pre-requisitos**:
- ✅ N8N ya está corriendo en producción (https://rocketflow.cl)
- ✅ Backend corriendo con PM2
- ✅ PostgreSQL configurado
- ✅ Gmail API credentials configurados en N8N

**Proceso de deployment**:

1. **Merge a main**:
   ```bash
   git checkout main
   git merge feature/email-sync
   git push origin main
   ```

2. **Deploy automatizado**:
   ```bash
   ./scripts/deploy-to-production.sh
   ```

3. **Configurar N8N en producción**:
   - Importar workflow JSON
   - Configurar credentials de Gmail
   - Activar workflow
   - Probar con webhook test

4. **Verificación post-deployment**:
   ```bash
   # Verificar backend
   curl https://finanzas.rocketflow.cl/api/health
   
   # Test del sync (requiere login)
   # Desde la UI: Click en "Sincronizar"
   ```

---

## 📊 Checklist de Implementación

### Backend

- [ ] Crear `backend/routes/syncRoutes.js`
- [ ] Implementar endpoint `/sync-emails`
- [ ] Implementar endpoint `/sync-save`
- [ ] Integrar en `server.js`
- [ ] Testing local con Postman/curl
- [ ] Logging y error handling

### Frontend

- [ ] Crear `src/components/SyncButton.jsx`
- [ ] Integrar en Dashboard
- [ ] Integrar en Transactions
- [ ] Testing de UI
- [ ] Validar loading states
- [ ] Probar dialogs y notificaciones

### N8N

- [ ] Crear workflow "Sync Bank Transactions"
- [ ] Configurar Gmail OAuth credentials
- [ ] Implementar parsing logic
- [ ] Testing con emails reales
- [ ] Ajustar regex patterns para bancos chilenos
- [ ] Exportar workflow JSON

### Testing

- [ ] Test backend endpoints
- [ ] Test frontend components
- [ ] Test N8N workflow
- [ ] Test integración completa
- [ ] Test edge cases
- [ ] Test detección de duplicados

### Documentación

- [ ] Actualizar README.md
- [ ] Documentar nuevos endpoints en API docs
- [ ] Guía de configuración de Gmail API
- [ ] Troubleshooting guide

### Deployment

- [ ] Merge a main
- [ ] Deploy a producción
- [ ] Configurar N8N producción
- [ ] Verificar funcionamiento
- [ ] Monitoreo post-deployment

---

## 📝 Notas de Desarrollo

### Cambios en la Base de Datos

**NO se requieren migraciones nuevas**. Usaremos:
- `transactions.metadata` (JSONB) para guardar:
  ```json
  {
    "email_id": "msg_123abc",
    "banco": "banco_chile",
    "tarjeta": "visa",
    "email_subject": "Compra por $45.990",
    "email_date": "2025-10-27T10:30:00Z",
    "source": "email_sync"
  }
  ```

### Detección de Duplicados

```sql
SELECT id FROM transactions 
WHERE user_id = $1 
AND metadata->>'email_id' = $2
```

Si existe, se omite (skipped++).

---

## 🔄 Iteraciones y Mejoras Futuras

### MVP (Esta implementación)
- ✅ Sincronización on-demand (botón)
- ✅ Tarjetas Visa y Mastercard
- ✅ Banco de Chile (inicialmente)
- ✅ Detección de duplicados

### Fase 2 (Futuro)
- ⏳ Preview de transacciones antes de importar
- ⏳ Sincronización automática (cron)
- ⏳ Soporte multi-banco (Santander, BCI, etc.)
- ⏳ Configuración de regex personalizables
- ⏳ Tabla de auditoría `sync_logs`

### Fase 3 (Futuro)
- ⏳ Categorización inteligente con ML
- ⏳ Notificaciones push
- ⏳ Dashboard de sincronización

---

## 🆘 Troubleshooting Anticipado

### Error: "N8N no disponible"
- Verificar que N8N está corriendo: `docker ps | grep n8n`
- Verificar puerto: `curl http://localhost:5678/healthz`

### Error: "Gmail API quota exceeded"
- Límite: 1 billón de queries/día (más que suficiente)
- Si ocurre: esperar 24 horas o contactar Google Cloud

### Error: "Duplicados no se detectan"
- Verificar que `metadata->>'email_id'` tiene valor
- Verificar que el index en JSONB funciona

### Error: "Parsing no funciona"
- Probar regex en https://regex101.com/
- Usar emails reales de prueba
- Ajustar patterns por banco

---

## 📞 Contactos y Referencias

### Documentación Relacionada
- [EMAIL_SYNC_PLAN.md](./EMAIL_SYNC_PLAN.md) - Plan original
- [EMAIL_SYNC_TECHNICAL.md](./EMAIL_SYNC_TECHNICAL.md) - Detalles técnicos
- [DEPLOYMENT_PROCESS.md](./DEPLOYMENT_PROCESS.md) - Deployment automatizado

### APIs y Servicios
- [N8N Documentation](https://docs.n8n.io/)
- [Gmail API](https://developers.google.com/gmail/api)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)

---

**Última actualización**: 2025-10-27  
**Estado**: 🚧 Rama feature creada, comenzando implementación  
**Responsable**: Equipo de desarrollo
