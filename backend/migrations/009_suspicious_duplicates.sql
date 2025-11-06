-- Asegurar que la extensión uuid-ossp está habilitada
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabla para almacenar transacciones sospechosas de ser duplicadas
CREATE TABLE IF NOT EXISTS suspicious_duplicates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  similar_to_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'kept_both', 'duplicate_removed'
  reviewed_at TIMESTAMP,
  reviewed_by UUID REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(transaction_id, similar_to_id)
);

-- Índice para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_suspicious_duplicates_status ON suspicious_duplicates(status);
CREATE INDEX IF NOT EXISTS idx_suspicious_duplicates_transaction ON suspicious_duplicates(transaction_id);

-- Comentarios
COMMENT ON TABLE suspicious_duplicates IS 'Almacena pares de transacciones que podrían ser duplicadas basándose en fecha y monto';
COMMENT ON COLUMN suspicious_duplicates.status IS 'pending: sin revisar, kept_both: usuario confirmó que son diferentes, duplicate_removed: usuario eliminó una';
