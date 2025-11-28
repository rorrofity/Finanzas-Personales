-- Migration: Sistema de Salud Financiera
-- Fecha: 2025-11-27

-- Tabla de snapshots de salud financiera (cache diario)
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

CREATE INDEX IF NOT EXISTS idx_financial_snapshots_user_date 
  ON financial_snapshots(user_id, snapshot_date DESC);

-- Tabla de alertas financieras
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

CREATE INDEX IF NOT EXISTS idx_financial_alerts_user_unread 
  ON financial_alerts(user_id, is_read, is_dismissed, created_at DESC);

-- Comentarios
COMMENT ON TABLE financial_snapshots IS 'Cache diario de métricas de salud financiera';
COMMENT ON TABLE financial_alerts IS 'Alertas automáticas sobre situación financiera';
