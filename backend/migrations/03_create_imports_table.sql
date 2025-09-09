-- Create imports table to log file imports and metadata
CREATE TABLE IF NOT EXISTS imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- banco_chile | banco_cencosud
  network TEXT,           -- visa | mastercard (nullable, only for banco_chile)
  product_type TEXT NOT NULL DEFAULT 'credit_card', -- for future extensibility
  original_filename TEXT,
  detected_rows INTEGER DEFAULT 0,
  inserted_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_imports_user_id_created_at ON imports(user_id, created_at DESC);
