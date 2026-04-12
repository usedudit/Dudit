-- ============================================================================
-- Migration: 2000_create_quotes_system.sql
-- Creates the Quotes / Estimates (Orçamentos) system
-- Production-ready: incremental totals, denormalized partner_id, safe sequences
-- ============================================================================

-- ─── PART 1: QUOTE NUMBER SEQUENCE ──────────────────────────────────────────
-- Uses a PostgreSQL sequence for collision-safe, concurrent-safe numbering.
-- Format: ORC-YYYYMM-NNNNNN (e.g. ORC-202603-000001)
-- The sequence is global; the formatted number includes year-month for readability.

CREATE SEQUENCE IF NOT EXISTS quote_number_seq START 1 INCREMENT 1;

-- Function to generate quote number from sequence (no retries needed)
CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  seq_val BIGINT;
  year_month TEXT;
BEGIN
  seq_val := nextval('quote_number_seq');
  year_month := to_char(NOW(), 'YYYYMM');
  RETURN 'ORC-' || year_month || '-' || lpad(seq_val::TEXT, 6, '0');
END;
$$;


-- ─── PART 2: QUOTES TABLE ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.quotes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id        UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  customer_id       UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  quote_number      TEXT NOT NULL UNIQUE,

  -- Status management
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'sent', 'approved', 'rejected', 'expired')),

  -- Dates
  issue_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  expiration_date   DATE,

  -- Notes
  notes             TEXT,

  -- Financial fields (pre-calculated for fast reads)
  subtotal          NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_type     TEXT NOT NULL DEFAULT 'fixed'
                    CHECK (discount_type IN ('fixed', 'percentage')),
  discount_value    NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipping_cost     NUMERIC(12,2) NOT NULL DEFAULT 0,
  additional_costs  NUMERIC(12,2) NOT NULL DEFAULT 0,
  total             NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Timestamps
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- ─── Financial Constraints ────────────────────────────────────────────
  CONSTRAINT quotes_discount_value_positive CHECK (discount_value >= 0),
  CONSTRAINT quotes_discount_percentage_max CHECK (
    discount_type != 'percentage' OR discount_value <= 100
  ),
  CONSTRAINT quotes_shipping_positive CHECK (shipping_cost >= 0),
  CONSTRAINT quotes_additional_positive CHECK (additional_costs >= 0),
  CONSTRAINT quotes_subtotal_positive CHECK (subtotal >= 0),
  CONSTRAINT quotes_total_positive CHECK (total >= 0),

  -- Expiration must be >= issue date
  CONSTRAINT quotes_expiration_after_issue CHECK (
    expiration_date IS NULL OR expiration_date >= issue_date
  )
);


-- ─── PART 3: QUOTE ITEMS TABLE ─────────────────────────────────────────────
-- partner_id is denormalized here to avoid JOINs in RLS policies.

CREATE TABLE IF NOT EXISTS public.quote_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id              UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  partner_id            UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,

  -- Product reference (nullable for manual items)
  product_id            UUID REFERENCES public.products(id) ON DELETE SET NULL,

  -- Item data (custom_name used for manual items or as snapshot)
  custom_name           TEXT,
  description           TEXT,

  -- Product snapshots (populated on INSERT, immutable after)
  product_name_snapshot TEXT,
  product_sku_snapshot  TEXT,

  -- Financial
  quantity              NUMERIC(12,4) NOT NULL DEFAULT 1,
  unit_price            NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price           NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Ordering
  sort_order            INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- ─── Constraints ─────────────────────────────────────────────────────
  CONSTRAINT qi_quantity_positive CHECK (quantity > 0),
  CONSTRAINT qi_quantity_max CHECK (quantity <= 999999),
  CONSTRAINT qi_unit_price_positive CHECK (unit_price >= 0),
  CONSTRAINT qi_unit_price_max CHECK (unit_price <= 99999999.99),
  CONSTRAINT qi_total_price_positive CHECK (total_price >= 0),

  -- At least one of product_id or custom_name must be set
  CONSTRAINT qi_has_name CHECK (product_id IS NOT NULL OR custom_name IS NOT NULL)
);


-- ─── PART 4: INDEXES ────────────────────────────────────────────────────────

-- Quotes: main list query (partner + date sort)
CREATE INDEX IF NOT EXISTS idx_quotes_partner_created
  ON quotes(partner_id, created_at DESC);

-- Quotes: filtering by status within a partner
CREATE INDEX IF NOT EXISTS idx_quotes_partner_status
  ON quotes(partner_id, status);

-- Quotes: customer lookup
CREATE INDEX IF NOT EXISTS idx_quotes_customer_id
  ON quotes(customer_id);

-- Quotes: seller lookup
CREATE INDEX IF NOT EXISTS idx_quotes_user_id
  ON quotes(user_id);

-- Quotes: date filtering
CREATE INDEX IF NOT EXISTS idx_quotes_issue_date
  ON quotes(issue_date DESC);

-- Quotes: unique number lookup (already covered by UNIQUE constraint, but explicit)
CREATE INDEX IF NOT EXISTS idx_quotes_number
  ON quotes(quote_number);

-- Quotes: expiration check (for cron function)
CREATE INDEX IF NOT EXISTS idx_quotes_expiration
  ON quotes(expiration_date)
  WHERE status IN ('draft', 'sent') AND expiration_date IS NOT NULL;

-- Quote Items: list items per quote (ordered)
CREATE INDEX IF NOT EXISTS idx_qi_quote_id_sort
  ON quote_items(quote_id, sort_order);

-- Quote Items: product reference lookup
CREATE INDEX IF NOT EXISTS idx_qi_product_id
  ON quote_items(product_id)
  WHERE product_id IS NOT NULL;

-- Quote Items: RLS lookup (denormalized partner_id)
CREATE INDEX IF NOT EXISTS idx_qi_partner_id
  ON quote_items(partner_id);


-- ─── PART 5: RLS POLICIES ──────────────────────────────────────────────────
-- Pattern: partners.user_id UNION partner_users.user_id
-- Matches 950_security_fix migration exactly.

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

-- ── Quotes RLS ────────────────────────────────────────────────────────────

-- SELECT: Owner + all team members can see quotes
CREATE POLICY quotes_select_policy ON quotes
  FOR SELECT USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid()
    )
  );

-- INSERT: Owner + OWNER/ADMIN/MANAGER team members
CREATE POLICY quotes_insert_policy ON quotes
  FOR INSERT WITH CHECK (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users
        WHERE user_id = auth.uid()
        AND role IN ('OWNER', 'ADMIN', 'MANAGER')
    )
  );

-- UPDATE: Owner + OWNER/ADMIN/MANAGER team members
CREATE POLICY quotes_update_policy ON quotes
  FOR UPDATE USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users
        WHERE user_id = auth.uid()
        AND role IN ('OWNER', 'ADMIN', 'MANAGER')
    )
  )
  WITH CHECK (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users
        WHERE user_id = auth.uid()
        AND role IN ('OWNER', 'ADMIN', 'MANAGER')
    )
  );

-- DELETE: Owner + OWNER/ADMIN team members only
CREATE POLICY quotes_delete_policy ON quotes
  FOR DELETE USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users
        WHERE user_id = auth.uid()
        AND role IN ('OWNER', 'ADMIN')
    )
  );

-- ── Quote Items RLS (uses denormalized partner_id - NO JOINs) ─────────────

-- SELECT: Owner + all team members
CREATE POLICY qi_select_policy ON quote_items
  FOR SELECT USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid()
    )
  );

-- INSERT: Owner + OWNER/ADMIN/MANAGER
CREATE POLICY qi_insert_policy ON quote_items
  FOR INSERT WITH CHECK (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users
        WHERE user_id = auth.uid()
        AND role IN ('OWNER', 'ADMIN', 'MANAGER')
    )
  );

-- UPDATE: Owner + OWNER/ADMIN/MANAGER
CREATE POLICY qi_update_policy ON quote_items
  FOR UPDATE USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users
        WHERE user_id = auth.uid()
        AND role IN ('OWNER', 'ADMIN', 'MANAGER')
    )
  )
  WITH CHECK (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users
        WHERE user_id = auth.uid()
        AND role IN ('OWNER', 'ADMIN', 'MANAGER')
    )
  );

-- DELETE: Owner + OWNER/ADMIN only
CREATE POLICY qi_delete_policy ON quote_items
  FOR DELETE USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users
        WHERE user_id = auth.uid()
        AND role IN ('OWNER', 'ADMIN')
    )
  );


-- ─── PART 6: TRIGGER FUNCTIONS ─────────────────────────────────────────────

-- 6A. Set quote defaults on INSERT
-- Sets user_id from auth.uid() and generates quote_number if not provided
CREATE OR REPLACE FUNCTION set_quote_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Auto-set user_id from session if not provided
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;

  -- Auto-generate quote_number if not provided
  IF NEW.quote_number IS NULL OR NEW.quote_number = '' THEN
    NEW.quote_number := generate_quote_number();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_quote_defaults ON quotes;
CREATE TRIGGER trg_set_quote_defaults
  BEFORE INSERT ON quotes
  FOR EACH ROW EXECUTE FUNCTION set_quote_defaults();


-- 6B. Calculate total on quote when financial fields change
-- Recomputes total from subtotal, discount, shipping, additional_costs
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

DROP TRIGGER IF EXISTS trg_recalc_quote_total ON quotes;
CREATE TRIGGER trg_recalc_quote_total
  BEFORE INSERT OR UPDATE OF subtotal, discount_type, discount_value, shipping_cost, additional_costs
  ON quotes
  FOR EACH ROW EXECUTE FUNCTION recalc_quote_total();


-- 6C. Lock approved/rejected quotes (prevent edits)
CREATE OR REPLACE FUNCTION lock_finalized_quote()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow status changes on finalized quotes (not field edits)
  IF OLD.status IN ('approved', 'rejected') THEN
    -- Allow changing status (e.g., approved -> expired, or reopen via draft)
    IF NEW.status != OLD.status THEN
      -- Only allow specific transitions
      IF OLD.status = 'approved' AND NEW.status NOT IN ('expired') THEN
        RAISE EXCEPTION 'Orçamento aprovado só pode ser marcado como expirado';
      END IF;
      IF OLD.status = 'rejected' AND NEW.status NOT IN ('draft') THEN
        RAISE EXCEPTION 'Orçamento rejeitado só pode ser reaberto como rascunho';
      END IF;
      -- Allow the status change, but nothing else
      NEW.partner_id := OLD.partner_id;
      NEW.customer_id := OLD.customer_id;
      NEW.user_id := OLD.user_id;
      NEW.quote_number := OLD.quote_number;
      NEW.issue_date := OLD.issue_date;
      NEW.expiration_date := OLD.expiration_date;
      NEW.notes := OLD.notes;
      NEW.subtotal := OLD.subtotal;
      NEW.discount_type := OLD.discount_type;
      NEW.discount_value := OLD.discount_value;
      NEW.shipping_cost := OLD.shipping_cost;
      NEW.additional_costs := OLD.additional_costs;
      NEW.total := OLD.total;
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Orçamento com status "%" não pode ser editado. Duplique-o para criar uma nova versão.', OLD.status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_finalized_quote ON quotes;
CREATE TRIGGER trg_lock_finalized_quote
  BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION lock_finalized_quote();


-- 6D. Quote item: calculate total_price, set partner_id, snapshot product data
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

  -- Propagate partner_id from parent quote
  SELECT q.partner_id INTO v_partner_id
  FROM quotes q WHERE q.id = NEW.quote_id;

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

DROP TRIGGER IF EXISTS trg_set_quote_item_defaults ON quote_items;
CREATE TRIGGER trg_set_quote_item_defaults
  BEFORE INSERT OR UPDATE ON quote_items
  FOR EACH ROW EXECUTE FUNCTION set_quote_item_defaults();


-- 6E. INCREMENTAL subtotal updates (NO SUM, NO full scan)
-- INSERT: add new item total to quote subtotal
-- UPDATE: add delta (new - old) to quote subtotal
-- DELETE: subtract old item total from quote subtotal

CREATE OR REPLACE FUNCTION update_quote_subtotal_incremental()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delta NUMERIC(12,2);
  target_quote_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    delta := NEW.total_price;
    target_quote_id := NEW.quote_id;

  ELSIF TG_OP = 'UPDATE' THEN
    delta := NEW.total_price - OLD.total_price;
    target_quote_id := NEW.quote_id;

    -- If quote_id changed (rare but handle it), subtract from old, add to new
    IF OLD.quote_id != NEW.quote_id THEN
      UPDATE quotes SET subtotal = GREATEST(subtotal - OLD.total_price, 0)
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

  -- Atomic increment (no race conditions with single UPDATE)
  UPDATE quotes
  SET subtotal = GREATEST(subtotal + delta, 0)
  WHERE id = target_quote_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_update_quote_subtotal ON quote_items;
CREATE TRIGGER trg_update_quote_subtotal
  AFTER INSERT OR UPDATE OF total_price OR DELETE ON quote_items
  FOR EACH ROW EXECUTE FUNCTION update_quote_subtotal_incremental();


-- 6F. Prevent item modifications on finalized quotes
CREATE OR REPLACE FUNCTION prevent_item_change_on_finalized_quote()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  quote_status TEXT;
  target_quote_id UUID;
BEGIN
  target_quote_id := COALESCE(NEW.quote_id, OLD.quote_id);

  SELECT status INTO quote_status
  FROM quotes WHERE id = target_quote_id;

  IF quote_status IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Não é possível modificar itens de um orçamento com status "%"', quote_status;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_item_change_finalized ON quote_items;
CREATE TRIGGER trg_prevent_item_change_finalized
  BEFORE INSERT OR UPDATE OR DELETE ON quote_items
  FOR EACH ROW EXECUTE FUNCTION prevent_item_change_on_finalized_quote();


-- ─── PART 7: EXPIRATION CRON FUNCTION ──────────────────────────────────────
-- Call via pg_cron or external scheduler: SELECT auto_expire_quotes();

CREATE OR REPLACE FUNCTION auto_expire_quotes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE quotes
  SET status = 'expired', updated_at = NOW()
  WHERE status IN ('draft', 'sent')
    AND expiration_date IS NOT NULL
    AND expiration_date < CURRENT_DATE;

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;


-- ─── PART 8: AUDIT TRIGGERS ────────────────────────────────────────────────
-- Reuses existing audit_trigger_func() from migration 105

DROP TRIGGER IF EXISTS audit_quotes ON quotes;
CREATE TRIGGER audit_quotes
  AFTER INSERT OR UPDATE OR DELETE ON quotes
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

DROP TRIGGER IF EXISTS audit_quote_items ON quote_items;
CREATE TRIGGER audit_quote_items
  AFTER INSERT OR UPDATE OR DELETE ON quote_items
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();


-- ─── PART 9: COMPLETION ────────────────────────────────────────────────────

DO $$
BEGIN
  RAISE NOTICE '✅ Quotes system migration completed successfully!';
  RAISE NOTICE '📋 Tables: quotes, quote_items';
  RAISE NOTICE '🔒 RLS: 8 policies (4 per table, multi-tenant with partner_users)';
  RAISE NOTICE '⚡ Indexes: 10 indexes for fast queries';
  RAISE NOTICE '🔧 Triggers: 7 triggers (defaults, totals, lock, snapshots, audit)';
  RAISE NOTICE '📊 Functions: generate_quote_number(), auto_expire_quotes()';
  RAISE NOTICE '';
  RAISE NOTICE '🧪 Test: INSERT INTO quotes (partner_id) VALUES (''your-partner-uuid'');';
  RAISE NOTICE '⏰ Cron: SELECT auto_expire_quotes(); -- run daily';
END $$;
