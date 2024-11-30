-- Crear tabla de categorías
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    user_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, user_id)
);

-- Insertar categorías predefinidas (categorías globales sin user_id)
INSERT INTO categories (name, description, user_id) VALUES
    ('Comida', 'Gastos relacionados con alimentación', NULL),
    ('Cuentas', 'Pagos de servicios y cuentas mensuales', NULL),
    ('Auto', 'Gastos relacionados con el vehículo', NULL),
    ('Créditos', 'Pagos de créditos y préstamos', NULL),
    ('Compras Camila', 'Compras personales de Camila', NULL),
    ('Compras Rodrigo', 'Compras personales de Rodrigo', NULL)
ON CONFLICT (name, user_id) DO NOTHING;

-- Modificar tabla de transacciones para usar la nueva tabla de categorías
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id),
ADD CONSTRAINT fk_category FOREIGN KEY (category_id) REFERENCES categories(id);

-- Migrar datos existentes (esto creará categorías para cada usuario que tenga transacciones)
INSERT INTO categories (name, user_id)
SELECT DISTINCT categoria, user_id 
FROM transactions 
WHERE categoria IS NOT NULL
AND categoria NOT IN (SELECT name FROM categories WHERE user_id IS NULL)
ON CONFLICT (name, user_id) DO NOTHING;

-- Actualizar las transacciones existentes para usar los nuevos IDs de categorías
UPDATE transactions t
SET category_id = c.id
FROM categories c
WHERE (t.categoria = c.name AND c.user_id IS NULL)
   OR (t.categoria = c.name AND t.user_id = c.user_id);

-- Opcional: eliminar la columna antigua después de verificar la migración
-- ALTER TABLE transactions DROP COLUMN IF EXISTS categoria;
