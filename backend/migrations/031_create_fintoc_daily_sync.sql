-- Epic18: additive integration metadata only; existing financial tables are untouched.
CREATE TABLE IF NOT EXISTS fintoc_sync_state (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  cutover_date DATE NOT NULL,
  last_success_at TIMESTAMPTZ,
  bank_updated_at TIMESTAMPTZ,
  coverage_since DATE,
  coverage_until DATE,
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, account_id)
);

CREATE TABLE IF NOT EXISTS fintoc_external_movements (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  fecha DATE NOT NULL,
  descripcion TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('cargo', 'abono')),
  amount NUMERIC(20,0) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL,
  pending BOOLEAN NOT NULL,
  provider_hash TEXT NOT NULL,
  first_snapshot JSONB NOT NULL,
  financial_snapshot JSONB,
  disposition TEXT NOT NULL CHECK (disposition IN ('linked', 'inserted', 'needs_review', 'observed')),
  reason TEXT,
  candidate_count INTEGER NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  checking_transaction_id UUID REFERENCES checking_transactions(id) ON DELETE SET NULL,
  had_financial_reference BOOLEAN NOT NULL DEFAULT false,
  created_checking BOOLEAN NOT NULL DEFAULT false,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, account_id, external_id),
  UNIQUE (user_id, account_id, checking_transaction_id)
);
CREATE INDEX IF NOT EXISTS idx_fintoc_external_review
  ON fintoc_external_movements(user_id, account_id, disposition, fecha);

CREATE TABLE IF NOT EXISTS fintoc_sync_runs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('initial', 'manual', 'scheduled')),
  status TEXT NOT NULL CHECK (status IN ('success', 'error')),
  inserted INTEGER NOT NULL DEFAULT 0 CHECK (inserted >= 0),
  linked INTEGER NOT NULL DEFAULT 0 CHECK (linked >= 0),
  review INTEGER NOT NULL DEFAULT 0 CHECK (review >= 0),
  coverage_since DATE,
  coverage_until DATE,
  bank_updated_at TIMESTAMPTZ,
  error_code TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fintoc_runs_owner_account
  ON fintoc_sync_runs(user_id, account_id, id DESC);
