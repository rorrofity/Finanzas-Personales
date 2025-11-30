-- Add billing_year and billing_month to transactions table
-- These fields represent when the transaction will be billed/paid (not when it occurred)
-- 
-- Example: A purchase on Nov 26 with billing cutoff on the 22nd
-- fecha: 2025-11-26 (when purchase happened)
-- billing_year: 2026, billing_month: 1 (when it will be paid - January)

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS billing_year INTEGER,
ADD COLUMN IF NOT EXISTS billing_month INTEGER;

-- Add constraints to ensure valid values
ALTER TABLE transactions
ADD CONSTRAINT chk_billing_year CHECK (billing_year IS NULL OR (billing_year >= 2000 AND billing_year <= 2100)),
ADD CONSTRAINT chk_billing_month CHECK (billing_month IS NULL OR (billing_month >= 1 AND billing_month <= 12));

-- Index for efficient querying by billing period
CREATE INDEX IF NOT EXISTS idx_transactions_billing_period 
ON transactions(user_id, billing_year, billing_month);

-- Migrate existing transactions: calculate billing period based on fecha
-- Rule: Day >= 22 → billed 2 months later; Day < 22 → billed 1 month later
UPDATE transactions
SET 
  billing_year = CASE 
    WHEN EXTRACT(DAY FROM fecha) >= 22 THEN
      CASE 
        WHEN EXTRACT(MONTH FROM fecha) + 2 > 12 
        THEN EXTRACT(YEAR FROM fecha)::INTEGER + FLOOR((EXTRACT(MONTH FROM fecha) + 1) / 12)::INTEGER
        ELSE EXTRACT(YEAR FROM fecha)::INTEGER
      END
    ELSE
      CASE 
        WHEN EXTRACT(MONTH FROM fecha) + 1 > 12 
        THEN EXTRACT(YEAR FROM fecha)::INTEGER + 1
        ELSE EXTRACT(YEAR FROM fecha)::INTEGER
      END
  END,
  billing_month = CASE 
    WHEN EXTRACT(DAY FROM fecha) >= 22 THEN
      CASE 
        WHEN EXTRACT(MONTH FROM fecha) + 2 > 12 
        THEN ((EXTRACT(MONTH FROM fecha)::INTEGER + 1) % 12) + 1
        ELSE EXTRACT(MONTH FROM fecha)::INTEGER + 2
      END
    ELSE
      CASE 
        WHEN EXTRACT(MONTH FROM fecha) + 1 > 12 
        THEN 1
        ELSE EXTRACT(MONTH FROM fecha)::INTEGER + 1
      END
  END
WHERE billing_year IS NULL OR billing_month IS NULL;

-- Comment on columns for documentation
COMMENT ON COLUMN transactions.billing_year IS 'Year when this transaction will be billed/paid';
COMMENT ON COLUMN transactions.billing_month IS 'Month when this transaction will be billed/paid (1-12)';
