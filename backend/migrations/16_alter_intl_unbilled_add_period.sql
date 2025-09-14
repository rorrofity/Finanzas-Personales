-- Add period fields and original date to intl_unbilled
ALTER TABLE intl_unbilled
  ADD COLUMN IF NOT EXISTS original_fecha DATE,
  ADD COLUMN IF NOT EXISTS period_year INT,
  ADD COLUMN IF NOT EXISTS period_month INT;

-- Backfill existing rows: set original_fecha = fecha, period_* from fecha
UPDATE intl_unbilled
SET original_fecha = COALESCE(original_fecha, fecha),
    period_year = COALESCE(period_year, EXTRACT(YEAR FROM fecha)::INT),
    period_month = COALESCE(period_month, EXTRACT(MONTH FROM fecha)::INT)
WHERE original_fecha IS NULL OR period_year IS NULL OR period_month IS NULL;

-- Set NOT NULL constraints after backfill
ALTER TABLE intl_unbilled
  ALTER COLUMN original_fecha SET NOT NULL,
  ALTER COLUMN period_year SET NOT NULL,
  ALTER COLUMN period_month SET NOT NULL;

-- Helpful indexes for period queries
CREATE INDEX IF NOT EXISTS idx_intl_unbilled_period ON intl_unbilled(user_id, period_year, period_month);
