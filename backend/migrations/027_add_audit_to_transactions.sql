-- Epic 11: auditoría de quién creó/editó cada transacción (Req 11.11).
-- Nullable: el histórico queda NULL y se interpreta como registrado por el dueño.
-- Idempotente.

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_created_by ON transactions(created_by);
