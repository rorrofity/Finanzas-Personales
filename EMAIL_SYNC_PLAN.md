# 📧 Plan de Implementación: Sincronización Automática desde Gmail

**Fecha**: 2025-10-26  
**Objetivo**: Sincronizar transacciones bancarias automáticamente desde emails de Gmail

---

## 📋 Contexto de la Aplicación

### Arquitectura Actual en Producción
```
Digital Ocean (137.184.12.234)
├── Caddy (80/443) → SSL
│   ├── rocketflow.cl → N8N (5678)
│   └── finanzas.rocketflow.cl → Backend (3001)
├── Backend (PM2) → Node.js + Express + PostgreSQL
├── PostgreSQL (5432) → BD: finanzas_personales
└── N8N (Docker 5678) → Workflows de automatización
```

### Stack Tecnológico
- **Frontend**: React + Material-UI + Axios
- **Backend**: Node.js + Express + JWT + Google OAuth
- **BD**: PostgreSQL (transactions, imports, users)
- **Automatización**: N8N self-hosted

### Funcionalidades Actuales
- Importación manual desde Excel/CSV
- Transacciones No Facturadas (TC) con filtros
- Compras en Cuotas
- Dashboard con resumen financiero
- Sistema de categorización

### Schema Relevante
```sql
transactions (
  id uuid, user_id uuid, fecha date,
  descripcion varchar, monto numeric,
  tipo varchar, cuotas int,
  metadata jsonb -- {email_id, banco, tarjeta}
)
```

---

## 🎯 Objetivo de la Funcionalidad

**Flujo Deseado**:
1. Usuario → Click "Sincronizar" → Backend → N8N
2. N8N → Lee Gmail → Parsea transacciones → Backend
3. Backend → Valida + Guarda (sin duplicados) → Usuario
4. Resultado: "X transacciones nuevas importadas"

**Beneficios**:
- ✅ Tiempo: 5 min → 10 seg
- ✅ Información en tiempo real
- ✅ Cero errores manuales
- ✅ Base para futuras automatizaciones

---

## 🏗️ Arquitectura de la Solución

### Flujo Completo
```
Frontend → POST /api/transactions/sync-emails
    ↓
Backend → POST localhost:5678/webhook/sync
    ↓
N8N Workflow:
  1. Gmail Search (unread from banco)
  2. Get Full Message
  3. Parse (regex extract)
  4. Aggregate transactions
  5. POST localhost:3001/api/transactions/sync-save
    ↓
Backend → Validate + Save to PostgreSQL
    ↓
Frontend ← Response: {imported: X, skipped: Y}
```

### Comunicación Interna
- Frontend → Backend: HTTPS con JWT
- Backend → N8N: HTTP localhost:5678
- N8N → Gmail: OAuth 2.0
- Backend → PostgreSQL: localhost:5432

---

## 📝 Plan de Implementación

### **Fase 1: Gmail API Setup** ⏱️ 30 min

1. **Google Cloud Console**:
   - Crear proyecto: "Finanzas-N8N-Gmail"
   - Habilitar Gmail API
   - Crear OAuth 2.0 credentials
   - Scopes: `gmail.readonly` + `gmail.modify`
   - Redirect URI: `http://localhost:5678/rest/oauth2-credential/callback`

2. **N8N Credentials**:
   - Credentials → Gmail OAuth2
   - Client ID + Secret
   - Autorizar cuenta Gmail

**Verificación**: Test con Gmail node "Get Many" en workflow

---

### **Fase 2: N8N Workflow** ⏱️ 2-3 horas

**Workflow**: "Sync Bank Transactions from Gmail"

**Nodos**:
```
1. Webhook (/webhook/sync-bank-emails)
2. Set Variables (userId, timestamp, searchQuery)
3. Gmail: Search ("from:banco is:unread", max 50)
4. Loop Over Items
5. Gmail: Get Full Message
6. Code: Parse Email → Transaction
7. Filter: Valid only (_valid === true)
8. Aggregate: Collect all
9. HTTP POST: host.docker.internal:3001/sync-save
10. Respond to Webhook
```

**Parsing Logic** (Node 6):
```javascript
// Extraer headers y body del email
const from = getHeader('From');
const subject = getHeader('Subject');
const body = decodeBase64(payload.body.data);

// Detectar banco
let banco = from.includes('bancodechile') ? 'banco_chile' : 'santander';

// Regex patterns
const patterns = {
  banco_chile: {
    monto: /\$\s*([\d.,]+)/,
    descripcion: /en\s+([A-Z\s\d]+)/i
  }
};

// Extraer datos
const montoMatch = body.match(pattern.monto);
const monto = parseFloat(montoMatch[1].replace(/\./g, ''));

// Construir transacción
return {
  json: {
    fecha: new Date().toISOString().split('T')[0],
    descripcion: descMatch[1].trim(),
    monto: monto,
    tipo: 'gasto',
    banco: banco,
    email_id: $json.id,
    _valid: true
  }
};
```

---

### **Fase 3: Backend Routes** ⏱️ 2 horas

**Archivo**: `backend/routes/syncRoutes.js`

```javascript
const express = require('express');
const router = express.Router();
const axios = require('axios');
const authenticateToken = require('../middleware/auth');
const pool = require('../config/database');

// Endpoint principal (llamado por frontend)
router.post('/sync-emails', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  
  try {
    // Llamar N8N
    const n8nResponse = await axios.post(
      'http://localhost:5678/webhook/sync-bank-emails',
      { userId, timestamp: new Date().toISOString() },
      { timeout: 60000 }
    );
    
    res.json({
      success: true,
      message: `${n8nResponse.data.imported} transacciones importadas`,
      ...n8nResponse.data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error en sincronización',
      error: error.message
    });
  }
});

// Endpoint interno (llamado por N8N)
router.post('/sync-save', async (req, res) => {
  const { userId, transactions } = req.body;
  
  let imported = 0, skipped = 0;
  
  for (const txn of transactions) {
    // Verificar duplicado por email_id
    const exists = await pool.query(
      `SELECT id FROM transactions 
       WHERE user_id = $1 AND metadata->>'email_id' = $2`,
      [userId, txn.email_id]
    );
    
    if (exists.rows.length > 0) {
      skipped++;
      continue;
    }
    
    // Insertar transacción
    await pool.query(
      `INSERT INTO transactions 
       (id, user_id, fecha, descripcion, monto, tipo, cuotas, metadata)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 1, $6)`,
      [
        userId, txn.fecha, txn.descripcion, 
        txn.monto, txn.tipo,
        JSON.stringify({ email_id: txn.email_id, banco: txn.banco })
      ]
    );
    
    imported++;
  }
  
  res.json({ imported, skipped, errors: [] });
});

module.exports = router;
```

**Registrar en** `server.js`:
```javascript
const syncRoutes = require('./routes/syncRoutes');
app.use('/api/transactions', syncRoutes);
```

---

### **Fase 4: Frontend Button** ⏱️ 1 hora

**Archivo**: `src/components/SyncButton.jsx`

```jsx
import React, { useState } from 'react';
import { Button, CircularProgress, Snackbar, Alert } from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import axios from 'axios';

const SyncButton = ({ onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState({ open: false });

  const handleSync = async () => {
    setLoading(true);
    try {
      const res = await axios.post('/api/transactions/sync-emails');
      setNotification({
        open: true,
        message: res.data.message,
        severity: 'success'
      });
      onComplete?.();
    } catch (error) {
      setNotification({
        open: true,
        message: 'Error al sincronizar',
        severity: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="contained"
        color="primary"
        startIcon={loading ? <CircularProgress size={20} /> : <SyncIcon />}
        onClick={handleSync}
        disabled={loading}
      >
        {loading ? 'Sincronizando...' : 'Sincronizar Emails'}
      </Button>
      
      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={() => setNotification({ ...notification, open: false })}
      >
        <Alert severity={notification.severity}>
          {notification.message}
        </Alert>
      </Snackbar>
    </>
  );
};

export default SyncButton;
```

**Integrar en** `Dashboard.jsx`:
```jsx
import SyncButton from '../components/SyncButton';

// En el render
<SyncButton onComplete={() => fetchTransactions()} />
```

---

### **Fase 5: Testing** ⏱️ 2-3 horas

**Checklist**:
- [ ] N8N workflow ejecuta manualmente
- [ ] Gmail API conecta correctamente
- [ ] Parsing extrae datos correctos
- [ ] Backend guarda sin duplicados
- [ ] Frontend muestra resultado
- [ ] Error handling funciona

---

## 🎨 Mejoras Funcionales (Futuro)

### 1. **Preview antes de Importar** ⭐⭐⭐
- Modal con lista de transacciones encontradas
- Checkbox para seleccionar cuáles importar
- Botón "Confirmar"

### 2. **Sincronización Automática** ⭐⭐
- Cron en N8N (cada hora/día)
- Notificación push al usuario
- Badge "X nuevas transacciones"

### 3. **Configuración de Bancos** ⭐
- UI para agregar/remover remitentes
- Personalizar regex patterns
- Guardar en tabla `user_bank_configs`

### 4. **Logs de Auditoría** ⭐
- Tabla `sync_logs` (timestamp, status, count)
- UI para ver historial

### 5. **Categorización Inteligente** ⭐⭐
- ML para sugerir categorías
- Aprender de patrones previos

---

## 🔐 Consideraciones de Seguridad

1. **Gmail OAuth**: Scope mínimo (`gmail.readonly`)
2. **Webhook**: Considerar API key en producción
3. **Rate Limiting**: Max 1 sync cada 5 min por usuario
4. **Logging**: No loggear contenido de emails
5. **Error Messages**: No exponer detalles internos

---

## 📊 Estimación de Tiempo

| Fase | Tiempo |
|------|--------|
| Gmail API Setup | 30 min |
| N8N Workflow | 2-3 hrs |
| Backend Routes | 2 hrs |
| Frontend Button | 1 hr |
| Testing | 2-3 hrs |
| **TOTAL** | **7-9 hrs** |

---

## 🚀 Recomendación de Implementación

**Orden sugerido**:
1. ✅ Fase 1-4: MVP funcional
2. ✅ Mejora #1: Preview (UX crítico)
3. ⏳ Mejora #4: Logs (debugging)
4. ⏳ Mejora #2: Sync automático (opcional)

---

## 📚 Referencias

- [N8N Documentation](https://docs.n8n.io/)
- [Gmail API Reference](https://developers.google.com/gmail/api)
- [Regex Testing](https://regex101.com/)
- [CONFIGURATION.md](./CONFIGURATION.md) - Configuración del servidor
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Deployment en producción

---

**Última actualización**: 2025-10-26  
**Estado**: Plan aprobado, listo para implementación
