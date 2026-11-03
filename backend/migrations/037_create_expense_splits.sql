-- ESP-01..07: reversible category overlays; financial source rows are never rewritten.
CREATE TABLE IF NOT EXISTS expense_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('tc_nacional','tc_internacional','cuenta_corriente')),
  transaction_id UUID UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
  intl_unbilled_id UUID UNIQUE REFERENCES intl_unbilled(id) ON DELETE CASCADE,
  checking_transaction_id UUID UNIQUE REFERENCES checking_transactions(id) ON DELETE CASCADE,
  amount_clp NUMERIC(14,2) NOT NULL CHECK (amount_clp > 0),
  version UUID NOT NULL DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT expense_splits_exact_source CHECK (
    (source='tc_nacional' AND transaction_id IS NOT NULL AND intl_unbilled_id IS NULL AND checking_transaction_id IS NULL) OR
    (source='tc_internacional' AND transaction_id IS NULL AND intl_unbilled_id IS NOT NULL AND checking_transaction_id IS NULL) OR
    (source='cuenta_corriente' AND transaction_id IS NULL AND intl_unbilled_id IS NULL AND checking_transaction_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_expense_splits_owner_source ON expense_splits(user_id,source);
CREATE TABLE IF NOT EXISTS expense_split_parts (
  split_id UUID NOT NULL REFERENCES expense_splits(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 49),
  amount_clp NUMERIC(14,2) NOT NULL CHECK (amount_clp > 0),
  category_id INTEGER CONSTRAINT expense_split_parts_category_id_fkey REFERENCES categories(id) ON DELETE RESTRICT,
  PRIMARY KEY(split_id,position)
);
CREATE INDEX IF NOT EXISTS idx_expense_split_parts_category ON expense_split_parts(category_id);

CREATE OR REPLACE FUNCTION validate_expense_split_parent() RETURNS TRIGGER AS $$
DECLARE parent_owner UUID; parent_amount NUMERIC; parent_type TEXT; parent_description TEXT;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.user_id,NEW.source,NEW.transaction_id,NEW.intl_unbilled_id,NEW.checking_transaction_id,NEW.amount_clp)
    IS DISTINCT FROM (OLD.user_id,OLD.source,OLD.transaction_id,OLD.intl_unbilled_id,OLD.checking_transaction_id,OLD.amount_clp) THEN
    RAISE EXCEPTION 'EXPENSE_SPLIT_PARENT_LOCKED' USING ERRCODE='P0001';
  END IF;
  IF NEW.source='tc_nacional' THEN
    SELECT user_id,monto,tipo,descripcion INTO parent_owner,parent_amount,parent_type,parent_description FROM transactions WHERE id=NEW.transaction_id FOR UPDATE;
  ELSIF NEW.source='tc_internacional' THEN
    SELECT user_id,amount_clp,tipo,descripcion INTO parent_owner,parent_amount,parent_type,parent_description FROM intl_unbilled WHERE id=NEW.intl_unbilled_id FOR UPDATE;
  ELSIF NEW.source='cuenta_corriente' THEN
    SELECT user_id,amount,tipo,descripcion INTO parent_owner,parent_amount,parent_type,parent_description FROM checking_transactions WHERE id=NEW.checking_transaction_id FOR UPDATE;
  END IF;
  IF parent_owner IS NULL OR parent_owner<>NEW.user_id OR parent_amount<>NEW.amount_clp OR parent_amount<=0
    OR (NEW.source='cuenta_corriente' AND (parent_type<>'cargo' OR LOWER(parent_description) LIKE '%pago%tarjeta%' OR LOWER(parent_description) LIKE '%pago tc%'))
    OR (NEW.source<>'cuenta_corriente' AND parent_type<>'gasto') THEN
    RAISE EXCEPTION 'EXPENSE_SPLIT_INVALID_PARENT' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_expense_split_parent ON expense_splits;
CREATE TRIGGER trg_expense_split_parent BEFORE INSERT OR UPDATE ON expense_splits FOR EACH ROW EXECUTE FUNCTION validate_expense_split_parent();

CREATE OR REPLACE FUNCTION validate_expense_split_category() RETURNS TRIGGER AS $$
DECLARE split_owner UUID;
BEGIN
  IF TG_OP='UPDATE' AND NEW.split_id IS DISTINCT FROM OLD.split_id THEN
    RAISE EXCEPTION 'EXPENSE_SPLIT_IMMUTABLE_PART_PARENT' USING ERRCODE='23514';
  END IF;
  IF NEW.category_id IS NOT NULL THEN
    SELECT user_id INTO split_owner FROM expense_splits WHERE id=NEW.split_id;
    IF NOT EXISTS(SELECT 1 FROM categories WHERE id=NEW.category_id AND (user_id=split_owner OR user_id IS NULL)) THEN
      RAISE EXCEPTION 'EXPENSE_SPLIT_INVALID_CATEGORY' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_expense_split_category ON expense_split_parts;
CREATE TRIGGER trg_expense_split_category BEFORE INSERT OR UPDATE ON expense_split_parts FOR EACH ROW EXECUTE FUNCTION validate_expense_split_category();

CREATE OR REPLACE FUNCTION validate_expense_split_total() RETURNS TRIGGER AS $$
DECLARE affected UUID; expected NUMERIC; actual NUMERIC; count_parts INTEGER; low_position INTEGER; high_position INTEGER;
BEGIN
  IF TG_TABLE_NAME='expense_splits' THEN affected:=COALESCE(NEW.id,OLD.id);
  ELSE affected:=COALESCE(NEW.split_id,OLD.split_id); END IF;
  SELECT amount_clp INTO expected FROM expense_splits WHERE id=affected;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT SUM(amount_clp),COUNT(*),MIN(position),MAX(position) INTO actual,count_parts,low_position,high_position FROM expense_split_parts WHERE split_id=affected;
  IF count_parts<2 OR count_parts>50 OR actual IS DISTINCT FROM expected OR low_position<>0 OR high_position<>count_parts-1 THEN
    RAISE EXCEPTION 'EXPENSE_SPLIT_TOTAL_MISMATCH' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS expense_splits_total_check ON expense_splits;
CREATE CONSTRAINT TRIGGER expense_splits_total_check AFTER INSERT OR UPDATE ON expense_splits DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_expense_split_total();
DROP TRIGGER IF EXISTS expense_split_parts_total_check ON expense_split_parts;
CREATE CONSTRAINT TRIGGER expense_split_parts_total_check AFTER INSERT OR UPDATE OR DELETE ON expense_split_parts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_expense_split_total();

CREATE OR REPLACE FUNCTION guard_split_financial_parent() RETURNS TRIGGER AS $$
DECLARE has_split BOOLEAN;
BEGIN
  IF (to_jsonb(NEW)-ARRAY['updated_at','updated_by']) IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['updated_at','updated_by']) THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='transactions' THEN SELECT EXISTS(SELECT 1 FROM expense_splits WHERE transaction_id=OLD.id) INTO has_split;
  ELSIF TG_TABLE_NAME='intl_unbilled' THEN SELECT EXISTS(SELECT 1 FROM expense_splits WHERE intl_unbilled_id=OLD.id) INTO has_split;
  ELSE SELECT EXISTS(SELECT 1 FROM expense_splits WHERE checking_transaction_id=OLD.id) INTO has_split; END IF;
  IF has_split THEN RAISE EXCEPTION 'EXPENSE_SPLIT_PARENT_LOCKED' USING ERRCODE='P0001'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_guard_expense_split ON transactions;
CREATE TRIGGER trg_guard_expense_split BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION guard_split_financial_parent();
DROP TRIGGER IF EXISTS trg_guard_expense_split ON intl_unbilled;
CREATE TRIGGER trg_guard_expense_split BEFORE UPDATE ON intl_unbilled FOR EACH ROW EXECUTE FUNCTION guard_split_financial_parent();
DROP TRIGGER IF EXISTS trg_guard_expense_split ON checking_transactions;
CREATE TRIGGER trg_guard_expense_split BEFORE UPDATE ON checking_transactions FOR EACH ROW EXECUTE FUNCTION guard_split_financial_parent();
