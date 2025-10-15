-- Migración para agregar soporte de Google OAuth
-- Agrega campos necesarios para autenticación con Google

-- Agregar columnas para Google OAuth
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) DEFAULT 'local' CHECK (auth_provider IN ('local', 'google')),
ADD COLUMN IF NOT EXISTS profile_picture TEXT;

-- Hacer el password nullable ya que los usuarios de Google no tendrán password
ALTER TABLE users 
ALTER COLUMN password DROP NOT NULL;

-- Agregar índice para búsquedas por google_id
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);

-- Agregar índice para búsquedas por auth_provider
CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users(auth_provider);

-- Actualizar usuarios existentes para que tengan auth_provider = 'local'
UPDATE users 
SET auth_provider = 'local' 
WHERE auth_provider IS NULL;

-- Comentarios para documentación
COMMENT ON COLUMN users.google_id IS 'ID único de Google OAuth (sub claim del JWT)';
COMMENT ON COLUMN users.auth_provider IS 'Proveedor de autenticación: local (email/password) o google (Google OAuth)';
COMMENT ON COLUMN users.profile_picture IS 'URL de la foto de perfil del usuario (principalmente de Google)';
