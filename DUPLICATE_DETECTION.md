# 🔍 Sistema de Detección de Duplicados Sospechosos

## 📋 Resumen

Sistema **no bloqueante** que detecta posibles transacciones duplicadas y permite al usuario decidir si mantenerlas o eliminarlas.

---

## 🎯 Criterio de Detección (Ultra-Simple)

**Una transacción es sospechosa si:**
- ✅ Tiene la **misma fecha** que otra transacción existente
- ✅ Tiene el **mismo monto** que esa transacción
- ✅ Es del **mismo tipo** (gasto/pago)

**Ejemplo:**
```
30-oct-2025 | $3.064 | PAYU *UBER TRIP
30-oct-2025 | $3.064 | PAYU   UBER TRIP  ← SOSPECHOSA
```

---

## 🏗️ Arquitectura

### **Backend**

#### **1. Base de Datos**

**Tabla: `suspicious_duplicates`**
```sql
CREATE TABLE suspicious_duplicates (
  id UUID PRIMARY KEY,
  transaction_id UUID REFERENCES transactions(id),
  similar_to_id UUID REFERENCES transactions(id),
  status TEXT DEFAULT 'pending', -- 'pending' | 'kept_both' | 'duplicate_removed'
  reviewed_at TIMESTAMP,
  reviewed_by UUID,
  created_at TIMESTAMP
);
```

#### **2. Detección Automática**

**Archivo:** `backend/utils/suspiciousDetector.js`

```javascript
// Detecta transacciones con misma fecha y monto
detectSuspiciousDuplicates(transactionId, userId)

// Marca un par como sospechoso
flagAsSuspicious(transactionId, similarToId)

// Obtiene pendientes de revisión
getPendingSuspicious(userId)

// Resuelve una sospecha
resolveSuspicious(suspiciousId, action, userId, transactionIdToDelete)
```

**Integración en Import:**
```javascript
// backend/controllers/transactionController.js (línea 718)

// Después de insertar transacciones
for (const insertedTx of importResult.insertedTransactions) {
  const suspects = await detectSuspiciousDuplicates(insertedTx.id, req.user.id);
  if (suspects.length > 0) {
    await flagAsSuspicious(insertedTx.id, suspects[0].id);
  }
}
```

#### **3. API Endpoints**

**Rutas:** `backend/routes/suspiciousRoutes.js`

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/suspicious/count` | GET | Conteo de pendientes |
| `/api/suspicious` | GET | Lista de sospechosos |
| `/api/suspicious/:id/resolve` | POST | Resolver (eliminar o mantener) |

**Body de `/resolve`:**
```json
{
  "action": "delete",  // o "keep_both"
  "transactionIdToDelete": "uuid-de-la-transaccion"  // solo si action=delete
}
```

---

### **Frontend**

#### **1. Servicio**

**Archivo:** `src/services/suspiciousService.js`

```javascript
getSuspiciousCount()           // → número
getSuspiciousTransactions()    // → array de pares
resolveSuspicious(id, action, txId)  // → resultado
```

#### **2. Página de Revisión**

**Archivo:** `src/pages/ReviewDuplicates.jsx`

**Ruta:** `/review-duplicates`

**Características:**
- Comparación visual lado a lado
- Botones para eliminar cualquiera de las dos
- Botón para mantener ambas
- Feedback visual inmediato
- Recarga automática después de resolver

**UI:**
```
┌─────────────────────────────────────────┐
│ ⚠️  Posible duplicado #1                │
│ 30-oct • $3.064                         │
├─────────────────────────────────────────┤
│                                         │
│  [Transacción Original]   ↔  [Similar] │
│  PAYU *UBER TRIP          PAYU UBER    │
│  Importada: 31-oct        05-nov       │
│                                         │
│  [ 🗑️ Eliminar esta ]   [ 🗑️ Eliminar] │
│                                         │
│      [ ✓ Mantener Ambas ]              │
└─────────────────────────────────────────┘
```

#### **3. Badge en Menú**

**Archivo:** `src/layouts/DashboardLayout.js`

- Badge naranja en ítem "Revisar Duplicados"
- Auto-refresh cada 30 segundos
- Solo visible si hay pendientes

---

## 🔄 Flujo Completo

### **1. Importación**

```
Usuario sube archivo Excel
     ↓
Backend procesa transacciones
     ↓
Hard Rules bloquean duplicados exactos (brand|fecha|monto)
     ↓
Se insertan transacciones nuevas
     ↓
Para cada transacción insertada:
  - Buscar otras con misma fecha + monto
  - Si encuentra → Marcar como sospechosa
     ↓
Import termina normalmente
```

### **2. Notificación**

```
DashboardLayout consulta /api/suspicious/count cada 30s
     ↓
Si count > 0 → Badge naranja en menú
     ↓
Usuario ve alerta y hace clic
     ↓
Navega a /review-duplicates
```

### **3. Revisión**

```
Usuario ve comparación lado a lado
     ↓
Opciones:
  A) Eliminar Transacción 1 → DELETE + marca como 'duplicate_removed'
  B) Eliminar Transacción 2 → DELETE + marca como 'duplicate_removed'
  C) Mantener Ambas → Solo marca como 'kept_both'
     ↓
Backend ejecuta acción
     ↓
Frontend recarga lista
     ↓
Badge se actualiza automáticamente
```

---

## ✅ Características Clave

### **No Invasivo**
- ❌ No cambia hard rules existentes
- ❌ No bloquea imports
- ❌ No afecta flujo actual
- ✅ Solo **marca** para revisión posterior

### **Control del Usuario**
- Usuario toma decisión final
- Puede mantener ambas si son válidas
- Transparencia total (ve ambas transacciones)
- No hay decisiones automáticas

### **Performante**
- Detección solo en transacciones nuevas
- No re-procesa todo el historial
- Índices en BD para búsquedas rápidas
- Auto-limpieza con ON DELETE CASCADE

### **Escalable**
- Fácil agregar más criterios en el futuro
- Logs para análisis de patrones
- Sistema de scoring preparado (actualmente score implícito = 100%)

---

## 📊 Métricas y Monitoreo

### **Console Logs**

```javascript
// En import
⚠️  Duplicado sospechoso: {tx_id} similar a {existing_id}

// En frontend
Error cargando conteo de sospechosos: {error}
```

### **Queries Útiles**

```sql
-- Ver sospechosos pendientes
SELECT * FROM suspicious_duplicates WHERE status = 'pending';

-- Stats de resoluciones
SELECT 
  status, 
  COUNT(*) as count 
FROM suspicious_duplicates 
GROUP BY status;

-- Transacciones más marcadas
SELECT 
  t.descripcion,
  COUNT(*) as times_flagged
FROM suspicious_duplicates sd
JOIN transactions t ON sd.transaction_id = t.id
GROUP BY t.descripcion
ORDER BY times_flagged DESC
LIMIT 10;
```

---

## 🚀 Testing

### **Escenario 1: Import Normal**

```bash
# 1. Subir archivo con transacciones únicas
# Resultado esperado: 0 sospechosos

# 2. Subir mismo archivo
# Resultado esperado: 0 sospechosos (hard rules bloquearon)

# 3. Subir archivo con ligera variación en descripción pero misma fecha/monto
# Resultado esperado: N sospechosos marcados
```

### **Escenario 2: Resolución**

```bash
# 1. Navegar a /review-duplicates
# 2. Ver comparación
# 3. Elegir "Eliminar transacción 2"
# Resultado: Transacción eliminada, badge actualizado

# 4. Verificar en /transactions que solo queda una
```

### **Escenario 3: Mantener Ambas**

```bash
# 1. Navegar a /review-duplicates
# 2. Ver par sospechoso
# 3. Elegir "Mantener Ambas"
# Resultado: Ambas quedan en BD, badge actualizado, no vuelve a aparecer
```

---

## 🔧 Configuración

### **Ajustar Frecuencia de Polling**

```javascript
// src/layouts/DashboardLayout.js línea 56
const interval = setInterval(loadSuspiciousCount, 30000);  // 30 segundos
```

### **Cambiar Criterio de Detección**

```javascript
// backend/utils/suspiciousDetector.js línea 17-28
// Actualmente: misma fecha + mismo monto
// Para agregar más criterios, modificar query SQL
```

---

## 📝 Notas Importantes

1. **No retroactivo:** Solo detecta duplicados en **nuevas** importaciones
2. **Historial preservado:** Decisiones anteriores se guardan en `suspicious_duplicates`
3. **Cascada:** Si eliminas transacción, el registro sospechoso también se elimina
4. **Único par:** No marca la misma pareja dos veces (constraint UNIQUE)
5. **Multi-usuario:** Cada usuario ve solo sus sospechosos

---

## 🎓 Próximas Mejoras Potenciales

- [ ] Agregar scoring más sofisticado (descripción similar)
- [ ] Notificación push cuando se detectan nuevos
- [ ] Historial de decisiones en página de revisión
- [ ] Atajos de teclado para resolver rápido
- [ ] Sugerencia automática (pero usuario decide)
- [ ] Export de reportes de duplicados
- [ ] Machine learning para mejorar detección

---

**Última actualización:** 2025-11-06
