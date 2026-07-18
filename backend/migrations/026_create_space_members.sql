-- Epic 11: Espacio Compartido del Hogar
-- Membresías del espacio del dueño (ACL sobre la cuenta del dueño).
-- Idempotente: el runner ejecuta todas las migraciones en cada corrida.

CREATE TABLE IF NOT EXISTS space_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    member_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    invited_email VARCHAR(100) NOT NULL,
    can_edit BOOLEAN NOT NULL DEFAULT false,
    can_delete BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'linked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT space_members_unique_invite UNIQUE (owner_user_id, invited_email),
    CONSTRAINT space_members_no_self CHECK (member_user_id IS NULL OR member_user_id <> owner_user_id)
);

CREATE INDEX IF NOT EXISTS idx_space_members_owner ON space_members(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_space_members_member ON space_members(member_user_id);
CREATE INDEX IF NOT EXISTS idx_space_members_invited_email ON space_members(invited_email);

-- Trigger de updated_at (reutiliza la función global si existe; si no, la crea)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_space_members_updated_at ON space_members;
CREATE TRIGGER trg_space_members_updated_at
    BEFORE UPDATE ON space_members
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
