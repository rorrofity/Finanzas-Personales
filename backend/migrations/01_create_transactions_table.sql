-- Crear la tabla transactions (idempotente)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    fecha DATE NOT NULL,
    descripcion TEXT NOT NULL,
    monto DECIMAL(12,2) NOT NULL,
    categoria VARCHAR(100) DEFAULT 'Sin categorizar',
    tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('ingreso', 'gasto')),
    cuotas INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índice de unicidad equivalente al constraint previo, creado de forma segura
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ux_transactions_user_fecha_desc_monto'
  ) THEN
    CREATE UNIQUE INDEX ux_transactions_user_fecha_desc_monto ON transactions(user_id, fecha, descripcion, monto);
  END IF;
END$$;
