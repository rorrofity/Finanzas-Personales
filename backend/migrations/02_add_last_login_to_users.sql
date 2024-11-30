-- Agregar columna ultimo_inicio_sesion a la tabla users si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'users'
        AND column_name = 'ultimo_inicio_sesion'
    ) THEN
        ALTER TABLE users
        ADD COLUMN ultimo_inicio_sesion TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;
