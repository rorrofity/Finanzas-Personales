-- Add metadata column to transactions for storing email sync info
-- This stores: email_id, subject, from, banco, tipo_transaccion, etc.

ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Index for querying by email_id to prevent duplicate imports
CREATE INDEX IF NOT EXISTS idx_transactions_metadata_email_id 
ON transactions((metadata->>'email_id'));

COMMENT ON COLUMN transactions.metadata IS 'JSON metadata from email sync: email_id, subject, from, banco, tipo_transaccion, etc.';
