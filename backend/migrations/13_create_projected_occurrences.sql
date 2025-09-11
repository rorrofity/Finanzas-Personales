-- Create projected occurrences table
CREATE TABLE IF NOT EXISTS projected_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES projected_templates(id) ON DELETE CASCADE,
  year INT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  fecha DATE NOT NULL,
  override BOOLEAN NOT NULL DEFAULT FALSE,
  -- override fields (nullable; effective value = COALESCE(occurrence.field, template.field))
  nombre VARCHAR(60),
  tipo VARCHAR(10) CHECK (tipo IN ('ingreso','gasto')),
  monto NUMERIC(14,2) CHECK (monto > 0),
  category_id INT NULL REFERENCES categories(id) ON DELETE SET NULL,
  notas VARCHAR(140),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(template_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_projected_occurrences_user_period
  ON projected_occurrences (user_id, year, month);
