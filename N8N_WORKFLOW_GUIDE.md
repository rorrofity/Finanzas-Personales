# 🔧 Guía de Configuración N8N Workflow

## 📋 Resumen

Este documento describe cómo configurar el workflow de N8N para sincronizar transacciones desde Gmail.

---

## 🔑 Configuración de Gmail API

### 1. Google Cloud Console

1. Ir a: https://console.cloud.google.com/apis/credentials
2. Crear OAuth 2.0 Client ID
3. Agregar scopes:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.modify`
4. Redirect URI: `http://localhost:5678/rest/oauth2-credential/callback` (local)
5. Redirect URI: `https://rocketflow.cl/rest/oauth2-credential/callback` (producción)

### 2. Configurar Credentials en N8N

1. N8N → Credentials → Add Credential → Gmail OAuth2
2. Ingresar Client ID y Client Secret
3. Autorizar cuenta Gmail

---

## 🔄 Estructura del Workflow

**Nombre**: "Sync Bank Transactions from Gmail"

### Nodos:

1. **Webhook Trigger**
   - Path: `/webhook/sync-bank-emails`
   - Method: POST
   - Responde al webhook: Yes

2. **Gmail Search**
   - Criteria: `from:(bancodechile.cl OR santander.cl) is:unread`
   - Max results: 50

3. **Gmail Get Message** (Loop)
   - Message ID: `{{$json["id"]}}`
   - Format: Full

4. **Function: Parse Email**
   - Ver código en `EMAIL_SYNC_TECHNICAL.md` líneas 22-207

5. **Filter: Valid Only**
   - Condition: `{{$json["_valid"]}}` = true

6. **Aggregate**
   - Collect all transactions

7. **HTTP Request: Save to Backend**
   - Method: POST
   - URL: `http://localhost:3001/api/transactions/sync-save` (producción)
   - Body: 
     ```json
     {
       "userId": "{{$node["Webhook"].json["userId"]}}",
       "transactions": "{{$json["items"]}}"
     }
     ```

8. **Respond to Webhook**
   - Response body: `{{$json}}`

---

## 🧪 Testing

### Test Webhook Manualmente

```bash
curl -X POST http://localhost:5678/webhook/sync-bank-emails \
  -H "Content-Type: application/json" \
  -d '{"userId": "tu-user-id", "timestamp": "2025-10-27T10:00:00Z"}'
```

---

## 🚀 Deployment

### Local
- N8N corriendo en `http://localhost:5678`
- Activar workflow
- Probar desde la app

### Producción
- N8N ya está en `https://rocketflow.cl`
- Importar workflow JSON
- Configurar credentials
- Activar workflow

---

**Última actualización**: 2025-10-27
