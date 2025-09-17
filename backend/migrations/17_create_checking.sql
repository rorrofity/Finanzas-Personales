-- Checking account: initial monthly balances and real movements
CREATE TABLE IF NOT EXISTS checking_balances (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year INT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  initial_balance NUMERIC(14,2) NOT NULL CHECK (initial_balance >= 0),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, year, month)
);

CREATE TABLE IF NOT EXISTS checking_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year INT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  fecha DATE NOT NULL,
  descripcion VARCHAR(60) NOT NULL,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('abono','cargo')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  category_id INTEGER NULL REFERENCES categories(id) ON DELETE SET NULL,
  notas VARCHAR(140),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_checking_tx_user_period ON checking_transactions(user_id, year, month);
CREATE INDEX IF NOT EXISTS idx_checking_tx_fecha ON checking_transactions(fecha);
