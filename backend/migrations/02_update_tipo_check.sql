-- Eliminar la restricción existente
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_tipo_check;

-- Agregar la nueva restricción que incluye 'pago'
ALTER TABLE transactions ADD CONSTRAINT transactions_tipo_check CHECK (tipo IN ('ingreso', 'gasto', 'pago'));
