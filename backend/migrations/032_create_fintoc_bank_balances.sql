-- FBA: bank-reported snapshot only. Existing checking balances and expenses are untouched.
CREATE TABLE IF NOT EXISTS fintoc_bank_balances (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency = 'CLP'),
  available NUMERIC(20,0) NOT NULL,
  current NUMERIC(20,0) NOT NULL,
  bank_updated_at TIMESTAMPTZ,
  queried_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, account_id)
);
