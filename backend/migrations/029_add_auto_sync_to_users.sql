-- Epic 13: opt-in del dueño a la sincronización programada.
-- Idempotente.

ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_sync_enabled BOOLEAN NOT NULL DEFAULT false;
