-- Add period (year, month) to imports to support grouping by statement period regardless of transaction dates
ALTER TABLE IF EXISTS imports
ADD COLUMN IF NOT EXISTS period_year integer,
ADD COLUMN IF NOT EXISTS period_month integer;

CREATE INDEX IF NOT EXISTS idx_imports_period ON imports (user_id, period_year, period_month);
