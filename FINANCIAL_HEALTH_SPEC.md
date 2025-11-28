# 🏥 Especificación: Sistema de Salud Financiera

**Rama**: `feature/financial-health`  
**Fecha**: 27 de Noviembre 2025  
**Estado**: 🚧 En Desarrollo

---

## 🎯 Objetivo

Crear un sistema que permita al usuario:
1. **Ver su situación financiera actual** de un vistazo
2. **Proyectar automáticamente** cuánto dinero tendrá el próximo mes
3. **Recibir alertas** cuando la proyección sea negativa
4. **Sincronizar automáticamente** transacciones desde emails bancarios

---

## 📊 Arquitectura de Datos

### Flujo de Información

```
                    ┌─────────────────────┐
                    │   SALDO ACTUAL      │
                    │   (Cuenta Corriente)│
                    └─────────┬───────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ TRANSACCIONES   │ │ GASTOS FIJOS    │ │ INGRESOS        │
│ NO FACTURADAS   │ │ PROYECTADOS     │ │ PROYECTADOS     │
│ (TC)            │ │                 │ │                 │
├─────────────────┤ ├─────────────────┤ ├─────────────────┤
│ - Visa          │ │ - Arriendo      │ │ - Sueldo        │
│ - Mastercard    │ │ - Luz           │ │ - Bonos         │
│ - Cuotas        │ │ - Agua          │ │ - Otros         │
│ - Internacional │ │ - Internet      │ │                 │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
                             ▼
                   ┌─────────────────────┐
                   │   PROYECCIÓN MES    │
                   │   SIGUIENTE         │
                   └─────────────────────┘
                             │
                             ▼
                   ┌─────────────────────┐
                   │   INDICADOR DE      │
                   │   SALUD FINANCIERA  │
                   └─────────────────────┘
```

---

## 🗄️ Modelo de Datos

### Tablas Existentes (No modificar)

| Tabla | Uso en Proyección |
|-------|-------------------|
| `transactions` | Gastos TC no facturados |
| `installment_plans/occurrences` | Cuotas a vencer |
| `intl_unbilled` | Transacciones internacionales |
| `projected_templates/occurrences` | Gastos fijos recurrentes |
| `checking_balances/transactions` | Saldo cuenta corriente |

### Nueva Tabla: `financial_snapshots`

```sql
CREATE TABLE IF NOT EXISTS financial_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  
  -- Saldos actuales
  checking_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  
  -- Compromisos TC (mes siguiente)
  cc_visa_unbilled NUMERIC(14,2) NOT NULL DEFAULT 0,
  cc_mastercard_unbilled NUMERIC(14,2) NOT NULL DEFAULT 0,
  cc_visa_installments NUMERIC(14,2) NOT NULL DEFAULT 0,
  cc_mastercard_installments NUMERIC(14,2) NOT NULL DEFAULT 0,
  cc_intl_visa NUMERIC(14,2) NOT NULL DEFAULT 0,
  cc_intl_mastercard NUMERIC(14,2) NOT NULL DEFAULT 0,
  
  -- Proyectados (mes siguiente)
  projected_expenses NUMERIC(14,2) NOT NULL DEFAULT 0,
  projected_income NUMERIC(14,2) NOT NULL DEFAULT 0,
  
  -- Calculados
  total_commitments NUMERIC(14,2) NOT NULL DEFAULT 0,
  projected_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  health_score INT NOT NULL DEFAULT 0 CHECK (health_score BETWEEN 0 AND 100),
  health_status VARCHAR(20) NOT NULL DEFAULT 'unknown' 
    CHECK (health_status IN ('critical', 'warning', 'healthy', 'excellent', 'unknown')),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(user_id, snapshot_date)
);

CREATE INDEX idx_financial_snapshots_user_date 
  ON financial_snapshots(user_id, snapshot_date DESC);
```

### Nueva Tabla: `financial_alerts`

```sql
CREATE TABLE IF NOT EXISTS financial_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  related_month INT,
  related_year INT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  is_dismissed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_financial_alerts_user_unread 
  ON financial_alerts(user_id, is_read, created_at DESC);
```

---

## 🔌 API Endpoints

### GET `/api/financial-health/summary`

Retorna el resumen de salud financiera actual.

**Response:**
```json
{
  "currentDate": "2025-11-27",
  "targetMonth": {
    "year": 2025,
    "month": 12,
    "name": "Diciembre 2025"
  },
  "checking": {
    "currentBalance": 2500000,
    "lastUpdated": "2025-11-27T10:30:00Z"
  },
  "creditCards": {
    "visa": {
      "unbilled": 350000,
      "installments": 80000,
      "international": 20000,
      "total": 450000
    },
    "mastercard": {
      "unbilled": 300000,
      "installments": 60000,
      "international": 20000,
      "total": 380000
    },
    "combined": 830000
  },
  "projected": {
    "expenses": 850000,
    "income": 2200000,
    "details": {
      "expenses": [
        { "name": "Arriendo", "amount": 650000 },
        { "name": "Servicios", "amount": 120000 },
        { "name": "Otros", "amount": 80000 }
      ],
      "income": [
        { "name": "Sueldo", "amount": 2200000 }
      ]
    }
  },
  "summary": {
    "totalCommitments": 1680000,
    "projectedBalance": 3020000,
    "healthScore": 80,
    "healthStatus": "healthy"
  },
  "alerts": [
    {
      "type": "info",
      "message": "Pago TC Visa vence en 5 días"
    }
  ]
}
```

### POST `/api/financial-health/refresh`

Fuerza el recálculo del snapshot de salud financiera.

### GET `/api/financial-health/alerts`

Lista todas las alertas pendientes.

### PUT `/api/financial-health/alerts/:id/dismiss`

Marca una alerta como descartada.

---

## 🖥️ Componentes Frontend

### Nueva Página: `FinancialHealth.jsx`

Ubicación: `src/pages/FinancialHealth.jsx`

**Componentes internos:**
1. `CurrentBalanceCard` - Muestra saldo cuenta corriente
2. `CommitmentsBreakdown` - Desglose de compromisos TC + fijos
3. `ProjectionSummary` - Proyección del mes siguiente
4. `HealthIndicator` - Barra de progreso con % de salud
5. `AlertsList` - Lista de alertas activas

### Nuevo Componente: `HealthScoreGauge`

Indicador visual tipo gauge/speedometer que muestra la salud financiera.

```
  Crítico     Alerta     Saludable    Excelente
    |           |            |            |
    ▼           ▼            ▼            ▼
  ████████████████████████████████████████████
  0%         25%          50%          75%   100%
                              ▲
                              │
                           Tu score: 80%
```

---

## 📱 Navegación

Agregar nuevo ítem al menú lateral:

```jsx
const menuItems = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },
  { text: '💰 Salud Financiera', icon: <HealthIcon />, path: '/financial-health' },  // NUEVO
  // ... resto de ítems
];
```

---

## 🔄 Lógica de Cálculo

### Health Score Algorithm

```javascript
function calculateHealthScore(projectedBalance, totalCommitments, currentBalance) {
  // Ratio de cobertura: cuántas veces puedes cubrir tus compromisos
  const coverageRatio = currentBalance / totalCommitments;
  
  // Score base según proyección
  let score = 50;
  
  if (projectedBalance > 0) {
    // Proyección positiva: bonus según % del saldo actual que queda
    const retentionRate = projectedBalance / currentBalance;
    score += Math.min(retentionRate * 50, 50);
  } else {
    // Proyección negativa: penalización según déficit
    const deficitRate = Math.abs(projectedBalance) / totalCommitments;
    score -= Math.min(deficitRate * 50, 50);
  }
  
  // Ajuste por colchón de seguridad (tener más de 2x compromisos)
  if (coverageRatio > 2) score += 10;
  if (coverageRatio > 3) score += 10;
  
  return Math.max(0, Math.min(100, Math.round(score)));
}

function getHealthStatus(score) {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'healthy';
  if (score >= 40) return 'warning';
  return 'critical';
}
```

---

## 🚦 Tipos de Alertas

| Tipo | Severidad | Trigger |
|------|-----------|---------|
| `projection_negative` | critical | Proyección < 0 |
| `projection_low` | warning | Proyección < 20% saldo actual |
| `payment_due` | info | Pago TC en < 7 días |
| `unusual_expense` | warning | Gasto > 2x promedio categoría |
| `goal_achieved` | info | Balance > objetivo mensual |

---

## 📅 Cronograma de Implementación

### Sprint 1 (Esta semana)
- [x] Crear rama `feature/financial-health`
- [x] Documentar especificación (este archivo)
- [ ] Migración: crear tabla `financial_snapshots`
- [ ] Migración: crear tabla `financial_alerts`
- [ ] Backend: endpoint `/api/financial-health/summary`
- [ ] Frontend: página básica `FinancialHealth.jsx`

### Sprint 2 (Próxima semana)
- [ ] Frontend: componentes visuales (gauge, cards)
- [ ] Backend: lógica de cálculo de health score
- [ ] Backend: sistema de alertas automáticas
- [ ] Integración con menú lateral

### Sprint 3 (Semana 3)
- [ ] Completar integración N8N (botón sync en frontend)
- [ ] Deploy a producción
- [ ] Testing end-to-end
- [ ] Documentación usuario

---

## 🧪 Testing

### Casos de Prueba

1. **Usuario con buena salud financiera**
   - Saldo: $3.000.000
   - Compromisos: $1.500.000
   - Esperado: Score > 70%, status "healthy"

2. **Usuario con proyección negativa**
   - Saldo: $500.000
   - Compromisos: $800.000
   - Esperado: Score < 40%, status "critical", alerta generada

3. **Usuario sin transacciones**
   - Sin datos
   - Esperado: Score 50%, status "unknown"

---

## 📝 Notas de Implementación

1. **Performance**: El cálculo de proyección debe ser eficiente. Considerar cache de snapshots diarios.

2. **Timezone**: Todos los cálculos deben usar `America/Santiago`.

3. **Backward Compatibility**: No modificar tablas existentes, solo agregar nuevas.

4. **Mobile First**: El dashboard debe verse bien en móvil.

---

**Última actualización**: 27/11/2025
