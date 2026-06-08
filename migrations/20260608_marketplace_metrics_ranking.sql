-- Marketplace metrics, seller sales counters, and ranking scores
-- Idempotent event ledger prevents double-counting across webhook/sync/ERP paths.

-- =============================================================================
-- Schema: partner seller counters
-- =============================================================================

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS vendas_totais INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vendas_produtos INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vendas_servicos INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vendas_assinaturas INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS marketplace_reputation NUMERIC(10,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_orders_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_appointments_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_subscriptions_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancellation_rate NUMERIC(5,4) NOT NULL DEFAULT 0;

-- =============================================================================
-- Schema: product metrics
-- =============================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS total_sales INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sales_last_30_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sales_last_7_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS views_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS views_last_30_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS favorites_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_sale_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS marketplace_score NUMERIC(10,4) NOT NULL DEFAULT 0;

-- =============================================================================
-- Schema: product variant metrics
-- =============================================================================

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS total_sales INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sales_last_30_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sales_last_7_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_sale_at TIMESTAMPTZ;

-- =============================================================================
-- Schema: service metrics
-- =============================================================================

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS total_bookings INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_bookings INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bookings_last_30_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bookings_last_7_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS views_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS favorites_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_booking_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS marketplace_score NUMERIC(10,4) NOT NULL DEFAULT 0;

-- =============================================================================
-- Schema: recurring plan metrics
-- =============================================================================

ALTER TABLE public.recurring_plans
  ADD COLUMN IF NOT EXISTS total_signups INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_signups INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS signups_last_30_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS signups_last_7_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS views_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS favorites_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS marketplace_score NUMERIC(10,4) NOT NULL DEFAULT 0;

-- =============================================================================
-- Schema: order_items variant_id (if missing from prior migrations)
-- =============================================================================

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS variant_id UUID NULL REFERENCES public.product_variants(id) ON DELETE SET NULL;

-- =============================================================================
-- Idempotency ledger
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.marketplace_metrics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_metrics_events_partner
  ON public.marketplace_metrics_events(partner_id, event_type);

-- =============================================================================
-- Helper: freshness factor (0-7d +25%, 8-30d +10%, 30+d normal)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.mp_freshness_factor(p_created_at TIMESTAMPTZ)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_created_at IS NULL THEN 1.0
    WHEN p_created_at > now() - interval '7 days' THEN 1.25
    WHEN p_created_at > now() - interval '30 days' THEN 1.10
    ELSE 1.0
  END;
$$;

-- =============================================================================
-- Score calculators (persisted, updated on metric events)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.calc_product_marketplace_score(
  p_sales_30d INTEGER,
  p_views_30d INTEGER,
  p_favorites INTEGER,
  p_created_at TIMESTAMPTZ,
  p_rating NUMERIC
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT round((
    0.40 * LEAST(coalesce(p_sales_30d, 0), 100)::numeric / 100.0 +
    0.20 * LEAST(coalesce(p_views_30d, 0), 1000)::numeric / 1000.0 +
    0.15 * LEAST(coalesce(p_favorites, 0), 50)::numeric / 50.0 +
    0.15 * (
      CASE
        WHEN p_created_at > now() - interval '7 days' THEN 1.0
        WHEN p_created_at > now() - interval '30 days' THEN 0.6
        ELSE 0.3
      END
    ) +
    0.10 * LEAST(coalesce(p_rating, 0), 5)::numeric / 5.0
  ) * public.mp_freshness_factor(p_created_at), 4);
$$;

CREATE OR REPLACE FUNCTION public.calc_service_marketplace_score(
  p_bookings_30d INTEGER,
  p_views INTEGER,
  p_favorites INTEGER,
  p_created_at TIMESTAMPTZ,
  p_rating NUMERIC
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT round((
    0.40 * LEAST(coalesce(p_bookings_30d, 0), 100)::numeric / 100.0 +
    0.20 * LEAST(coalesce(p_views, 0), 1000)::numeric / 1000.0 +
    0.15 * LEAST(coalesce(p_favorites, 0), 50)::numeric / 50.0 +
    0.15 * (
      CASE
        WHEN p_created_at > now() - interval '7 days' THEN 1.0
        WHEN p_created_at > now() - interval '30 days' THEN 0.6
        ELSE 0.3
      END
    ) +
    0.10 * LEAST(coalesce(p_rating, 0), 5)::numeric / 5.0
  ) * public.mp_freshness_factor(p_created_at), 4);
$$;

CREATE OR REPLACE FUNCTION public.calc_plan_marketplace_score(
  p_signups_30d INTEGER,
  p_views INTEGER,
  p_favorites INTEGER,
  p_created_at TIMESTAMPTZ,
  p_rating NUMERIC
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT round((
    0.40 * LEAST(coalesce(p_signups_30d, 0), 100)::numeric / 100.0 +
    0.20 * LEAST(coalesce(p_views, 0), 1000)::numeric / 1000.0 +
    0.15 * LEAST(coalesce(p_favorites, 0), 50)::numeric / 50.0 +
    0.15 * (
      CASE
        WHEN p_created_at > now() - interval '7 days' THEN 1.0
        WHEN p_created_at > now() - interval '30 days' THEN 0.6
        ELSE 0.3
      END
    ) +
    0.10 * LEAST(coalesce(p_rating, 0), 5)::numeric / 5.0
  ) * public.mp_freshness_factor(p_created_at), 4);
$$;

CREATE OR REPLACE FUNCTION public.calc_partner_marketplace_reputation(
  p_completed_orders INTEGER,
  p_completed_appointments INTEGER,
  p_active_subscriptions INTEGER,
  p_rating NUMERIC,
  p_cancellation_rate NUMERIC
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT round(
    0.25 * LEAST(coalesce(p_completed_orders, 0), 50)::numeric / 50.0 +
    0.20 * LEAST(coalesce(p_completed_appointments, 0), 50)::numeric / 50.0 +
    0.20 * LEAST(coalesce(p_active_subscriptions, 0), 20)::numeric / 20.0 +
    0.25 * LEAST(coalesce(p_rating, 0), 5)::numeric / 5.0 +
    0.10 * GREATEST(0, 1.0 - coalesce(p_cancellation_rate, 0))
  , 4);
$$;

-- =============================================================================
-- Refresh partner reputation from aggregates
-- =============================================================================

CREATE OR REPLACE FUNCTION public.refresh_partner_marketplace_reputation(p_partner_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rating NUMERIC;
  v_cancel_rate NUMERIC;
  v_orders INTEGER;
  v_appts INTEGER;
  v_subs INTEGER;
BEGIN
  SELECT completed_orders_count, completed_appointments_count, active_subscriptions_count, rating
  INTO v_orders, v_appts, v_subs, v_rating
  FROM partners WHERE id = p_partner_id;

  SELECT CASE
    WHEN total_cnt = 0 THEN 0
    ELSE cancelled_cnt::numeric / total_cnt::numeric
  END INTO v_cancel_rate
  FROM (
    SELECT
      count(*) FILTER (WHERE situation IN ('paid', 'cancelled')) AS total_cnt,
      count(*) FILTER (WHERE situation = 'cancelled') AS cancelled_cnt
    FROM orders
    WHERE partner_id = p_partner_id
      AND buyer_id IS NOT NULL
  ) stats;

  UPDATE partners
  SET marketplace_reputation = public.calc_partner_marketplace_reputation(
    v_orders, v_appts, v_subs, v_rating, v_cancel_rate
  )
  WHERE id = p_partner_id;
END;
$$;

-- =============================================================================
-- Legacy RPC: increment_partner_sales (now delegates to full metrics)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.increment_partner_sales(partner_uuid UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE partners
  SET vendas_totais = coalesce(vendas_totais, 0) + 1
  WHERE id = partner_uuid;
END;
$$;

-- =============================================================================
-- Record paid marketplace order metrics (idempotent)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.record_marketplace_order_metrics(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key TEXT := 'order_paid:' || p_order_id::text;
  v_order RECORD;
  v_item RECORD;
  v_qty INTEGER;
  v_has_product BOOLEAN := false;
  v_has_service BOOLEAN := false;
  v_has_subscription BOOLEAN := false;
  v_service_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF EXISTS (SELECT 1 FROM marketplace_metrics_events WHERE idempotency_key = v_key) THEN
    RETURN false;
  END IF;

  SELECT id, partner_id, situation, buyer_id
  INTO v_order
  FROM orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN RETURN false; END IF;
  IF lower(coalesce(v_order.situation, '')) NOT IN ('paid', 'approved') THEN RETURN false; END IF;

  FOR v_item IN
    SELECT
      oi.product_id,
      oi.variant_id,
      oi.quantity,
      oi.line_type,
      oi.service_id,
      oi.recurring_plan_id,
      oi.product_name
    FROM order_items oi
    WHERE oi.order_id = p_order_id
  LOOP
    v_qty := GREATEST(coalesce(v_item.quantity, 1), 1);

    IF v_item.line_type = 'subscription' AND v_item.recurring_plan_id IS NOT NULL THEN
      v_has_subscription := true;
      UPDATE recurring_plans
      SET
        total_signups = total_signups + 1,
        active_signups = active_signups + 1,
        signups_last_30_days = signups_last_30_days + 1,
        signups_last_7_days = signups_last_7_days + 1,
        marketplace_score = public.calc_plan_marketplace_score(
          signups_last_30_days + 1, views_count, favorites_count, created_at, 0
        )
      WHERE id = v_item.recurring_plan_id;

    ELSIF v_item.line_type = 'service_booking' OR (v_item.product_id IS NULL AND v_item.service_id IS NOT NULL) THEN
      v_has_service := true;
      v_service_id := v_item.service_id;

      IF v_service_id IS NULL AND v_item.product_name IS NOT NULL THEN
        SELECT s.id INTO v_service_id
        FROM services s
        WHERE s.partner_id = v_order.partner_id AND s.name = v_item.product_name
        LIMIT 1;
      END IF;

      IF v_service_id IS NOT NULL THEN
        UPDATE services
        SET
          total_bookings = total_bookings + 1,
          completed_bookings = completed_bookings + 1,
          bookings_last_30_days = bookings_last_30_days + 1,
          bookings_last_7_days = bookings_last_7_days + 1,
          last_booking_at = v_now,
          marketplace_score = public.calc_service_marketplace_score(
            bookings_last_30_days + 1, views_count, favorites_count, created_at, rating
          )
        WHERE id = v_service_id;
      END IF;

    ELSIF v_item.product_id IS NOT NULL THEN
      v_has_product := true;

      UPDATE products
      SET
        total_sales = total_sales + v_qty,
        sales_last_30_days = sales_last_30_days + v_qty,
        sales_last_7_days = sales_last_7_days + v_qty,
        last_sale_at = v_now,
        marketplace_score = public.calc_product_marketplace_score(
          sales_last_30_days + v_qty, views_last_30_days, favorites_count, created_at, rating
        )
      WHERE id = v_item.product_id;

      IF v_item.variant_id IS NOT NULL THEN
        UPDATE product_variants
        SET
          total_sales = total_sales + v_qty,
          sales_last_30_days = sales_last_30_days + v_qty,
          sales_last_7_days = sales_last_7_days + v_qty,
          last_sale_at = v_now
        WHERE id = v_item.variant_id;
      END IF;
    END IF;
  END LOOP;

  -- Default: count as product sale if no typed lines but has product items
  IF NOT v_has_product AND NOT v_has_service AND NOT v_has_subscription THEN
  SELECT EXISTS (
    SELECT 1 FROM order_items WHERE order_id = p_order_id AND product_id IS NOT NULL
  ) INTO v_has_product;
  END IF;

  UPDATE partners
  SET
    vendas_totais = coalesce(vendas_totais, 0) + 1,
    vendas_produtos = vendas_produtos + CASE WHEN v_has_product THEN 1 ELSE 0 END,
    vendas_servicos = vendas_servicos + CASE WHEN v_has_service THEN 1 ELSE 0 END,
    vendas_assinaturas = vendas_assinaturas + CASE WHEN v_has_subscription THEN 1 ELSE 0 END,
    completed_orders_count = completed_orders_count + 1
  WHERE id = v_order.partner_id;

  PERFORM public.refresh_partner_marketplace_reputation(v_order.partner_id);

  INSERT INTO marketplace_metrics_events (idempotency_key, event_type, entity_type, entity_id, partner_id)
  VALUES (v_key, 'order_paid', 'order', p_order_id, v_order.partner_id);

  RETURN true;
END;
$$;

-- =============================================================================
-- Record completed appointment booking (idempotent, excludes cancelled)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.record_appointment_booking_metrics(p_appointment_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key TEXT := 'appointment_completed:' || p_appointment_id::text;
  v_appt RECORD;
  v_service_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF EXISTS (SELECT 1 FROM marketplace_metrics_events WHERE idempotency_key = v_key) THEN
    RETURN false;
  END IF;

  SELECT id, partner_id, service_name, status, marketplace_order_id, sales_channel
  INTO v_appt
  FROM appointments
  WHERE id = p_appointment_id;

  IF NOT FOUND THEN RETURN false; END IF;
  IF v_appt.status IN ('Cancelado', 'Ausência') THEN RETURN false; END IF;
  IF v_appt.status NOT IN ('Concluído', 'Pago', 'Pago Parcialmente', 'Confirmado') THEN RETURN false; END IF;

  -- Skip if already counted via marketplace order payment
  IF v_appt.marketplace_order_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM marketplace_metrics_events
      WHERE idempotency_key = 'order_paid:' || v_appt.marketplace_order_id::text
    ) THEN
      RETURN false;
    END IF;
  END IF;

  SELECT s.id INTO v_service_id
  FROM services s
  WHERE s.partner_id = v_appt.partner_id
    AND s.name = split_part(v_appt.service_name, ',', 1)
  LIMIT 1;

  IF v_service_id IS NOT NULL THEN
    UPDATE services
    SET
      total_bookings = total_bookings + 1,
      completed_bookings = completed_bookings + 1,
      bookings_last_30_days = bookings_last_30_days + 1,
      bookings_last_7_days = bookings_last_7_days + 1,
      last_booking_at = v_now,
      marketplace_score = public.calc_service_marketplace_score(
        bookings_last_30_days + 1, views_count, favorites_count, created_at, rating
      )
    WHERE id = v_service_id;
  END IF;

  UPDATE partners
  SET
    vendas_totais = coalesce(vendas_totais, 0) + 1,
    vendas_servicos = vendas_servicos + 1,
    completed_appointments_count = completed_appointments_count + 1
  WHERE id = v_appt.partner_id;

  PERFORM public.refresh_partner_marketplace_reputation(v_appt.partner_id);

  INSERT INTO marketplace_metrics_events (idempotency_key, event_type, entity_type, entity_id, partner_id)
  VALUES (v_key, 'appointment_completed', 'appointment', p_appointment_id, v_appt.partner_id);

  RETURN true;
END;
$$;

-- =============================================================================
-- Record subscription signup (idempotent)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.record_subscription_signup_metrics(p_subscription_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key TEXT := 'subscription_signup:' || p_subscription_id::text;
  v_sub RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM marketplace_metrics_events WHERE idempotency_key = v_key) THEN
    RETURN false;
  END IF;

  SELECT rs.id, rs.partner_id, rs.recurring_plan_id, rs.status, rs.sales_channel
  INTO v_sub
  FROM recurring_subscriptions rs
  WHERE rs.id = p_subscription_id;

  IF NOT FOUND THEN RETURN false; END IF;
  IF v_sub.status NOT IN ('active', 'paused') THEN RETURN false; END IF;

  -- Skip if signup was already counted via marketplace order payment
  IF EXISTS (
    SELECT 1 FROM recurring_executions re
    INNER JOIN marketplace_metrics_events me
      ON me.idempotency_key = 'order_paid:' || re.order_id::text
    WHERE re.subscription_id = p_subscription_id
      AND re.order_id IS NOT NULL
  ) THEN
    RETURN false;
  END IF;

  UPDATE recurring_plans
  SET
    total_signups = total_signups + 1,
    active_signups = active_signups + 1,
    signups_last_30_days = signups_last_30_days + 1,
    signups_last_7_days = signups_last_7_days + 1,
    marketplace_score = public.calc_plan_marketplace_score(
      signups_last_30_days + 1, views_count, favorites_count, created_at, 0
    )
  WHERE id = v_sub.recurring_plan_id;

  UPDATE partners
  SET
    vendas_totais = coalesce(vendas_totais, 0) + 1,
    vendas_assinaturas = vendas_assinaturas + 1,
    active_subscriptions_count = active_subscriptions_count + 1
  WHERE id = v_sub.partner_id;

  PERFORM public.refresh_partner_marketplace_reputation(v_sub.partner_id);

  INSERT INTO marketplace_metrics_events (idempotency_key, event_type, entity_type, entity_id, partner_id)
  VALUES (v_key, 'subscription_signup', 'subscription', p_subscription_id, v_sub.partner_id);

  RETURN true;
END;
$$;

-- =============================================================================
-- Favorites counter sync
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_marketplace_favorites_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_id UUID;
  v_item_type TEXT;
  v_delta INTEGER;
  v_count INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_item_id := NEW.item_id;
    v_item_type := NEW.item_type;
    v_delta := 1;
  ELSIF TG_OP = 'DELETE' THEN
    v_item_id := OLD.item_id;
    v_item_type := OLD.item_type;
    v_delta := -1;
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_item_type = 'produto' THEN
    SELECT count(*) INTO v_count FROM favorites WHERE item_id = v_item_id AND item_type = 'produto';
    UPDATE products SET
      favorites_count = v_count,
      marketplace_score = public.calc_product_marketplace_score(
        sales_last_30_days, views_last_30_days, v_count, created_at, rating
      )
    WHERE id = v_item_id;
  ELSIF v_item_type = 'servico' THEN
    SELECT count(*) INTO v_count FROM favorites WHERE item_id = v_item_id AND item_type = 'servico';
    UPDATE services SET
      favorites_count = v_count,
      marketplace_score = public.calc_service_marketplace_score(
        bookings_last_30_days, views_count, v_count, created_at, rating
      )
    WHERE id = v_item_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_marketplace_favorites ON public.favorites;
CREATE TRIGGER trg_sync_marketplace_favorites
  AFTER INSERT OR DELETE ON public.favorites
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_marketplace_favorites_count();

-- =============================================================================
-- View increment RPC
-- =============================================================================

CREATE OR REPLACE FUNCTION public.increment_marketplace_view(
  p_entity_type TEXT,
  p_entity_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_entity_type = 'produto' THEN
    UPDATE products
    SET
      views_count = views_count + 1,
      views_last_30_days = views_last_30_days + 1,
      marketplace_score = public.calc_product_marketplace_score(
        sales_last_30_days, views_last_30_days + 1, favorites_count, created_at, rating
      )
    WHERE id = p_entity_id;
  ELSIF p_entity_type = 'servico' THEN
    UPDATE services
    SET
      views_count = views_count + 1,
      marketplace_score = public.calc_service_marketplace_score(
        bookings_last_30_days, views_count + 1, favorites_count, created_at, rating
      )
    WHERE id = p_entity_id;
  ELSIF p_entity_type = 'plano' THEN
    UPDATE recurring_plans
    SET
      views_count = views_count + 1,
      marketplace_score = public.calc_plan_marketplace_score(
        signups_last_30_days, views_count + 1, favorites_count, created_at, 0
      )
    WHERE id = p_entity_id;
  END IF;
END;
$$;

-- =============================================================================
-- Indexes for ranking queries
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_products_marketplace_score
  ON public.products (marketplace_score DESC)
  WHERE is_active = true AND show_in_marketplace = true;

CREATE INDEX IF NOT EXISTS idx_services_marketplace_score
  ON public.services (marketplace_score DESC)
  WHERE is_active = true AND show_in_marketplace = true;

CREATE INDEX IF NOT EXISTS idx_recurring_plans_marketplace_score
  ON public.recurring_plans (marketplace_score DESC)
  WHERE status = 'active' AND show_in_marketplace = true;

CREATE INDEX IF NOT EXISTS idx_orders_paid_partner
  ON public.orders (partner_id, updated_at DESC)
  WHERE situation = 'paid';

CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON public.order_items (order_id);

-- =============================================================================
-- Backfill helpers
-- =============================================================================

CREATE OR REPLACE FUNCTION public.backfill_reset_marketplace_counters()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE partners SET
    vendas_totais = 0, vendas_produtos = 0, vendas_servicos = 0, vendas_assinaturas = 0,
    completed_orders_count = 0, completed_appointments_count = 0, active_subscriptions_count = 0,
    marketplace_reputation = 0, cancellation_rate = 0;

  UPDATE products SET
    total_sales = 0, sales_last_30_days = 0, sales_last_7_days = 0,
    views_count = 0, views_last_30_days = 0, favorites_count = 0, marketplace_score = 0, last_sale_at = NULL;

  UPDATE product_variants SET
    total_sales = 0, sales_last_30_days = 0, sales_last_7_days = 0, last_sale_at = NULL;

  UPDATE services SET
    total_bookings = 0, completed_bookings = 0, bookings_last_30_days = 0, bookings_last_7_days = 0,
    views_count = 0, favorites_count = 0, marketplace_score = 0, last_booking_at = NULL;

  UPDATE recurring_plans SET
    total_signups = 0, active_signups = 0, signups_last_30_days = 0, signups_last_7_days = 0,
    views_count = 0, favorites_count = 0, marketplace_score = 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_marketplace_rolling_windows()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE products p SET
    sales_last_7_days = coalesce(stats.qty_7d, 0),
    sales_last_30_days = coalesce(stats.qty_30d, 0),
    marketplace_score = public.calc_product_marketplace_score(
      coalesce(stats.qty_30d, 0), p.views_last_30_days, p.favorites_count, p.created_at, p.rating
    )
  FROM (
    SELECT
      oi.product_id,
      sum(oi.quantity) FILTER (WHERE o.updated_at > now() - interval '7 days') AS qty_7d,
      sum(oi.quantity) FILTER (WHERE o.updated_at > now() - interval '30 days') AS qty_30d
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi.order_id
    WHERE o.situation = 'paid' AND oi.product_id IS NOT NULL
    GROUP BY oi.product_id
  ) stats
  WHERE p.id = stats.product_id;

  UPDATE product_variants pv SET
    sales_last_7_days = coalesce(stats.qty_7d, 0),
    sales_last_30_days = coalesce(stats.qty_30d, 0)
  FROM (
    SELECT
      oi.variant_id,
      sum(oi.quantity) FILTER (WHERE o.updated_at > now() - interval '7 days') AS qty_7d,
      sum(oi.quantity) FILTER (WHERE o.updated_at > now() - interval '30 days') AS qty_30d
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi.order_id
    WHERE o.situation = 'paid' AND oi.variant_id IS NOT NULL
    GROUP BY oi.variant_id
  ) stats
  WHERE pv.id = stats.variant_id;

  UPDATE services s SET
    bookings_last_7_days = coalesce(stats.cnt_7d, 0),
    bookings_last_30_days = coalesce(stats.cnt_30d, 0),
    marketplace_score = public.calc_service_marketplace_score(
      coalesce(stats.cnt_30d, 0), s.views_count, s.favorites_count, s.created_at, s.rating
    )
  FROM (
    SELECT
      oi.service_id,
      count(*) FILTER (WHERE o.updated_at > now() - interval '7 days') AS cnt_7d,
      count(*) FILTER (WHERE o.updated_at > now() - interval '30 days') AS cnt_30d
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi.order_id
    WHERE o.situation = 'paid' AND oi.service_id IS NOT NULL
    GROUP BY oi.service_id
  ) stats
  WHERE s.id = stats.service_id;

  UPDATE recurring_plans rp SET
    signups_last_7_days = coalesce(stats.cnt_7d, 0),
    signups_last_30_days = coalesce(stats.cnt_30d, 0),
    marketplace_score = public.calc_plan_marketplace_score(
      coalesce(stats.cnt_30d, 0), rp.views_count, rp.favorites_count, rp.created_at, 0
    )
  FROM (
    SELECT
      rs.recurring_plan_id,
      count(*) FILTER (WHERE rs.created_at > now() - interval '7 days') AS cnt_7d,
      count(*) FILTER (WHERE rs.created_at > now() - interval '30 days') AS cnt_30d
    FROM recurring_subscriptions rs
    WHERE rs.status IN ('active', 'paused')
    GROUP BY rs.recurring_plan_id
  ) stats
  WHERE rp.id = stats.recurring_plan_id;
END;
$$;
