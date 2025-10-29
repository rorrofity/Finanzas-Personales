# 📧 Sincronización de Emails - Finanzas Personales

Documentación completa de la funcionalidad de sincronización automática de transacciones desde emails bancarios.

---

## 📋 Contenido

1. [Overview](#overview)
2. [Estado Actual](#estado-actual)
3. [Arquitectura](#arquitectura)
4. [Configuración de N8N](#configuración-de-n8n)
5. [Testing](#testing)
6. [Deployment](#deployment)

---

## 🎯 Overview

### ¿Qué hace?

Sincroniza automáticamente transacciones de tarjetas de crédito desde emails bancarios a la base de datos, evitando duplicados.

### Flujo Completo

```
Usuario → Click "Sincronizar Emails"
  ↓
Frontend → POST /api/transactions/sync-emails (JWT)
  ↓
Backend → Valida usuario
  ↓
Backend → POST localhost:5678/webhook/sync-bank-emails → N8N
  ↓
N8N → Gmail API: busca emails no leídos
  ↓
N8N → Parse: extrae transacciones (monto, descripción, fecha)
  ↓
N8N → POST localhost:3001/api/transactions/sync-save
  ↓
Backend → Verifica duplicados por email_id
  ↓
Backend → INSERT INTO transactions + imports
  ↓
Backend → Response: {imported, skipped, errors}
  ↓
Frontend → Dialog con resultados
  ↓
Frontend → Refresca datos
  ✅
Usuario ve transacciones nuevas
```

---

## ✅ Estado Actual

### Implementado (Rama: feature/email-sync)

#### Backend ✅

**Archivo**: `backend/routes/syncRoutes.js`

**Endpoints**:
- `POST /api/transactions/sync-emails` - Principal (requiere JWT)
- `POST /api/transactions/sync-save` - Interno (N8N → Backend)
- `GET /api/transactions/sync-status` - Estado última sincronización

**Características**:
- ✅ Detección de duplicados por `email_id` en metadata
- ✅ Transacciones atómicas (BEGIN/COMMIT/ROLLBACK)
- ✅ Logging detallado
- ✅ Error handling robusto

#### Frontend ✅

**Archivo**: `src/components/SyncButton.jsx`

**Características**:
- ✅ Botón con loading state
- ✅ Progress bar (LinearProgress)
- ✅ Dialog de resultados con estadísticas
- ✅ Snackbar notifications
- ✅ Callback para refrescar datos

**Ubicaciones del botón**:
- ✅ Dashboard (esquina superior derecha)
- ✅ Transacciones No Facturadas (junto a Nueva Transacción)
- ✅ Transacciones Internacionales (junto a Importar archivo)

### Pendiente ⏳

- ⏳ **Configurar N8N workflow** (Gmail API + parsing)
- ⏳ Merge a main
- ⏳ Deploy a producción

---

## 🏗️ Arquitectura

### Base de Datos

No requiere nuevas tablas. Usa:

```sql
-- Transacciones
transactions (
  id uuid,
  user_id uuid,
  fecha date,
  descripcion varchar(255),
  monto numeric,
  tipo varchar,
  categoria varchar,
  cuotas integer,
  import_id uuid,
  metadata jsonb,  -- Aquí guardamos email_id
  created_at timestamp,
  updated_at timestamp
)

-- Imports
imports (
  id uuid,
  user_id uuid,
  provider varchar,    -- 'email' o nombre del banco
  network varchar,     -- 'visa' o 'mastercard'
  product_type varchar, -- 'email_sync'
  created_at timestamp
)
```

**Metadata ejemplo**:
```json
{
  "email_id": "msg_18f3a2b4c5d6",
  "banco": "banco_chile",
  "tarjeta": "visa",
  "email_subject": "Compra por $45.990",
  "email_date": "2025-10-27T10:30:00Z",
  "source": "email_sync",
  "parsed_at": "2025-10-27T10:35:22Z"
}
```

### Detección de Duplicados

```sql
SELECT id FROM transactions 
WHERE user_id = $1 
AND metadata->>'email_id' = $2
LIMIT 1
```

Si existe → `skipped++`, no se importa.

---

## 🔧 Configuración de N8N

### 1. Gmail API Credentials

#### Google Cloud Console

1. Ir a: https://console.cloud.google.com/apis/credentials
2. Crear OAuth 2.0 Client ID (tipo: Web application)
3. Agregar scopes:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.modify`
4. Redirect URIs:
   - Local: `http://localhost:5678/rest/oauth2-credential/callback`
   - Producción: `https://rocketflow.cl/rest/oauth2-credential/callback`

#### Configurar en N8N

1. N8N → Credentials → Add Credential
2. Tipo: **Gmail OAuth2**
3. Ingresar Client ID y Client Secret
4. Click "Connect" → Autorizar cuenta Gmail

---

### 2. Crear Workflow en N8N

**Nombre**: "Sync Bank Transactions from Gmail"

#### Nodos del Workflow

**1. Webhook Trigger**
```
- Path: /webhook/sync-bank-emails
- Method: POST
- Respond to webhook: Yes
```

**2. Gmail Search**
```
- Credentials: Gmail OAuth2 (configurado arriba)
- Operation: Search
- Search criteria: 
  from:(bancodechile.cl OR santander.cl) is:unread
- Max results: 50
```

**3. Gmail Get Message** (Loop)
```
- Message ID: {{$json["id"]}}
- Format: Full
- Get attachment: No
```

**4. Function: Parse Email**

Código JavaScript para parsear emails (copiar a node Function):

```javascript
// Función para parsear emails de bancos chilenos
const items = $input.all();
const parsed = [];

for (const item of items) {
  try {
    const payload = item.json.payload;
    const headers = payload.headers || [];
    
    // Extraer headers importantes
    const subject = headers.find(h => h.name === 'Subject')?.value || '';
    const from = headers.find(h => h.name === 'From')?.value || '';
    const date = headers.find(h => h.name === 'Date')?.value || '';
    const messageId = item.json.id;
    
    // Extraer body del email
    let body = '';
    if (payload.body?.data) {
      body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    } else if (payload.parts && payload.parts.length > 0) {
      const textPart = payload.parts.find(p => p.mimeType === 'text/plain' || p.mimeType === 'text/html');
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
      }
    }
    
    // Detectar banco
    let banco = 'desconocido';
    if (from.includes('bancodechile') || from.includes('bancochile')) {
      banco = 'banco_chile';
    } else if (from.includes('santander')) {
      banco = 'santander';
    } else if (from.includes('bci')) {
      banco = 'bci';
    }
    
    // Detectar tarjeta del subject o body
    let tarjeta = 'unknown';
    const subjectLower = subject.toLowerCase();
    const bodyLower = body.toLowerCase();
    
    if (subjectLower.includes('visa') || bodyLower.includes('visa')) {
      tarjeta = 'visa';
    } else if (subjectLower.includes('mastercard') || subjectLower.includes('master card') || bodyLower.includes('mastercard')) {
      tarjeta = 'mastercard';
    }
    
    // Extraer monto (buscar patrones como $12.345 o CLP 12345)
    let monto = null;
    const montoPatterns = [
      /\$\s?([\d.,]+)/g,
      /CLP\s?([\d.,]+)/g,
      /[\$]\s?([\d.,]+)/g
    ];
    
    for (const pattern of montoPatterns) {
      const matches = [...body.matchAll(pattern)];
      if (matches.length > 0) {
        // Tomar el primer monto encontrado
        const montoStr = matches[0][1].replace(/\./g, '').replace(',', '.');
        monto = parseFloat(montoStr);
        if (!isNaN(monto) && monto > 0) {
          break;
        }
      }
    }
    
    // Extraer descripción (comercio)
    let descripcion = subject.replace(/^(Compra|Cargo|Transacción)\s*/i, '').trim();
    
    // Si la descripción está vacía, intentar extraer del body
    if (!descripcion || descripcion.length < 3) {
      const descMatch = body.match(/Comercio[:\s]+([^\n\r]+)/i);
      if (descMatch) {
        descripcion = descMatch[1].trim();
      } else {
        descripcion = 'Transacción desde email';
      }
    }
    
    // Limpiar descripción (max 255 chars)
    descripcion = descripcion.substring(0, 255);
    
    // Extraer fecha (usar fecha del email)
    let fecha = new Date(date).toISOString().split('T')[0];
    
    // Validar que tengamos datos mínimos
    const isValid = monto && monto > 0 && descripcion && fecha;
    
    parsed.push({
      email_id: messageId,
      fecha: fecha,
      descripcion: descripcion,
      monto: monto,
      tipo: 'gasto',
      cuotas: 1,
      banco: banco,
      tarjeta: tarjeta,
      email_subject: subject,
      email_date: date,
      _valid: isValid,
      _raw_subject: subject,
      _raw_from: from
    });
    
  } catch (error) {
    console.error('Error parsing email:', error);
    parsed.push({
      _valid: false,
      _error: error.message
    });
  }
}

return parsed;
```

**5. Filter: Valid Only**
```
- Condition: {{$json["_valid"]}} equals true
```

**6. Aggregate**
```
- Operation: Aggregate All Items
- Field to aggregate: (all)
```

**7. HTTP Request: Save to Backend**
```
- Method: POST
- URL: http://localhost:3001/api/transactions/sync-save
- Body Content Type: JSON
- Body:
{
  "userId": "{{$node["Webhook"].json["userId"]}}",
  "transactions": "{{$json["items"]}}"
}
```

**8. Respond to Webhook**
```
- Response Body: {{$json}}
```

---

### 3. Activar Workflow

1. En N8N, click en el botón **Active** (toggle superior derecho)
2. El workflow estará escuchando en: `http://localhost:5678/webhook/sync-bank-emails`

---

## 🧪 Testing

### Test Backend Solo

```bash
# Health check
curl http://localhost:3001/api/health

# Test sync-emails (requiere token JWT)
curl -X POST http://localhost:3001/api/transactions/sync-emails \
  -H "Authorization: Bearer TU_TOKEN_JWT" \
  -H "Content-Type: application/json"

# Debería responder con error de N8N (esperado si N8N no está configurado)
```

### Test N8N Solo

```bash
# Test webhook de N8N
curl -X POST http://localhost:5678/webhook/sync-bank-emails \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user-id", "timestamp": "2025-10-28T00:00:00Z"}'
```

### Test Integración Completa

1. **Iniciar servicios**:
   ```bash
   # Terminal 1: Backend
   npm run server
   
   # Terminal 2: Frontend
   npm run client
   
   # Terminal 3: N8N (si tienes local)
   docker run -p 5678:5678 n8nio/n8n
   ```

2. **Probar desde la UI**:
   - Login en http://localhost:3000
   - Ir a Dashboard
   - Click en "Sincronizar Emails"
   - Verificar resultado en dialog

3. **Verificar en BD**:
   ```sql
   SELECT * FROM transactions 
   WHERE metadata->>'source' = 'email_sync'
   ORDER BY created_at DESC
   LIMIT 10;
   ```

---

## 🚀 Deployment

### Pre-requisitos

- [ ] Testing local completo
- [ ] N8N workflow configurado y probado
- [ ] Gmail API credentials configurados
- [ ] Código en rama `feature/email-sync`

### Proceso

#### 1. Merge a Main

```bash
git checkout main
git merge feature/email-sync
git push origin main
```

#### 2. Deploy a Producción

```bash
./scripts/deploy-to-production.sh
```

#### 3. Configurar N8N en Producción

1. Acceder a N8N: https://rocketflow.cl
2. Importar workflow (exportar JSON desde local)
3. Configurar Gmail credentials (nuevos para producción)
4. Cambiar URL del HTTP Request node:
   - De: `http://localhost:3001/api/transactions/sync-save`
   - A: `http://localhost:3001/api/transactions/sync-save` (mismo, porque es interno)
5. Activar workflow

#### 4. Verificación Post-Deployment

```bash
# 1. Health check
curl https://finanzas.rocketflow.cl/api/health

# 2. Probar desde la UI
# Login en https://finanzas.rocketflow.cl
# Click en "Sincronizar Emails"

# 3. Verificar logs
ssh root@137.184.12.234
pm2 logs finanzas-backend --lines 50
```

---

## 🔒 Consideraciones de Seguridad

### Backend

- ✅ Endpoint `/sync-emails` requiere autenticación JWT
- ✅ Endpoint `/sync-save` es interno (sin auth, solo localhost)
- ✅ Validación de datos de entrada
- ✅ Transacciones atómicas en BD

### N8N

- ✅ Gmail OAuth con scopes mínimos (readonly + modify para marcar como leídos)
- ✅ Webhook interno sin autenticación (solo accesible vía localhost)
- ⚠️ Considerar agregar API key en N8N webhook para producción (futuro)

### Gmail API

- ✅ Solo lee emails de remitentes específicos
- ✅ Solo emails no leídos
- ✅ Credentials separados por ambiente (dev/prod)

---

## 🐛 Troubleshooting

### Error: "N8N no disponible"

```bash
# Verificar que N8N esté corriendo
docker ps | grep n8n

# Verificar puerto
curl http://localhost:5678/healthz

# Reiniciar N8N
docker restart n8n
```

### Error: "Gmail API quota exceeded"

- Límite diario: 1 billón de queries (más que suficiente)
- Si ocurre: esperar 24 horas
- Verificar en: https://console.cloud.google.com/apis/dashboard

### Error: "Duplicados no se detectan"

```sql
-- Verificar metadata
SELECT id, descripcion, metadata->>'email_id' as email_id
FROM transactions
WHERE metadata->>'source' = 'email_sync'
LIMIT 10;

-- Si email_id es null, revisar código de N8N
```

### Error: "Parsing no funciona"

1. Verificar regex en N8N Function node
2. Probar con email real
3. Usar https://regex101.com/ para ajustar patterns
4. Verificar logs de N8N: Execution logs

---

## 📊 Mejoras Futuras

### Fase 2
- ⏳ Preview de transacciones antes de importar
- ⏳ Sincronización automática (cron cada X horas)
- ⏳ Soporte multi-banco configurable
- ⏳ Regex personalizables por banco

### Fase 3
- ⏳ Categorización automática con ML
- ⏳ Rate limiting (1 sync cada 5 min por usuario)
- ⏳ Tabla de auditoría `sync_logs`
- ⏳ Notificaciones push de nuevas transacciones

---

**Última actualización**: 2025-10-28  
**Estado**: ✅ Backend y Frontend implementados | ⏳ N8N pendiente de configurar
