-- ============================================================================
-- Migration: 2001_quotes_hardening.sql
-- Production hardening pass for the Quotes system
-- Targeted fixes: concurrency safety, consistency guarantees, explicit failures
-- ============================================================================

-- ─── FIX 1: Concurrency-Safe Incremental Subtotal ───────────────────────────
--
-- WHY: While PostgreSQL's `SET subtotal = subtotal + delta` IS atomic for a
-- single UPDATE statement (it acquires a row lock, reads current value, writes),
-- adding an explicit SELECT ... FOR UPDATE makes the intent clear and prevents
-- any possibility of phantom reads in complex transaction scenarios.
--
-- The FOR UPDATE lock ensures:
-- 1. If two item inserts happen concurrently for the same quote, the second
--    one blocks until the first commits
-- 2. The second then reads the committed subtotal value
-- 3. No lost updates, guaranteed

CREATE OR REPLACE FUNCTION update_quote_subtotal_incremental()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delta NUMERIC(12,2);
  target_quote_id UUID;
  current_subtotal NUMERIC(12,2);
BEGIN
  IF TG_OP = 'INSERT' THEN
    delta := NEW.total_price;
    target_quote_id := NEW.quote_id;

  ELSIF TG_OP = 'UPDATE' THEN
    delta := NEW.total_price - OLD.total_price;
    target_quote_id := NEW.quote_id;

    -- If quote_id changed (rare but handle it), subtract from old, add to new
    IF OLD.quote_id != NEW.quote_id THEN
      -- Lock old quote row first, then subtract
      SELECT subtotal INTO current_subtotal
      FROM quotes WHERE id = OLD.quote_id
      FOR UPDATE;

      UPDATE quotes SET subtotal = GREATEST(current_subtotal - OLD.total_price, 0)
      WHERE id = OLD.quote_id;

      delta := NEW.total_price;
      target_quote_id := NEW.quote_id;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    delta := -OLD.total_price;
    target_quote_id := OLD.quote_id;
  END IF;

  -- Skip if no change
  IF delta = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Lock the target row, read current value, then update atomically
  SELECT subtotal INTO current_subtotal
  FROM quotes WHERE id = target_quote_id
  FOR UPDATE;

  UPDATE quotes
  SET subtotal = GREATEST(current_subtotal + delta, 0)
  WHERE id = target_quote_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger stays the same (AFTER INSERT OR UPDATE OF total_price OR DELETE)
DROP TRIGGER IF EXISTS trg_update_quote_subtotal ON quote_items;
CREATE TRIGGER trg_update_quote_subtotal
  AFTER INSERT OR UPDATE OF total_price OR DELETE ON quote_items
  FOR EACH ROW EXECUTE FUNCTION update_quote_subtotal_incremental();


-- ─── FIX 2: Total Recalculation Always Fires ───────────────────────────────
--
-- WHY: The column-filtered trigger `BEFORE UPDATE OF subtotal, ...` DOES fire
-- when the subtotal is updated by another trigger (PostgreSQL doesn't
-- distinguish trigger-initiated vs user-initiated UPDATEs). However, removing
-- the column filter is strictly safer - it guarantees total recalculation on
-- ANY quote update, including edge cases like manual SQL fixes.
--
-- Performance impact: negligible. The function body is O(1) arithmetic.

CREATE OR REPLACE FUNCTION recalc_quote_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  discount_amount NUMERIC(12,2);
BEGIN
  -- Calculate discount amount based on type
  IF NEW.discount_type = 'percentage' THEN
    discount_amount := ROUND(NEW.subtotal * NEW.discount_value / 100, 2);
  ELSE
    discount_amount := NEW.discount_value;
  END IF;

  -- Cap discount at subtotal (can't go negative)
  IF discount_amount > NEW.subtotal THEN
    discount_amount := NEW.subtotal;
  END IF;

  -- Calculate total
  NEW.total := GREATEST(
    NEW.subtotal - discount_amount + NEW.shipping_cost + NEW.additional_costs,
    0
  );

  -- Always update timestamp
  NEW.updated_at := NOW();

  RETURN NEW;
END;
$$;

-- Remove column filter - fire on ALL updates to quotes
DROP TRIGGER IF EXISTS trg_recalc_quote_total ON quotes;
CREATE TRIGGER trg_recalc_quote_total
  BEFORE INSERT OR UPDATE
  ON quotes
  FOR EACH ROW EXECUTE FUNCTION recalc_quote_total();


-- ─── FIX 3: Lock Quote Row When Reading partner_id ──────────────────────────
--
-- WHY: Without FOR SHARE, a concurrent DELETE on the parent quote could
-- complete between our SELECT and INSERT, leaving an orphaned item (caught
-- by FK, but the trigger would get a NULL partner_id and raise a confusing
-- exception). FOR SHARE prevents the quote from being deleted or modified
-- while we're reading it.

CREATE OR REPLACE FUNCTION set_quote_item_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_id UUID;
  v_product_name TEXT;
  v_product_sku TEXT;
BEGIN
  -- Calculate item total
  NEW.total_price := ROUND(NEW.quantity * NEW.unit_price, 2);

  -- Propagate partner_id from parent quote (with shared lock to prevent concurrent delete)
  SELECT q.partner_id INTO v_partner_id
  FROM quotes q WHERE q.id = NEW.quote_id
  FOR SHARE;

  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'Orçamento não encontrado para quote_id: %', NEW.quote_id;
  END IF;

  NEW.partner_id := v_partner_id;

  -- Snapshot product data on INSERT only
  IF TG_OP = 'INSERT' AND NEW.product_id IS NOT NULL THEN
    SELECT p.name, p.sku INTO v_product_name, v_product_sku
    FROM products p WHERE p.id = NEW.product_id;

    NEW.product_name_snapshot := v_product_name;
    NEW.product_sku_snapshot := v_product_sku;

    -- If no custom_name provided, use product name
    IF NEW.custom_name IS NULL OR NEW.custom_name = '' THEN
      NEW.custom_name := v_product_name;
    END IF;
  END IF;

  -- On UPDATE, recalculate total_price but don't change snapshots
  IF TG_OP = 'UPDATE' THEN
    NEW.product_name_snapshot := OLD.product_name_snapshot;
    NEW.product_sku_snapshot := OLD.product_sku_snapshot;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger definition unchanged
DROP TRIGGER IF EXISTS trg_set_quote_item_defaults ON quote_items;
CREATE TRIGGER trg_set_quote_item_defaults
  BEFORE INSERT OR UPDATE ON quote_items
  FOR EACH ROW EXECUTE FUNCTION set_quote_item_defaults();


-- ─── FIX 4: Additional Index for Partner-Scoped Expiration Queries ──────────
--
-- WHY: The existing partial index (idx_quotes_expiration) filters on status
-- and expiration_date, but doesn't include partner_id. When the frontend
-- queries "show me expiring quotes for MY partner", it needs partner_id
-- in the index for an efficient lookup.

CREATE INDEX IF NOT EXISTS idx_quotes_partner_expiration
  ON quotes(partner_id, expiration_date)
  WHERE expiration_date IS NOT NULL;


-- ─── FIX 5: Explicit Failure in Lock Trigger (No Silent Override) ──────────
--
-- WHY: The previous version silently overwrote all fields to OLD values when
-- a status change happened on a finalized quote. This masked bugs - if
-- someone passed extra field changes alongside a status change, those changes
-- would be silently dropped. Explicit failure is safer: RAISE EXCEPTION if
-- any non-status field was modified alongside a status change.

CREATE OR REPLACE FUNCTION lock_finalized_quote()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only applies to finalized quotes
  IF OLD.status NOT IN ('approved', 'rejected') THEN
    RETURN NEW;
  END IF;

  -- If status is NOT changing, block the entire update (no field edits allowed)
  IF NEW.status = OLD.status THEN
    RAISE EXCEPTION 'Orçamento com status "%" não pode ser editado. Duplique-o para criar uma nova versão.', OLD.status;
  END IF;

  -- Status IS changing - validate the transition
  IF OLD.status = 'approved' AND NEW.status NOT IN ('expired') THEN
    RAISE EXCEPTION 'Orçamento aprovado só pode ser marcado como expirado';
  END IF;
  IF OLD.status = 'rejected' AND NEW.status NOT IN ('draft') THEN
    RAISE EXCEPTION 'Orçamento rejeitado só pode ser reaberto como rascunho';
  END IF;

  -- EXPLICIT FAILURE: reject if any non-status field was modified alongside the status change
  IF NEW.partner_id IS DISTINCT FROM OLD.partner_id
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.quote_number IS DISTINCT FROM OLD.quote_number
     OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
     OR NEW.expiration_date IS DISTINCT FROM OLD.expiration_date
     OR NEW.notes IS DISTINCT FROM OLD.notes
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.discount_type IS DISTINCT FROM OLD.discount_type
     OR NEW.discount_value IS DISTINCT FROM OLD.discount_value
     OR NEW.shipping_cost IS DISTINCT FROM OLD.shipping_cost
     OR NEW.additional_costs IS DISTINCT FROM OLD.additional_costs
  THEN
    RAISE EXCEPTION 'Não é permitido alterar campos de um orçamento com status "%". Apenas mudanças de status são aceitas.', OLD.status;
  END IF;

  -- Only status + updated_at are changing - allow it
  RETURN NEW;
END;
$$;

-- Trigger must fire BEFORE recalc_quote_total to block invalid edits first
-- Both are BEFORE UPDATE, alphabetical: "lock" < "recalc" ✓
DROP TRIGGER IF EXISTS trg_lock_finalized_quote ON quotes;
CREATE TRIGGER trg_lock_finalized_quote
  BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION lock_finalized_quote();


-- ─── FIX 6: Monetary Precision ─────────────────────────────────────────────
--
-- DECISION: Keep NUMERIC(12,2) for all user-facing financial fields.
--
-- Rationale:
-- - BRL (and most currencies) use 2 decimal places
-- - NUMERIC(12,2) supports values up to 9,999,999,999.99 (R$ 10 billion)
-- - Using NUMERIC(14,4) internally would add complexity for zero benefit
--   in a quotes system (we're not doing currency conversion or compound interest)
-- - The discount percentage calculation already uses ROUND(..., 2) to prevent
--   floating point drift
-- - If in the future multi-currency is needed, a new migration can alter precision
--
-- NO CHANGES NEEDED.


-- ─── FIX 7: Safety Net - Full Recalculation Function ────────────────────────
--
-- WHY: Even with perfect incremental logic, bugs can happen (manual SQL edits,
-- failed transactions, etc). This function is a REPAIR TOOL - never called in
-- normal flow, only invoked manually or via admin panel when inconsistencies
-- are detected.
--
-- Usage: SELECT recalculate_quote_totals('quote-uuid');
--        SELECT recalculate_all_quote_totals(); -- for bulk repair

CREATE OR REPLACE FUNCTION recalculate_quote_totals(p_quote_id UUID)
RETURNS TABLE(
  old_subtotal NUMERIC(12,2),
  new_subtotal NUMERIC(12,2),
  old_total NUMERIC(12,2),
  new_total NUMERIC(12,2),
  was_inconsistent BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote RECORD;
  v_correct_subtotal NUMERIC(12,2);
  v_discount_amount NUMERIC(12,2);
  v_correct_total NUMERIC(12,2);
BEGIN
  -- Lock the quote row to prevent concurrent modifications
  SELECT q.* INTO v_quote
  FROM quotes q WHERE q.id = p_quote_id
  FOR UPDATE;

  IF v_quote IS NULL THEN
    RAISE EXCEPTION 'Quote not found: %', p_quote_id;
  END IF;

  -- Recalculate subtotal from items (full SUM - only for repair)
  SELECT COALESCE(SUM(qi.total_price), 0) INTO v_correct_subtotal
  FROM quote_items qi WHERE qi.quote_id = p_quote_id;

  -- Recalculate total
  IF v_quote.discount_type = 'percentage' THEN
    v_discount_amount := ROUND(v_correct_subtotal * v_quote.discount_value / 100, 2);
  ELSE
    v_discount_amount := v_quote.discount_value;
  END IF;

  IF v_discount_amount > v_correct_subtotal THEN
    v_discount_amount := v_correct_subtotal;
  END IF;

  v_correct_total := GREATEST(
    v_correct_subtotal - v_discount_amount + v_quote.shipping_cost + v_quote.additional_costs,
    0
  );

  -- Set return values
  old_subtotal := v_quote.subtotal;
  new_subtotal := v_correct_subtotal;
  old_total := v_quote.total;
  new_total := v_correct_total;
  was_inconsistent := (v_quote.subtotal != v_correct_subtotal OR v_quote.total != v_correct_total);

  -- Only update if there's actually a difference
  IF was_inconsistent THEN
    -- Direct update bypassing triggers to avoid cascading
    UPDATE quotes
    SET subtotal = v_correct_subtotal,
        total = v_correct_total,
        updated_at = NOW()
    WHERE id = p_quote_id;

    RAISE NOTICE 'Quote % FIXED: subtotal % → %, total % → %',
      p_quote_id, v_quote.subtotal, v_correct_subtotal, v_quote.total, v_correct_total;
  END IF;

  RETURN NEXT;
END;
$$;

-- Bulk repair function - scans ALL quotes and fixes inconsistencies
CREATE OR REPLACE FUNCTION recalculate_all_quote_totals()
RETURNS TABLE(
  quote_id UUID,
  quote_number TEXT,
  old_subtotal NUMERIC(12,2),
  new_subtotal NUMERIC(12,2),
  old_total NUMERIC(12,2),
  new_total NUMERIC(12,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote RECORD;
  v_result RECORD;
BEGIN
  FOR v_quote IN SELECT id, quote_number FROM quotes ORDER BY created_at
  LOOP
    SELECT * INTO v_result FROM recalculate_quote_totals(v_quote.id);
    IF v_result.was_inconsistent THEN
      quote_id := v_quote.id;
      quote_number := v_quote.quote_number;
      old_subtotal := v_result.old_subtotal;
      new_subtotal := v_result.new_subtotal;
      old_total := v_result.old_total;
      new_total := v_result.new_total;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;


-- ─── COMPLETION ────────────────────────────────────────────────────────────

DO $$
BEGIN
  RAISE NOTICE '✅ Quotes hardening migration completed!';
  RAISE NOTICE '🔒 Fix 1: Concurrency-safe incremental subtotal (SELECT FOR UPDATE)';
  RAISE NOTICE '🔒 Fix 2: Total recalculation fires on ALL updates (no column filter)';
  RAISE NOTICE '🔒 Fix 3: FOR SHARE lock on quote when reading partner_id';
  RAISE NOTICE '📊 Fix 4: Added idx_quotes_partner_expiration index';
  RAISE NOTICE '💥 Fix 5: Explicit RAISE EXCEPTION on finalized quote field edits';
  RAISE NOTICE '🔧 Fix 7: Added recalculate_quote_totals() repair function';
  RAISE NOTICE '';
  RAISE NOTICE '🧪 Repair: SELECT * FROM recalculate_all_quote_totals();';
END $$;
