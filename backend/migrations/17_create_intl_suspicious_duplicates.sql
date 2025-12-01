-- Tabla para detectar duplicados sospechosos en transacciones internacionales
-- Criterio: misma fecha + mismo amount_usd

CREATE TABLE IF NOT EXISTS intl_suspicious_duplicates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  intl_id UUID NOT NULL REFERENCES intl_unbilled(id) ON DELETE CASCADE,
  similar_to_id UUID NOT NULL REFERENCES intl_unbilled(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'duplicate_removed', 'kept_both'
  reviewed_at TIMESTAMP,
  reviewed_by UUID REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(intl_id, similar_to_id)
);

CREATE INDEX IF NOT EXISTS idx_intl_suspicious_status ON intl_suspicious_duplicates(status);
CREATE INDEX IF NOT EXISTS idx_intl_suspicious_intl_id ON intl_suspicious_duplicates(intl_id);
