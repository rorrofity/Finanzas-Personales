-- Enable extension for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create projected templates table
CREATE TABLE IF NOT EXISTS projected_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nombre VARCHAR(60) NOT NULL,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('ingreso','gasto')),
  monto NUMERIC(14,2) NOT NULL CHECK (monto > 0),
  day_of_month INT NOT NULL CHECK (day_of_month >= 1 AND day_of_month <= 31),
  start_year INT NOT NULL CHECK (start_year BETWEEN 2000 AND 2100),
  start_month INT NOT NULL CHECK (start_month BETWEEN 1 AND 12),
  category_id INT NULL REFERENCES categories(id) ON DELETE SET NULL,
  notas VARCHAR(140),
  repeat_monthly BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projected_templates_user_period
  ON projected_templates (user_id, start_year, start_month);
