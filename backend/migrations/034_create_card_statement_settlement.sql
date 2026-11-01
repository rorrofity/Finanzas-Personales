-- CSN: insertion provenance/tombstones only; no UPDATE/DELETE of financial rows.
CREATE TABLE IF NOT EXISTS card_statement_actions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 run_id UUID NOT NULL REFERENCES card_statement_runs(id) ON DELETE CASCADE,
 section_index INTEGER NOT NULL CHECK(section_index>=0),
 ordinal INTEGER NOT NULL CHECK(ordinal>=0),
 row_key TEXT NOT NULL,
 fingerprint CHAR(64) NOT NULL,
 decision TEXT NOT NULL CHECK(decision IN ('link','insert')),
 source_type TEXT NOT NULL CHECK(source_type IN ('transaction','international','installment')),
 -- Deliberately no FK: deleting a financial row must retain its tombstone.
 source_id UUID NOT NULL,
 bank_snapshot JSONB NOT NULL,
 financial_snapshot JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(user_id,fingerprint),
 UNIQUE(run_id,section_index,row_key)
);
CREATE INDEX IF NOT EXISTS idx_card_statement_action_source ON card_statement_actions(user_id,source_type,source_id);
ALTER TABLE intl_unbilled ALTER COLUMN exchange_rate DROP NOT NULL;
ALTER TABLE intl_unbilled ALTER COLUMN amount_clp DROP NOT NULL;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='card_statement_usd_conversion_pair' AND conrelid='intl_unbilled'::regclass) THEN
  ALTER TABLE intl_unbilled ADD CONSTRAINT card_statement_usd_conversion_pair CHECK(
   (exchange_rate IS NULL AND amount_clp IS NULL) OR
   (exchange_rate IS NOT NULL AND exchange_rate>0 AND amount_clp IS NOT NULL)
  );
 END IF;
END $$;
