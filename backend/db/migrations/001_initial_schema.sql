-- Crear extensión para UUID si no existe
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabla de Usuarios
CREATE TABLE usuarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  fecha_registro TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  ultimo_inicio_sesion TIMESTAMP WITH TIME ZONE,
  activo BOOLEAN DEFAULT TRUE
);

-- Tabla de Transacciones
CREATE TABLE transacciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID REFERENCES usuarios(id),
  fecha DATE NOT NULL,
  monto NUMERIC(12, 2) NOT NULL,
  categoria VARCHAR(100),
  descripcion TEXT,
  tipo VARCHAR(20) CHECK (tipo IN ('ingreso', 'gasto')),
  fuente VARCHAR(100),
  etiquetas TEXT[],
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Presupuestos
CREATE TABLE presupuestos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID REFERENCES usuarios(id),
  categoria VARCHAR(100) NOT NULL,
  monto_maximo NUMERIC(12, 2) NOT NULL,
  periodo VARCHAR(20) CHECK (periodo IN ('mensual', 'anual')),
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL
);

-- Índices para mejorar el rendimiento
CREATE INDEX idx_transacciones_usuario_fecha ON transacciones(usuario_id, fecha);
CREATE INDEX idx_transacciones_categoria ON transacciones(categoria);

-- Función para calcular saldo total
CREATE OR REPLACE FUNCTION calcular_saldo_total(p_usuario_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  total_ingresos NUMERIC;
  total_gastos NUMERIC;
BEGIN
  SELECT 
    COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN tipo = 'gasto' THEN monto ELSE 0 END), 0)
  INTO total_ingresos, total_gastos
  FROM transacciones
  WHERE usuario_id = p_usuario_id;

  RETURN total_ingresos - total_gastos;
END;
$$ LANGUAGE plpgsql;

-- Comentarios para documentación
COMMENT ON TABLE usuarios IS 'Almacena información de usuarios del sistema';
COMMENT ON TABLE transacciones IS 'Registro de todas las transacciones financieras';
COMMENT ON TABLE presupuestos IS 'Definición de presupuestos por categoría';
