-- HRO: additive invitation metadata only. Existing members/financial rows unchanged.
ALTER TABLE space_members ADD COLUMN IF NOT EXISTS invite_token_hash TEXT;
ALTER TABLE space_members ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ;
ALTER TABLE space_members ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS idx_space_members_invite_token_hash
  ON space_members (invite_token_hash) WHERE invite_token_hash IS NOT NULL;
