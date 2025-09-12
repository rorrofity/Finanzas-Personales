-- International unbilled credit card transactions (USD converted to CLP)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS intl_unbilled (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brand VARCHAR(20) NOT NULL CHECK (brand IN ('visa','mastercard')),
  fecha DATE NOT NULL,
  descripcion VARCHAR(255) NOT NULL,
  amount_usd NUMERIC(14,2) NOT NULL,
  exchange_rate NUMERIC(14,4) NOT NULL CHECK (exchange_rate > 0),
  amount_clp NUMERIC(14,2) NOT NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('gasto','pago','desestimar')),
  category_id INTEGER NULL REFERENCES categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_intl_unbilled_user ON intl_unbilled(user_id);
CREATE INDEX IF NOT EXISTS idx_intl_unbilled_brand ON intl_unbilled(brand);
CREATE INDEX IF NOT EXISTS idx_intl_unbilled_fecha ON intl_unbilled(fecha);
