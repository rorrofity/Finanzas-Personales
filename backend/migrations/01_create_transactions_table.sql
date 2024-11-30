-- Eliminar la tabla si existe
DROP TABLE IF EXISTS transactions;

-- Crear la tabla transactions
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    fecha DATE NOT NULL,
    descripcion TEXT NOT NULL,
    monto DECIMAL(12,2) NOT NULL,
    categoria VARCHAR(100) DEFAULT 'Sin categorizar',
    tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('ingreso', 'gasto')),
    cuotas INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, fecha, descripcion, monto)
);
