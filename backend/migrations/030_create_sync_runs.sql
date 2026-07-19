-- Epic 13: bitácora de ejecuciones de sincronización (manual y programada).
-- Idempotente.

CREATE TABLE IF NOT EXISTS sync_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trigger VARCHAR(12) NOT NULL CHECK (trigger IN ('manual', 'scheduled')),
    imported INTEGER NOT NULL DEFAULT 0,
    skipped INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_user_created ON sync_runs(user_id, created_at DESC);
