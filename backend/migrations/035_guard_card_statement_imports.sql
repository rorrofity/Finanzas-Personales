-- CSN-18: protect only future INSERTs against already reconciled statement evidence.
-- No financial UPDATE/DELETE, historical deduplication or constraint removal.
CREATE OR REPLACE FUNCTION card_statement_normalize_merchant(value TEXT)
RETURNS TEXT LANGUAGE SQL IMMUTABLE PARALLEL SAFE AS $$
 SELECT btrim(regexp_replace(
  regexp_replace(
   regexp_replace(lower(translate(COALESCE(value,''),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')),'[^a-z0-9]+',' ','g'),
   '\m(compra|compras|pago|con|tarjeta|credito|debito)\M',' ','g'),
  '\s+',' ','g'));
$$;

CREATE OR REPLACE FUNCTION card_statement_guard_financial_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
 candidate_currency TEXT;
 candidate_amount NUMERIC;
 candidate_merchant TEXT;
 candidate_network TEXT;
 candidate_card TEXT;
 imported_provider TEXT;
 imported_network TEXT;
 metadata_provider TEXT;
 record_data RECORD;
 bank_merchant TEXT;
 bank_network TEXT;
 bank_card TEXT;
BEGIN
 -- This transaction-local context is set only by the private settlement
 -- service after exclusive locks and digest revalidation. Never trust a
 -- metadata/payload marker: normal imports and manual requests stay guarded.
 IF current_setting('app.card_statement_apply',true)='true' THEN RETURN NEW; END IF;
 IF NEW.user_id IS NULL OR NEW.fecha IS NULL OR NEW.tipo IS DISTINCT FROM 'gasto' THEN
  RETURN NEW;
 END IF;
 candidate_merchant := card_statement_normalize_merchant(NEW.descripcion);
 IF candidate_merchant='' THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='transactions' THEN
  candidate_currency := 'CLP';
  candidate_amount := ABS(NEW.monto);
  SELECT card_statement_normalize_merchant(i.provider),lower(btrim(i.network))
   INTO imported_provider,imported_network
   FROM imports i WHERE i.id=NEW.import_id AND i.user_id=NEW.user_id;
  metadata_provider := card_statement_normalize_merchant(NEW.metadata->>'banco');
  -- Explicit other-bank provenance is outside this guard. Unknown/manual rows
  -- without any explicit Banco de Chile origin retain their existing rules.
  IF (COALESCE(imported_provider,'')<>'' AND imported_provider NOT IN ('banco chile','banco de chile','bancochile','chile','unknown','desconocido','email'))
   OR (metadata_provider<>'' AND metadata_provider NOT IN ('banco chile','banco de chile','bancochile','chile','unknown','desconocido','email')) THEN
   RETURN NEW;
  END IF;
  IF COALESCE(imported_provider,'') NOT IN ('banco chile','banco de chile','bancochile','chile')
   AND metadata_provider NOT IN ('banco chile','banco de chile','bancochile','chile') THEN
   RETURN NEW;
  END IF;
  candidate_network := lower(btrim(COALESCE(NULLIF(imported_network,''),NULLIF(NEW.metadata->>'tipo_tarjeta',''),NULLIF(NEW.metadata->>'network',''))));
  candidate_card := COALESCE(NULLIF(NEW.metadata->>'tarjeta_ultimos_4',''),NULLIF(NEW.metadata->>'card_last_four',''));
  IF candidate_card IS NOT NULL AND candidate_card !~ '^[0-9]{4}$' THEN candidate_card:=NULL; END IF;
 ELSE
  candidate_currency := 'USD';
  candidate_amount := NEW.amount_usd;
  candidate_network := lower(btrim(NEW.brand));
  -- intl_unbilled has no physical-card field; a compatible known brand can
  -- establish a possible duplicate but cannot invent a last-four identity.
  candidate_card := NULL;
 END IF;
 IF candidate_network NOT IN ('visa','mastercard') THEN candidate_network:=NULL; END IF;
 IF candidate_amount IS NULL THEN RETURN NEW; END IF;
 FOR record_data IN
  SELECT a.bank_snapshot
  FROM card_statement_actions a
  WHERE a.user_id=NEW.user_id
   AND a.bank_snapshot->>'currency'=candidate_currency
   -- ISO dates compare chronologically without evaluating an untrusted cast.
   AND a.bank_snapshot->>'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   AND a.bank_snapshot->>'date' BETWEEN to_char(NEW.fecha-3,'YYYY-MM-DD') AND to_char(NEW.fecha+3,'YYYY-MM-DD')
   AND a.bank_snapshot->>'kind' IN ('purchase','fee','installment')
   AND CASE WHEN a.bank_snapshot->>'amount' ~ '^-?[0-9]+(\.[0-9]{1,2})?$'
     THEN CASE WHEN candidate_currency='CLP' THEN ABS((a.bank_snapshot->>'amount')::NUMERIC)
       ELSE (a.bank_snapshot->>'amount')::NUMERIC END ELSE NULL END=candidate_amount
 LOOP
  bank_network:=lower(btrim(record_data.bank_snapshot->>'network'));
  bank_card:=record_data.bank_snapshot->>'cardLastFour';
  -- A different explicit card is separate. A contradictory network on the
  -- same explicit physical card is uncertain and must remain for review.
  IF candidate_card IS NOT NULL AND bank_card IS NOT NULL AND candidate_card<>bank_card THEN CONTINUE; END IF;
  IF candidate_network IS NOT NULL AND bank_network IS NOT NULL AND candidate_network<>bank_network
   AND NOT (candidate_card IS NOT NULL AND bank_card IS NOT NULL AND candidate_card=bank_card) THEN CONTINUE; END IF;
  bank_merchant:=card_statement_normalize_merchant(record_data.bank_snapshot->>'description');
  IF bank_merchant<>'' AND (bank_merchant=candidate_merchant
    OR (LEAST(length(bank_merchant),length(candidate_merchant))>=6
      AND (position(bank_merchant IN candidate_merchant)>0 OR position(candidate_merchant IN bank_merchant)>0))) THEN
   -- Keep tombstones: checking whether source_id still exists would resurrect
   -- charges the owner deliberately removed. Error contains no banking data.
   RAISE EXCEPTION USING ERRCODE='23505',CONSTRAINT='card_statement_duplicate_insert',MESSAGE='Cargo ya conciliado; revisar';
  END IF;
 END LOOP;
 RETURN NEW;
END;
$$;

DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='transactions'::regclass AND tgname='guard_card_statement_transaction_insert' AND NOT tgisinternal) THEN
  CREATE TRIGGER guard_card_statement_transaction_insert BEFORE INSERT ON transactions
   FOR EACH ROW EXECUTE FUNCTION card_statement_guard_financial_insert();
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='intl_unbilled'::regclass AND tgname='guard_card_statement_international_insert' AND NOT tgisinternal) THEN
  CREATE TRIGGER guard_card_statement_international_insert BEFORE INSERT ON intl_unbilled
   FOR EACH ROW EXECUTE FUNCTION card_statement_guard_financial_insert();
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_card_statement_action_guard
 ON card_statement_actions(user_id,(bank_snapshot->>'currency'),(bank_snapshot->>'date'));
