-- Eliminar la restricción de unicidad existente
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_user_id_fecha_descripcion_monto_key;
