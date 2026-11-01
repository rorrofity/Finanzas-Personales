-- CSR: additive statement evidence only. Existing financial rows and schemas stay untouched.
CREATE TABLE IF NOT EXISTS card_statement_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'banco_chile' CHECK (provider='banco_chile'),
  file_sha256 CHAR(64) NOT NULL,
  network TEXT CHECK (network IN ('visa','mastercard')),
  main_card_last_four CHAR(4),
  statement_date DATE,
  period_since DATE,
  period_until DATE,
  due_date DATE,
  document_header JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,provider,file_sha256)
);
CREATE INDEX IF NOT EXISTS idx_card_statement_period ON card_statement_runs(user_id,due_date);
CREATE TABLE IF NOT EXISTS card_statement_items (
  run_id UUID NOT NULL REFERENCES card_statement_runs(id) ON DELETE CASCADE,
  section_index INTEGER NOT NULL CHECK(section_index>=0),
  ordinal INTEGER NOT NULL CHECK(ordinal>=0),
  row_key TEXT NOT NULL,
  item JSONB NOT NULL,
  PRIMARY KEY(run_id,section_index,ordinal),
  UNIQUE(run_id,section_index,row_key)
);
CREATE TABLE IF NOT EXISTS card_statement_sources (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  attachment_id TEXT NOT NULL,
  run_id UUID NOT NULL REFERENCES card_statement_runs(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,message_id,attachment_id)
);
