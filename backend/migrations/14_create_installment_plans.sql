-- Instalment plans (credit card purchases in installments)
-- Requires pgcrypto for gen_random_uuid
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS installment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brand VARCHAR(20) NOT NULL CHECK (brand IN ('visa','mastercard')),
  descripcion VARCHAR(100) NOT NULL,
  amount_per_installment NUMERIC(12,2) NOT NULL CHECK (amount_per_installment > 0),
  total_installments INTEGER NOT NULL CHECK (total_installments >= 1),
  start_year INTEGER NOT NULL CHECK (start_year BETWEEN 2000 AND 2100),
  start_month INTEGER NOT NULL CHECK (start_month BETWEEN 1 AND 12),
  start_installment INTEGER NOT NULL CHECK (start_installment >= 1),
  category_id INTEGER NULL REFERENCES categories(id) ON DELETE SET NULL,
  notas VARCHAR(140),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_installment_plans_user ON installment_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_installment_plans_brand ON installment_plans(brand);

-- Occurrences per month
CREATE TABLE IF NOT EXISTS installment_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES installment_plans(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  installment_number INTEGER NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  category_id INTEGER NULL REFERENCES categories(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(plan_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_installment_occurrences_user ON installment_occurrences(user_id);
CREATE INDEX IF NOT EXISTS idx_installment_occurrences_period ON installment_occurrences(year, month);
