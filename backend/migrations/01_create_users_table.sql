-- Verificar si la tabla users existe y crearla si no existe
CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ultimo_inicio_sesion TIMESTAMP WITH TIME ZONE
);

-- Crear un usuario de prueba si no existe
-- Contraseña: test123 (hasheada con bcrypt)
INSERT INTO users (nombre, email, password)
SELECT 'Usuario Prueba', 'test@example.com', '$2a$10$YourHashedPasswordHere'
WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE email = 'test@example.com'
);
