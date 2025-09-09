-- Add import_id to transactions and index
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS import_id UUID REFERENCES imports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_import_id ON transactions(import_id);
