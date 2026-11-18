-- Migration: Fix marketplace ranking triggers, rolling windows, and initial score computation
-- Date: 2026-11-18
-- Description:
-- 1. Adds BEFORE INSERT triggers on products, services, and recurring_plans to initialize
--    marketplace_score with initial freshness and rating rather than defaulting to 0.0000.
-- 2. Rewrites recalculate_marketplace_rolling_windows() to update all active items
--    (decaying freshness over time and resetting expired sales/bookings) rather than only items with lifetime sales.
-- 3. Refreshes store and partner reputation across all active stores.
-- 4. Backfills existing items where marketplace_score = 0.

-- =============================================================================
-- 1. Triggers to initialize marketplace_score on INSERT
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trg_init_product_marketplace_score()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.marketplace_score IS NULL OR NEW.marketplace_score = 0 THEN
    NEW.marketplace_score := public.calc_product_marketplace_score(
      COALESCE(NEW.sales_last_30_days, 0)::integer,
      COALESCE(NEW.views_last_30_days, 0)::integer,
      COALESCE(NEW.favorites_count, 0)::integer,
      COALESCE(NEW.created_at, now()),
      COALESCE(NEW.rating, 0)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_init_marketplace_score ON public.products;
CREATE TRIGGER trg_products_init_marketplace_score
  BEFORE INSERT ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_init_product_marketplace_score();


CREATE OR REPLACE FUNCTION public.trg_init_service_marketplace_score()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.marketplace_score IS NULL OR NEW.marketplace_score = 0 THEN
    NEW.marketplace_score := public.calc_service_marketplace_score(
      COALESCE(NEW.bookings_last_30_days, 0)::integer,
      COALESCE(NEW.views_count, 0)::integer,
      COALESCE(NEW.favorites_count, 0)::integer,
      COALESCE(NEW.created_at, now()),
      COALESCE(NEW.rating, 0)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_services_init_marketplace_score ON public.services;
CREATE TRIGGER trg_services_init_marketplace_score
  BEFORE INSERT ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_init_service_marketplace_score();


CREATE OR REPLACE FUNCTION public.trg_init_plan_marketplace_score()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.marketplace_score IS NULL OR NEW.marketplace_score = 0 THEN
    NEW.marketplace_score := public.calc_plan_marketplace_score(
      COALESCE(NEW.signups_last_30_days, 0)::integer,
      COALESCE(NEW.views_count, 0)::integer,
      COALESCE(NEW.favorites_count, 0)::integer,
      COALESCE(NEW.created_at, now()),
      0
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recurring_plans_init_marketplace_score ON public.recurring_plans;
CREATE TRIGGER trg_recurring_plans_init_marketplace_score
  BEFORE INSERT ON public.recurring_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_init_plan_marketplace_score();

-- =============================================================================
-- 2. Improved recalculate_marketplace_rolling_windows()
-- =============================================================================

CREATE OR REPLACE FUNCTION public.recalculate_marketplace_rolling_windows()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  -- 2.1 Products: recalculate 7d and 30d sales and update marketplace_score
  WITH recent_sales AS (
    SELECT
      oi.product_id,
      COALESCE(sum(oi.quantity) FILTER (WHERE o.updated_at > now() - interval '7 days'), 0)::integer AS qty_7d,
      COALESCE(sum(oi.quantity) FILTER (WHERE o.updated_at > now() - interval '30 days'), 0)::integer AS qty_30d
    FROM public.order_items oi
    INNER JOIN public.orders o ON o.id = oi.order_id
    WHERE o.situation = 'paid'
      AND oi.product_id IS NOT NULL
      AND o.updated_at > now() - interval '30 days'
    GROUP BY oi.product_id
  )
  UPDATE public.products p
  SET
    sales_last_7_days = COALESCE(sub.qty_7d, 0)::integer,
    sales_last_30_days = COALESCE(sub.qty_30d, 0)::integer,
    marketplace_score = public.calc_product_marketplace_score(
      COALESCE(sub.qty_30d, 0)::integer,
      COALESCE(p.views_last_30_days, 0)::integer,
      COALESCE(p.favorites_count, 0)::integer,
      p.created_at,
      p.rating
    )
  FROM (
    SELECT
      p2.id,
      rs.qty_7d,
      rs.qty_30d
    FROM public.products p2
    LEFT JOIN recent_sales rs ON rs.product_id = p2.id
    WHERE p2.is_active = true OR p2.sales_last_30_days > 0 OR p2.marketplace_score > 0
  ) sub
  WHERE p.id = sub.id;

  -- 2.2 Product Variants: recalculate 7d and 30d sales
  WITH recent_variant_sales AS (
    SELECT
      oi.variant_id,
      COALESCE(sum(oi.quantity) FILTER (WHERE o.updated_at > now() - interval '7 days'), 0)::integer AS qty_7d,
      COALESCE(sum(oi.quantity) FILTER (WHERE o.updated_at > now() - interval '30 days'), 0)::integer AS qty_30d
    FROM public.order_items oi
    INNER JOIN public.orders o ON o.id = oi.order_id
    WHERE o.situation = 'paid'
      AND oi.variant_id IS NOT NULL
      AND o.updated_at > now() - interval '30 days'
    GROUP BY oi.variant_id
  )
  UPDATE public.product_variants pv
  SET
    sales_last_7_days = COALESCE(sub.qty_7d, 0)::integer,
    sales_last_30_days = COALESCE(sub.qty_30d, 0)::integer
  FROM (
    SELECT
      pv2.id,
      rvs.qty_7d,
      rvs.qty_30d
    FROM public.product_variants pv2
    LEFT JOIN recent_variant_sales rvs ON rvs.variant_id = pv2.id
    WHERE pv2.sales_last_30_days > 0 OR rvs.variant_id IS NOT NULL
  ) sub
  WHERE pv.id = sub.id;

  -- 2.3 Services: recalculate 7d and 30d bookings and update marketplace_score
  WITH recent_bookings AS (
    SELECT
      oi.service_id,
      COALESCE(count(*) FILTER (WHERE o.updated_at > now() - interval '7 days'), 0)::integer AS cnt_7d,
      COALESCE(count(*) FILTER (WHERE o.updated_at > now() - interval '30 days'), 0)::integer AS cnt_30d
    FROM public.order_items oi
    INNER JOIN public.orders o ON o.id = oi.order_id
    WHERE o.situation = 'paid'
      AND oi.service_id IS NOT NULL
      AND o.updated_at > now() - interval '30 days'
    GROUP BY oi.service_id
  )
  UPDATE public.services s
  SET
    bookings_last_7_days = COALESCE(sub.cnt_7d, 0)::integer,
    bookings_last_30_days = COALESCE(sub.cnt_30d, 0)::integer,
    marketplace_score = public.calc_service_marketplace_score(
      COALESCE(sub.cnt_30d, 0)::integer,
      COALESCE(s.views_count, 0)::integer,
      COALESCE(s.favorites_count, 0)::integer,
      s.created_at,
      s.rating
    )
  FROM (
    SELECT
      s2.id,
      rb.cnt_7d,
      rb.cnt_30d
    FROM public.services s2
    LEFT JOIN recent_bookings rb ON rb.service_id = s2.id
    WHERE s2.is_active = true OR s2.bookings_last_30_days > 0 OR s2.marketplace_score > 0
  ) sub
  WHERE s.id = sub.id;

  -- 2.4 Recurring Plans: recalculate 7d and 30d signups and update marketplace_score
  WITH recent_subs AS (
    SELECT
      rs.recurring_plan_id,
      COALESCE(count(*) FILTER (WHERE rs.created_at > now() - interval '7 days'), 0)::integer AS cnt_7d,
      COALESCE(count(*) FILTER (WHERE rs.created_at > now() - interval '30 days'), 0)::integer AS cnt_30d
    FROM public.recurring_subscriptions rs
    WHERE rs.status IN ('active', 'paused')
    GROUP BY rs.recurring_plan_id
  )
  UPDATE public.recurring_plans rp
  SET
    signups_last_7_days = COALESCE(sub.cnt_7d, 0)::integer,
    signups_last_30_days = COALESCE(sub.cnt_30d, 0)::integer,
    marketplace_score = public.calc_plan_marketplace_score(
      COALESCE(sub.cnt_30d, 0)::integer,
      COALESCE(rp.views_count, 0)::integer,
      COALESCE(rp.favorites_count, 0)::integer,
      rp.created_at,
      0
    )
  FROM (
    SELECT
      rp2.id,
      rs.cnt_7d,
      rs.cnt_30d
    FROM public.recurring_plans rp2
    LEFT JOIN recent_subs rs ON rs.recurring_plan_id = rp2.id
    WHERE rp2.status = 'active' OR rp2.signups_last_30_days > 0 OR rp2.marketplace_score > 0
  ) sub
  WHERE rp.id = sub.id;

  -- 2.5 Refresh store reputation for all active stores
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'refresh_store_marketplace_reputation') THEN
    FOR r IN SELECT id FROM public.stores WHERE is_active = true LOOP
      BEGIN
        PERFORM public.refresh_store_marketplace_reputation(r.id);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;
  END IF;

  -- 2.6 Refresh partner reputation
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'refresh_partner_marketplace_reputation') THEN
    FOR r IN SELECT id FROM public.partners LOOP
      BEGIN
        PERFORM public.refresh_partner_marketplace_reputation(r.id);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;
  END IF;
END;
$$;

-- =============================================================================
-- 3. Backfill existing zero scores with baseline ranking
-- =============================================================================

UPDATE public.products
SET marketplace_score = public.calc_product_marketplace_score(
  COALESCE(sales_last_30_days, 0)::integer,
  COALESCE(views_last_30_days, 0)::integer,
  COALESCE(favorites_count, 0)::integer,
  COALESCE(created_at, now()),
  COALESCE(rating, 0)
)
WHERE marketplace_score = 0;

UPDATE public.services
SET marketplace_score = public.calc_service_marketplace_score(
  COALESCE(bookings_last_30_days, 0)::integer,
  COALESCE(views_count, 0)::integer,
  COALESCE(favorites_count, 0)::integer,
  COALESCE(created_at, now()),
  COALESCE(rating, 0)
)
WHERE marketplace_score = 0;

UPDATE public.recurring_plans
SET marketplace_score = public.calc_plan_marketplace_score(
  COALESCE(signups_last_30_days, 0)::integer,
  COALESCE(views_count, 0)::integer,
  COALESCE(favorites_count, 0)::integer,
  COALESCE(created_at, now()),
  0
)
WHERE marketplace_score = 0;

-- Refresh rolling windows now to sync latest 30-day activity
SELECT public.recalculate_marketplace_rolling_windows();
