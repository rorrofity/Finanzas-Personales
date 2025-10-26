# 🔧 Detalles Técnicos: Sincronización desde Gmail

Este documento complementa [EMAIL_SYNC_PLAN.md](./EMAIL_SYNC_PLAN.md) con implementación detallada de código.

---

## 📋 Índice

1. [N8N Workflow JSON Export](#n8n-workflow-json-export)
2. [Backend Routes Completo](#backend-routes-completo)
3. [Frontend Components](#frontend-components)
4. [Patrones de Parsing](#patrones-de-parsing)
5. [Testing Scripts](#testing-scripts)

---

## 🔄 N8N Workflow - Configuración Detallada

### Nodo de Parsing (JavaScript Function)

```javascript
/**
 * Parse Bank Email to Transaction
 * Extrae información de transacciones desde emails del banco
 */

// ===== HELPERS =====

function getHeader(headers, name) {
  const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
  return header ? header.value : '';
}

function decodeBase64(data) {
  if (!data) return '';
  try {
    const cleaned = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(cleaned, 'base64').toString('utf-8');
  } catch (e) {
    console.error('Error decoding base64:', e);
    return '';
  }
}

function extractBody(payload) {
  // Caso 1: Body directo
  if (payload.body && payload.body.data) {
    return decodeBase64(payload.body.data);
  }
  
  // Caso 2: Multipart
  if (payload.parts) {
    // Buscar text/plain primero
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body.data) {
        return decodeBase64(part.body.data);
      }
    }
    // Fallback a text/html
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body.data) {
        const html = decodeBase64(part.body.data);
        // Remover tags HTML básicos
        return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
      }
    }
  }
  
  return '';
}

function normalizeMonto(montoStr) {
  // "45.990" o "45,990" → 45990
  return parseFloat(montoStr.replace(/\./g, '').replace(',', '.'));
}

// ===== MAIN LOGIC =====

const payload = $json.payload;
const headers = payload.headers;
const internalDate = $json.internalDate;
const messageId = $json.id;

// Extraer info básica
const from = getHeader(headers, 'From');
const subject = getHeader(headers, 'Subject');
const body = extractBody(payload);
const date = new Date(parseInt(internalDate));

// Detectar banco
let banco = 'desconocido';
let bancoPatterns = null;

if (from.toLowerCase().includes('bancodechile') || from.toLowerCase().includes('banco de chile')) {
  banco = 'banco_chile';
} else if (from.toLowerCase().includes('santander')) {
  banco = 'santander';
} else if (from.toLowerCase().includes('bci')) {
  banco = 'bci';
} else if (from.toLowerCase().includes('scotiabank')) {
  banco = 'scotiabank';
}

// Patterns por banco
const patterns = {
  banco_chile: {
    monto: /\$\s*([\d.,]+)/,
    descripcion: /en\s+([A-Z\s\d\-]+?)(?:\s*por|\s*$)/i,
    tarjeta_visa: /visa/i,
    tarjeta_mastercard: /mastercard/i,
    tipo_compra: /compra|cargo/i,
    tipo_pago: /pago|abono/i,
    cuotas: /(\d+)\s*cuota/i
  },
  santander: {
    monto: /por\s*\$\s*([\d.,]+)|monto:\s*\$\s*([\d.,]+)/i,
    descripcion: /en\s+([A-Z\s\d\-]+?)(?:\s*por|\s*$)/i,
    tarjeta_visa: /visa/i,
    tarjeta_mastercard: /mastercard/i,
    tipo_compra: /compra|transacción/i,
    tipo_pago: /pago|abono/i,
    cuotas: /(\d+)\s*cuota/i
  }
};

bancoPatterns = patterns[banco] || patterns.banco_chile;

// ===== EXTRAER DATOS =====

// Monto
let monto = 0;
const montoMatch = body.match(bancoPatterns.monto) || subject.match(bancoPatterns.monto);
if (montoMatch) {
  const montoStr = montoMatch[1] || montoMatch[2];
  if (montoStr) {
    monto = normalizeMonto(montoStr);
  }
}

// Descripción
let descripcion = subject;
const descMatch = body.match(bancoPatterns.descripcion);
if (descMatch) {
  descripcion = descMatch[1].trim().substring(0, 100);
}

// Tarjeta
let tarjeta = 'visa'; // default
const fullText = (subject + ' ' + body).toLowerCase();
if (bancoPatterns.tarjeta_mastercard.test(fullText)) {
  tarjeta = 'mastercard';
}

// Tipo
let tipo = 'gasto'; // default
if (bancoPatterns.tipo_pago.test(fullText)) {
  tipo = 'pago';
  monto = -Math.abs(monto); // Pagos negativos
}

// Cuotas
let cuotas = 1;
const cuotasMatch = body.match(bancoPatterns.cuotas);
if (cuotasMatch) {
  cuotas = parseInt(cuotasMatch[1]);
}

// ===== VALIDACIÓN =====

let isValid = true;
let parseError = null;

if (monto === 0) {
  isValid = false;
  parseError = 'No se pudo extraer monto';
}

if (!descripcion || descripcion.length < 3) {
  isValid = false;
  parseError = 'Descripción inválida';
}

// ===== OUTPUT =====

return {
  json: {
    fecha: date.toISOString().split('T')[0],
    descripcion: descripcion,
    monto: tipo === 'pago' ? -Math.abs(monto) : Math.abs(monto),
    tipo: tipo,
    banco: banco,
    tarjeta: tarjeta,
    cuotas: cuotas,
    email_id: messageId,
    email_subject: subject,
    email_from: from,
    email_date: date.toISOString(),
    _valid: isValid,
    _parseError: parseError,
    _debug: {
      bodyLength: body.length,
      hasMontoMatch: !!montoMatch,
      hasDescMatch: !!descMatch
    }
  }
};
```

---

## 🔌 Backend Routes - Implementación Completa

### Archivo: `backend/routes/syncRoutes.js`

```javascript
const express = require('express');
const router = express.Router();
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const authenticateToken = require('../middleware/auth');
const pool = require('../config/database');

/**
 * POST /api/transactions/sync-emails
 * Endpoint principal llamado por el frontend
 * Orquesta la sincronización completa
 */
router.post('/sync-emails', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const startTime = Date.now();
  
  console.log(`📧 [${new Date().toISOString()}] Sync iniciado para usuario: ${userId}`);
  
  try {
    // Validar usuario
    const userCheck = await pool.query(
      'SELECT id, nombre FROM users WHERE id = $1',
      [userId]
    );
    
    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // Llamar a N8N
    let n8nResponse;
    try {
      console.log('🔄 Llamando a N8N webhook...');
      n8nResponse = await axios.post(
        'http://localhost:5678/webhook/sync-bank-emails',
        {
          userId: userId,
          timestamp: new Date().toISOString()
        },
        {
          timeout: 60000, // 60 segundos
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      console.log(`✅ N8N respondió: ${JSON.stringify(n8nResponse.data)}`);
    } catch (n8nError) {
      console.error('❌ Error llamando N8N:', n8nError.message);
      
      if (n8nError.code === 'ECONNREFUSED') {
        return res.status(503).json({
          success: false,
          message: 'N8N no disponible. Verifica que esté corriendo.',
          error: 'Service unavailable'
        });
      }
      
      return res.status(500).json({
        success: false,
        message: 'Error comunicándose con N8N',
        error: n8nError.message
      });
    }
    
    // Extraer resultado
    const result = n8nResponse.data || {};
    const imported = result.imported || 0;
    const skipped = result.skipped || 0;
    const errors = result.errors || [];
    
    const duration = Date.now() - startTime;
    
    // Log de auditoría (opcional)
    await logSyncEvent({
      userId,
      status: 'success',
      imported,
      skipped,
      errors: errors.length,
      duration
    });
    
    // Responder al frontend
    res.json({
      success: true,
      message: imported > 0 
        ? `Se importaron ${imported} transacciones nuevas` 
        : 'No se encontraron transacciones nuevas',
      imported: imported,
      skipped: skipped,
      errors: errors,
      duration: `${duration}ms`
    });
    
  } catch (error) {
    console.error('❌ Error en sincronización:', error);
    
    await logSyncEvent({
      userId,
      status: 'error',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      message: 'Error al sincronizar transacciones',
      error: error.message
    });
  }
});

/**
 * POST /api/transactions/sync-save
 * Endpoint interno llamado por N8N
 * Guarda transacciones en la BD
 */
router.post('/sync-save', async (req, res) => {
  const { userId, transactions } = req.body;
  
  console.log(`💾 Guardando ${transactions?.length || 0} transacciones para usuario: ${userId}`);
  
  if (!userId || !transactions || !Array.isArray(transactions)) {
    return res.status(400).json({
      success: false,
      message: 'Datos inválidos: se requiere userId y transactions[]'
    });
  }
  
  let imported = 0;
  let skipped = 0;
  let errors = [];
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    for (const txn of transactions) {
      try {
        // Verificar duplicado por email_id
        const duplicateCheck = await client.query(
          `SELECT id FROM transactions 
           WHERE user_id = $1 
           AND metadata->>'email_id' = $2
           LIMIT 1`,
          [userId, txn.email_id]
        );
        
        if (duplicateCheck.rows.length > 0) {
          skipped++;
          console.log(`⏭️  Duplicada: ${txn.descripcion} (${txn.email_id})`);
          continue;
        }
        
        // Crear ID de importación
        const importId = uuidv4();
        
        // Registrar en tabla imports
        await client.query(
          `INSERT INTO imports 
           (id, user_id, provider, network, product_type, created_at)
           VALUES ($1, $2, $3, $4, 'email_sync', NOW())`,
          [importId, userId, txn.banco || 'email', txn.tarjeta || 'unknown']
        );
        
        // Insertar transacción
        await client.query(
          `INSERT INTO transactions 
           (id, user_id, fecha, descripcion, monto, tipo, 
            categoria, cuotas, import_id, metadata, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
          [
            userId,
            txn.fecha,
            txn.descripcion,
            txn.monto,
            txn.tipo,
            'Sin categorizar', // categoría por defecto
            txn.cuotas || 1,
            importId,
            JSON.stringify({
              email_id: txn.email_id,
              banco: txn.banco,
              tarjeta: txn.tarjeta,
              email_subject: txn.email_subject,
              email_date: txn.email_date,
              source: 'email_sync'
            })
          ]
        );
        
        imported++;
        console.log(`✅ Importada: ${txn.descripcion} - $${txn.monto}`);
        
      } catch (txnError) {
        errors.push({
          transaction: txn.descripcion,
          error: txnError.message
        });
        console.error(`❌ Error guardando transacción:`, txnError);
      }
    }
    
    await client.query('COMMIT');
    
    console.log(`📊 Resultado: ${imported} importadas, ${skipped} duplicadas, ${errors.length} errores`);
    
    res.json({
      success: true,
      imported: imported,
      skipped: skipped,
      errors: errors
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error en transacción:', error);
    
    res.status(500).json({
      success: false,
      message: 'Error guardando transacciones',
      error: error.message
    });
  } finally {
    client.release();
  }
});

/**
 * Helper: Log de eventos de sincronización
 * (Opcional - crear tabla sync_logs si se quiere auditoría)
 */
async function logSyncEvent(event) {
  try {
    // Esto es opcional - requiere crear tabla sync_logs
    /*
    await pool.query(
      `INSERT INTO sync_logs 
       (id, user_id, status, imported, skipped, errors, duration, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())`,
      [
        event.userId,
        event.status,
        event.imported || 0,
        event.skipped || 0,
        event.errors || 0,
        event.duration || 0
      ]
    );
    */
    console.log('📝 Sync log:', event);
  } catch (error) {
    console.error('Error logging sync event:', error);
  }
}

module.exports = router;
```

### Registrar en `backend/server.js`

```javascript
// Agregar al final de las rutas existentes
const syncRoutes = require('./routes/syncRoutes');
app.use('/api/transactions', syncRoutes);
```

---

## 🎨 Frontend Components

### `src/components/SyncButton.jsx`

```jsx
import React, { useState } from 'react';
import {
  Button,
  CircularProgress,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  LinearProgress,
  Typography,
  Box
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import axios from 'axios';

const SyncButton = ({ onSyncComplete, variant = 'contained' }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notification, setNotification] = useState({
    open: false,
    message: '',
    severity: 'success'
  });
  const [resultDialog, setResultDialog] = useState({
    open: false,
    data: null
  });

  const handleSync = async () => {
    setLoading(true);
    setProgress(0);
    
    // Simular progreso mientras espera
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + 10;
      });
    }, 500);
    
    try {
      const response = await axios.post('/api/transactions/sync-emails');
      
      clearInterval(progressInterval);
      setProgress(100);
      
      const { imported, skipped, errors } = response.data;
      
      // Mostrar resultado
      setResultDialog({
        open: true,
        data: {
          imported,
          skipped,
          errors,
          message: response.data.message
        }
      });
      
      // Notificación
      setNotification({
        open: true,
        message: response.data.message || `${imported} transacciones importadas`,
        severity: imported > 0 ? 'success' : 'info'
      });
      
      // Callback para refrescar datos
      if (onSyncComplete && imported > 0) {
        setTimeout(() => onSyncComplete(), 1000);
      }
      
    } catch (error) {
      clearInterval(progressInterval);
      console.error('Error en sincronización:', error);
      
      setNotification({
        open: true,
        message: error.response?.data?.message || 'Error al sincronizar transacciones',
        severity: 'error'
      });
    } finally {
      setLoading(false);
      setTimeout(() => setProgress(0), 1000);
    }
  };

  const handleCloseDialog = () => {
    setResultDialog({ open: false, data: null });
  };

  return (
    <>
      <Button
        variant={variant}
        color="primary"
        startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <SyncIcon />}
        onClick={handleSync}
        disabled={loading}
        sx={{ minWidth: 200 }}
      >
        {loading ? 'Sincronizando...' : 'Sincronizar Emails'}
      </Button>
      
      {loading && (
        <Box sx={{ width: '100%', mt: 1 }}>
          <LinearProgress variant="determinate" value={progress} />
        </Box>
      )}
      
      {/* Notificación Toast */}
      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={() => setNotification({ ...notification, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          severity={notification.severity}
          onClose={() => setNotification({ ...notification, open: false })}
          variant="filled"
        >
          {notification.message}
        </Alert>
      </Snackbar>
      
      {/* Dialog de Resultado */}
      <Dialog
        open={resultDialog.open}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {resultDialog.data?.imported > 0 ? (
            <Box display="flex" alignItems="center" gap={1}>
              <CheckCircleIcon color="success" />
              Sincronización Exitosa
            </Box>
          ) : (
            <Box display="flex" alignItems="center" gap={1}>
              <SyncIcon color="primary" />
              Sincronización Completada
            </Box>
          )}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {resultDialog.data?.message}
          </DialogContentText>
          
          {resultDialog.data && (
            <Box mt={2}>
              <Typography variant="body2">
                ✅ <strong>{resultDialog.data.imported}</strong> transacciones nuevas
              </Typography>
              <Typography variant="body2">
                ⏭️ <strong>{resultDialog.data.skipped}</strong> duplicadas (omitidas)
              </Typography>
              {resultDialog.data.errors?.length > 0 && (
                <Typography variant="body2" color="error">
                  ❌ <strong>{resultDialog.data.errors.length}</strong> errores
                </Typography>
              )}
            </Box>
          )}
          
          <Button
            onClick={handleCloseDialog}
            variant="contained"
            fullWidth
            sx={{ mt: 3 }}
          >
            Cerrar
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SyncButton;
```

### Integración en Páginas

**En `src/pages/Dashboard.jsx`**:
```jsx
import SyncButton from '../components/SyncButton';

// En el header o toolbar
<Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
  <Typography variant="h4">Dashboard Financiero</Typography>
  <SyncButton onSyncComplete={() => {
    fetchSummary();
    fetchTransactions();
  }} />
</Box>
```

**En `src/pages/Transactions.jsx`**:
```jsx
<SyncButton 
  variant="outlined"
  onSyncComplete={() => loadTransactions()}
/>
```

---

## 🧪 Testing Scripts

### Test N8N Webhook (desde terminal)

```bash
# Test básico
curl -X POST http://localhost:5678/webhook/sync-bank-emails \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-123",
    "timestamp": "2025-10-26T12:00:00Z"
  }'

# Debería retornar JSON con transacciones
```

### Test Backend Endpoint (con autenticación)

```bash
# Primero obtener token
TOKEN=$(curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"tu@email.com","password":"tupassword"}' \
  | jq -r '.token')

# Luego test sync
curl -X POST http://localhost:3001/api/transactions/sync-emails \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📊 Tabla de Auditoría (Opcional)

Si quieres tracking de sincronizaciones:

```sql
CREATE TABLE sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  status VARCHAR(20), -- 'success', 'error', 'partial'
  imported INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  duration INTEGER, -- milliseconds
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sync_logs_user ON sync_logs(user_id);
CREATE INDEX idx_sync_logs_created ON sync_logs(created_at DESC);
```

---

## 🎯 Checklist Final

- [ ] Gmail API credentials configurados en N8N
- [ ] Workflow creado y testeado manualmente
- [ ] Backend routes implementadas y registradas
- [ ] Frontend button integrado en pages
- [ ] Parsing regex ajustado para tus emails reales
- [ ] Detección de duplicados funciona
- [ ] Error handling completo
- [ ] Logs de debugging habilitados
- [ ] Testing end-to-end exitoso

---

**Última actualización**: 2025-10-26  
**Complementa**: [EMAIL_SYNC_PLAN.md](./EMAIL_SYNC_PLAN.md)
