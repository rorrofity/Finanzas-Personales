-- Update CHECK constraint to include 'desestimar'
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_tipo_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_tipo_check CHECK (tipo IN ('ingreso', 'gasto', 'pago', 'desestimar'));
