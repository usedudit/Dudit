-- =============================================================================
-- Marketplace return fault penalty (soft, pattern-based)
-- =============================================================================
-- A soft ranking penalty for marketplace returns caused by seller fault.
-- - Buyers who "changed their mind" (CDC right of withdrawal) never penalize.
-- - ERP-origin returns never penalize (source = 'marketplace' only).
-- - Penalty is a 30-day fault RATIO (fault_returns / marketplace_sales), not
--   per-event, so a single disputed return cannot hurt a seller (anti-abuse).
-- - Applied as a multiplier on store marketplace_reputation (max -20% above a
--   5% fault rate, saturated at 20%), which feeds store search/browse ranking.

BEGIN;

-- =============================================================================
-- 1. reason_category on return_requests (structured buyer reason)
-- =============================================================================

ALTER TABLE public.return_requests
  ADD COLUMN IF NOT EXISTS reason_category TEXT NULL
  CHECK (reason_category IS NULL OR reason_category IN (
    'buyer_remorse',
    'size_fit',
    'wrong_item',
    'defective',
    'damaged',
    'not_as_described',
    'missing_parts',
    'arrived_late',
    'other'
  ));

CREATE INDEX IF NOT EXISTS idx_return_requests_fault_penalty
  ON public.return_requests (store_id, status, source, reason_category)
  WHERE deleted_at IS NULL;

-- =============================================================================
-- 2. Fault-return rate helper (30-day rolling window)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.calc_marketplace_fault_return_rate(p_store_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT round(
    CASE WHEN sales.cnt > 0 THEN LEAST(fault.cnt::numeric / sales.cnt::numeric, 1.0) ELSE 0.0 END,
    4
  )
  FROM (
    SELECT count(*)::INTEGER AS cnt
    FROM public.orders o
    WHERE o.store_id = p_store_id
      AND lower(coalesce(o.order_source, '')) = 'vitrine online'
      AND lower(coalesce(o.situation, '')) IN ('paid', 'approved')
      AND o.updated_at > now() - interval '30 days'
  ) sales,
  (
    SELECT count(*)::INTEGER AS cnt
    FROM public.return_requests rr
    WHERE rr.store_id = p_store_id
      AND rr.source = 'marketplace'
      AND rr.deleted_at IS NULL
      AND rr.status = 'RESOLVED'
      AND coalesce(rr.approved_resolution, rr.desired_resolution) IN ('refund', 'exchange', 'store_credit')
      AND rr.reason_category IN ('wrong_item', 'defective', 'damaged', 'not_as_described', 'missing_parts', 'arrived_late')
      AND coalesce(rr.resolved_at, rr.updated_at) > now() - interval '30 days'
  ) fault;
$$;

-- =============================================================================
-- 3. Store marketplace reputation now includes a fault-rate multiplier
-- =============================================================================
-- Dead zone: fault_rate <= 5% -> no effect. Full penalty (-20%) at >= 20%.
-- Existing weights are untouched; fault rate is a multiplier, so good sellers
-- keep their baseline reputation.

CREATE OR REPLACE FUNCTION public.calc_store_marketplace_reputation(
  p_completed_orders INTEGER,
  p_completed_appointments INTEGER,
  p_active_subscriptions INTEGER,
  p_rating NUMERIC,
  p_cancellation_rate NUMERIC,
  p_fault_rate NUMERIC DEFAULT 0
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT round((
    0.25 * LEAST(coalesce(p_completed_orders, 0), 50)::numeric / 50.0 +
    0.20 * LEAST(coalesce(p_completed_appointments, 0), 50)::numeric / 50.0 +
    0.20 * LEAST(coalesce(p_active_subscriptions, 0), 20)::numeric / 20.0 +
    0.25 * LEAST(coalesce(p_rating, 0), 5)::numeric / 5.0 +
    0.10 * GREATEST(0, 1.0 - coalesce(p_cancellation_rate, 0))
  ) * (
    1.0 - 0.20 * LEAST(GREATEST(coalesce(p_fault_rate, 0) - 0.05, 0) / 0.15, 1.0)
  ), 4);
$$;

-- =============================================================================
-- 4. refresh_store_marketplace_reputation computes fault rate
-- =============================================================================

CREATE OR REPLACE FUNCTION public.refresh_store_marketplace_reputation(p_store_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rating NUMERIC;
  v_cancel_rate NUMERIC;
  v_fault_rate NUMERIC;
  v_orders INTEGER;
  v_appts INTEGER;
  v_subs INTEGER;
  v_partner_id UUID;
BEGIN
  SELECT partner_id INTO v_partner_id FROM stores WHERE id = p_store_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT completed_orders_count, completed_appointments_count, active_subscriptions_count, rating
  INTO v_orders, v_appts, v_subs, v_rating
  FROM stores WHERE id = p_store_id;

  SELECT CASE
    WHEN total_cnt = 0 THEN 0
    ELSE cancelled_cnt::numeric / total_cnt::numeric
  END INTO v_cancel_rate
  FROM (
    SELECT
      count(*) FILTER (WHERE situation IN ('paid', 'cancelled')) AS total_cnt,
      count(*) FILTER (WHERE situation = 'cancelled') AS cancelled_cnt
    FROM orders
    WHERE store_id = p_store_id
      AND buyer_id IS NOT NULL
  ) stats;

  v_fault_rate := public.calc_marketplace_fault_return_rate(p_store_id);

  UPDATE stores
  SET marketplace_reputation = public.calc_store_marketplace_reputation(
    v_orders, v_appts, v_subs, v_rating, v_cancel_rate, v_fault_rate
  )
  WHERE id = p_store_id;
END;
$$;

-- =============================================================================
-- 5. Trigger: recompute reputation when a fault return is resolved
-- =============================================================================

CREATE OR REPLACE FUNCTION public.mp_apply_return_fault_reputation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' OR NEW.status <> 'RESOLVED' OR OLD.status = 'RESOLVED' THEN
    RETURN NEW;
  END IF;

  -- Marketplace only + not soft-deleted
  IF NEW.source <> 'marketplace' OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Only resolved with an effective refund/exchange/store-credit resolution
  IF coalesce(NEW.approved_resolution, NEW.desired_resolution) NOT IN ('refund', 'exchange', 'store_credit') THEN
    RETURN NEW;
  END IF;

  -- Only fault categories (buyer remorse, size, other never penalize)
  IF NEW.reason_category IS NULL OR NEW.reason_category NOT IN ('wrong_item', 'defective', 'damaged', 'not_as_described', 'missing_parts', 'arrived_late') THEN
    RETURN NEW;
  END IF;

  IF NEW.store_id IS NOT NULL THEN
    PERFORM public.refresh_store_marketplace_reputation(NEW.store_id);
  END IF;
  PERFORM public.refresh_partner_marketplace_reputation(NEW.partner_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mp_return_fault_reputation ON public.return_requests;
CREATE TRIGGER trg_mp_return_fault_reputation
  AFTER UPDATE OF status ON public.return_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.mp_apply_return_fault_reputation();

-- =============================================================================
-- 6. Revoke direct execution (internal use only)
-- =============================================================================

REVOKE ALL ON FUNCTION public.mp_apply_return_fault_reputation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calc_marketplace_fault_return_rate(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calc_store_marketplace_reputation(integer, integer, integer, numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_store_marketplace_reputation(uuid) FROM PUBLIC, anon, authenticated;

-- Drop the old 5-arg overload of calc_store_marketplace_reputation (superseded by
-- the new one with p_fault_rate). Keep ONLY the new signature.
DROP FUNCTION IF EXISTS public.calc_store_marketplace_reputation(integer, integer, integer, numeric, numeric);

COMMIT;
