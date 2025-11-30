-- Billing periods configuration per user
-- Allows configuring the date range for each billing month
-- Example: December 2025 billing includes purchases from Oct 23 to Nov 22

CREATE TABLE IF NOT EXISTS billing_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- The month/year when payment is due
  billing_year INTEGER NOT NULL CHECK (billing_year >= 2000 AND billing_year <= 2100),
  billing_month INTEGER NOT NULL CHECK (billing_month >= 1 AND billing_month <= 12),
  
  -- The date range for transactions that fall into this billing period
  period_start DATE NOT NULL,  -- First day of billing period (e.g., 2025-10-23)
  period_end DATE NOT NULL,    -- Last day of billing period (e.g., 2025-11-22)
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  -- One period per user per billing month
  UNIQUE(user_id, billing_year, billing_month),
  
  -- Ensure period_start is before period_end
  CHECK (period_start < period_end)
);

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_billing_periods_user_date 
ON billing_periods(user_id, billing_year, billing_month);

-- Index for finding which period a transaction date belongs to
CREATE INDEX IF NOT EXISTS idx_billing_periods_range 
ON billing_periods(user_id, period_start, period_end);

COMMENT ON TABLE billing_periods IS 'Stores the date ranges for each billing period per user';
COMMENT ON COLUMN billing_periods.billing_year IS 'Year when payment is due';
COMMENT ON COLUMN billing_periods.billing_month IS 'Month when payment is due (1-12)';
COMMENT ON COLUMN billing_periods.period_start IS 'First date of purchases included in this billing';
COMMENT ON COLUMN billing_periods.period_end IS 'Last date of purchases included in this billing';
