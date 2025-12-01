-- Add known_balance columns to checking_balances
ALTER TABLE checking_balances 
ADD COLUMN IF NOT EXISTS known_balance NUMERIC(14,2) NULL,
ADD COLUMN IF NOT EXISTS balance_date DATE NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_checking_balance_date ON checking_balances(user_id, balance_date DESC);
