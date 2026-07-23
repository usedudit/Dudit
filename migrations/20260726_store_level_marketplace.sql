-- =============================================================================
-- Store-level marketplace: ranking, risk, metrics, and reviews
-- Adds rating + risk_score + marketplace counters to stores table.
-- Updates search_marketplace & browse_marketplace_by_score for store diversity.
-- Updates metrics RPCs to also update store-level counters.
-- =============================================================================

-- ─── 1. Add store-level columns ───────────────────────────────────────────────

ALTER TABLE stores ADD COLUMN IF NOT EXISTS rating NUMERIC DEFAULT 0;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 0;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS marketplace_reputation NUMERIC DEFAULT 0;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS vendas_totais INTEGER DEFAULT 0;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS vendas_produtos INTEGER DEFAULT 0;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS vendas_servicos INTEGER DEFAULT 0;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS vendas_assinaturas INTEGER DEFAULT 0;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS completed_orders_count INTEGER DEFAULT 0;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS completed_appointments_count INTEGER DEFAULT 0;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS active_subscriptions_count INTEGER DEFAULT 0;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS cancellation_rate NUMERIC DEFAULT 0;

-- Add store_id to subscriptions table for store-scoped subscription metrics
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_store_id ON subscriptions(store_id);

ALTER TABLE recurring_subscriptions ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_recurring_subscriptions_store_id ON recurring_subscriptions(store_id);

-- Add store_id to recurring_plans table (used by search_marketplace)
ALTER TABLE recurring_plans ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_recurring_plans_store_id ON recurring_plans(store_id);

-- Add suspension columns to stores table for admin enforcement
ALTER TABLE stores ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS suspended_reason TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES user_profiles(user_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_stores_suspended_at ON stores(suspended_at);

-- ─── 2. Store-level risk functions ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mp_store_risk_rank_multiplier(p_risk_score INTEGER)
RETURNS REAL
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN COALESCE(p_risk_score, 0) >= 100 THEN 0.0
    WHEN COALESCE(p_risk_score, 0) >= 50 THEN 0.55
    WHEN COALESCE(p_risk_score, 0) >= 25 THEN 0.88
    ELSE 1.0
  END::REAL;
$$;

CREATE OR REPLACE FUNCTION public.mp_store_risk_is_hidden(p_risk_score INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT COALESCE(p_risk_score, 0) >= 100;
$$;

COMMENT ON FUNCTION public.mp_store_risk_rank_multiplier IS
  'Store-level risk penalization in ranking. Mirror of mp_partner_risk_rank_multiplier.';

COMMENT ON FUNCTION public.mp_store_risk_is_hidden IS
  'Auto-hide store from search when risk_score >= 100.';

-- ─── 3. Update search_marketplace: store_id diversity + store risk ───────────

DROP FUNCTION IF EXISTS public.search_marketplace(TEXT, TEXT, INT, REAL, UUID, UUID[]);

CREATE OR REPLACE FUNCTION public.search_marketplace(
  p_query TEXT,
  p_type TEXT DEFAULT 'tudo',
  p_limit INT DEFAULT 20,
  p_cursor_rank REAL DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL,
  p_partner_ids UUID[] DEFAULT NULL,
  p_store_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  item_type TEXT,
  id UUID,
  rank REAL,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
  v_norm TEXT;
  v_tokens TEXT[];
  v_expanded TEXT[];
  v_tsq tsquery;
BEGIN
  v_norm := public.normalize_search_text(p_query);
  IF v_norm = '' THEN RETURN; END IF;

  v_tokens := regexp_split_to_array(v_norm, '\s+');
  v_expanded := public.expand_marketplace_search_terms(v_tokens);
  v_tsq := public.build_marketplace_tsquery(p_query);

  RETURN QUERY
  WITH combined AS (
    SELECT
      'produto'::TEXT AS item_type,
      p.id,
      p.created_at,
      p.partner_id,
      p.store_id,
      public.mp_compute_search_rank(
        p.name, v_norm, v_tokens, v_expanded,
        p.mp_search_category_text, p.mp_search_subcategory_text,
        p.fts, v_tsq, p.marketplace_score, p.rating, p.sales_last_30_days, p.created_at
      ) * COALESCE(
        public.mp_store_risk_rank_multiplier(st.risk_score),
        public.mp_partner_risk_rank_multiplier(pt.risk_score)
      ) AS rank
    FROM public.products p
    JOIN public.partners pt ON pt.id = p.partner_id
    LEFT JOIN public.stores st ON st.id = p.store_id
    WHERE (p_type IN ('tudo', 'produtos'))
      AND p.is_active = TRUE
      AND p.show_in_marketplace = TRUE
      AND NOT COALESCE(public.mp_store_risk_is_hidden(st.risk_score), public.mp_partner_risk_is_hidden(pt.risk_score))
      AND (p_partner_ids IS NULL OR p.partner_id = ANY(p_partner_ids))
      AND (p_store_ids IS NULL OR (p.store_id IS NOT NULL AND p.store_id = ANY(p_store_ids)))
      AND public.mp_search_row_matches(
        p.name, p.mp_search_category_text, p.mp_search_subcategory_text,
        p.fts, v_tsq, v_norm, v_tokens, v_expanded
      )

    UNION ALL

    SELECT
      'servico'::TEXT,
      s.id,
      s.created_at,
      s.partner_id,
      s.store_id,
      public.mp_compute_search_rank(
        s.name, v_norm, v_tokens, v_expanded,
        s.mp_search_category_text, s.mp_search_subcategory_text,
        s.fts, v_tsq, s.marketplace_score, s.rating, s.bookings_last_30_days, s.created_at
      ) * COALESCE(
        public.mp_store_risk_rank_multiplier(st.risk_score),
        public.mp_partner_risk_rank_multiplier(pt.risk_score)
      )
    FROM public.services s
    JOIN public.partners pt ON pt.id = s.partner_id
    LEFT JOIN public.stores st ON st.id = s.store_id
    WHERE (p_type IN ('tudo', 'servicos'))
      AND s.is_active = TRUE
      AND s.show_in_marketplace = TRUE
      AND NOT COALESCE(public.mp_store_risk_is_hidden(st.risk_score), public.mp_partner_risk_is_hidden(pt.risk_score))
      AND (p_partner_ids IS NULL OR s.partner_id = ANY(p_partner_ids))
      AND (p_store_ids IS NULL OR (s.store_id IS NOT NULL AND s.store_id = ANY(p_store_ids)))
      AND public.mp_search_row_matches(
        s.name, s.mp_search_category_text, s.mp_search_subcategory_text,
        s.fts, v_tsq, v_norm, v_tokens, v_expanded
      )

    UNION ALL

    SELECT
      'loja'::TEXT,
      pt.id,
      pt.created_at,
      pt.id AS partner_id,
      NULL::UUID AS store_id,
      public.mp_compute_search_rank(
        pt.store_name, v_norm, v_tokens, v_expanded,
        pt.mp_search_category_text, NULL,
        pt.fts, v_tsq, pt.marketplace_reputation, pt.rating, pt.completed_orders_count, pt.created_at
      ) * public.mp_partner_risk_rank_multiplier(pt.risk_score)
    FROM public.partners pt
    WHERE (p_type IN ('tudo', 'vitrines'))
      AND pt.is_active = TRUE
      AND NOT public.mp_partner_risk_is_hidden(pt.risk_score)
      AND (p_partner_ids IS NULL OR pt.id = ANY(p_partner_ids))
      AND public.mp_search_row_matches(
        pt.store_name, pt.mp_search_category_text, NULL,
        pt.fts, v_tsq, v_norm, v_tokens, v_expanded
      )

    UNION ALL

    SELECT
      'plano'::TEXT,
      rp.id,
      rp.created_at,
      rp.partner_id,
      rp.store_id,
      public.mp_compute_search_rank(
        rp.name, v_norm, v_tokens, v_expanded,
        NULL, NULL,
        rp.fts, v_tsq, rp.marketplace_score, 0, rp.signups_last_30_days, rp.created_at
      ) * COALESCE(
        public.mp_store_risk_rank_multiplier(st.risk_score),
        public.mp_partner_risk_rank_multiplier(pt.risk_score)
      )
    FROM public.recurring_plans rp
    JOIN public.partners pt ON pt.id = rp.partner_id
    LEFT JOIN public.stores st ON st.id = rp.store_id
    WHERE (p_type IN ('tudo', 'planos'))
      AND rp.status = 'active'
      AND rp.show_in_marketplace = TRUE
      AND NOT COALESCE(public.mp_store_risk_is_hidden(st.risk_score), public.mp_partner_risk_is_hidden(pt.risk_score))
      AND (p_partner_ids IS NULL OR rp.partner_id = ANY(p_partner_ids))
      AND (p_store_ids IS NULL OR (rp.store_id IS NOT NULL AND rp.store_id = ANY(p_store_ids)))
      AND public.mp_search_row_matches(
        rp.name, NULL, NULL,
        rp.fts, v_tsq, v_norm, v_tokens, v_expanded
      )
  ),
  diversified AS (
    SELECT
      c.*,
      row_number() OVER (
        PARTITION BY COALESCE(c.store_id::text, c.partner_id::text)
        ORDER BY c.rank DESC, c.id DESC
      ) AS seller_row
    FROM combined c
  )
  SELECT d.item_type, d.id, d.rank, d.created_at
  FROM diversified d
  WHERE d.seller_row <= 3
    AND (
      p_cursor_rank IS NULL
      OR p_cursor_id IS NULL
      OR (d.rank < p_cursor_rank OR (d.rank = p_cursor_rank AND d.id < p_cursor_id))
    )
  ORDER BY d.rank DESC, d.id DESC
  LIMIT greatest(p_limit, 1);
END;
$$;

-- ─── 4. Update browse_marketplace_by_score: store_id + risk ─────────────────

DROP FUNCTION IF EXISTS public.browse_marketplace_by_score(TEXT, INT, REAL, UUID, UUID[]);

CREATE OR REPLACE FUNCTION public.browse_marketplace_by_score(
  p_type TEXT DEFAULT 'produtos',
  p_limit INT DEFAULT 20,
  p_cursor_score REAL DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL,
  p_partner_ids UUID[] DEFAULT NULL,
  p_store_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  item_type TEXT,
  id UUID,
  score REAL,
  created_at TIMESTAMPTZ,
  partner_id UUID,
  store_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  WITH store_showcase AS (
    SELECT id, is_showcase_active FROM public.stores
    UNION
    SELECT id, is_showcase_active FROM public.partners
  ),
  combined AS (
    SELECT
      'produto'::TEXT AS item_type,
      p.id,
      (p.marketplace_score::REAL
        * CASE WHEN COALESCE(st.is_showcase_active, ss.is_showcase_active) = false THEN 0.01 ELSE 1.0 END
        * COALESCE(public.mp_store_risk_rank_multiplier(st.risk_score), public.mp_partner_risk_rank_multiplier(pt.risk_score))
      ) AS score,
      p.created_at,
      p.partner_id,
      p.store_id
    FROM public.products p
    JOIN public.partners pt ON pt.id = p.partner_id
    LEFT JOIN public.stores st ON st.id = p.store_id
    LEFT JOIN store_showcase ss ON ss.id = p.partner_id
    WHERE p_type IN ('tudo', 'produtos')
      AND p.is_active = true
      AND p.show_in_marketplace = true
      AND NOT COALESCE(public.mp_store_risk_is_hidden(st.risk_score), public.mp_partner_risk_is_hidden(pt.risk_score))
      AND (p_partner_ids IS NULL OR p.partner_id = ANY(p_partner_ids))
      AND (p_store_ids IS NULL OR (p.store_id IS NOT NULL AND p.store_id = ANY(p_store_ids)))

    UNION ALL

    SELECT
      'servico'::TEXT,
      s.id,
      (s.marketplace_score::REAL
        * CASE WHEN COALESCE(st.is_showcase_active, ss.is_showcase_active) = false THEN 0.01 ELSE 1.0 END
        * COALESCE(public.mp_store_risk_rank_multiplier(st.risk_score), public.mp_partner_risk_rank_multiplier(pt.risk_score))
      ),
      s.created_at,
      s.partner_id,
      s.store_id
    FROM public.services s
    JOIN public.partners pt ON pt.id = s.partner_id
    LEFT JOIN public.stores st ON st.id = s.store_id
    LEFT JOIN store_showcase ss ON ss.id = s.partner_id
    WHERE p_type IN ('tudo', 'servicos')
      AND s.is_active = true
      AND s.show_in_marketplace = true
      AND NOT COALESCE(public.mp_store_risk_is_hidden(st.risk_score), public.mp_partner_risk_is_hidden(pt.risk_score))
      AND (p_partner_ids IS NULL OR s.partner_id = ANY(p_partner_ids))
      AND (p_store_ids IS NULL OR (s.store_id IS NOT NULL AND s.store_id = ANY(p_store_ids)))

    UNION ALL

    SELECT
      'plano'::TEXT,
      rp.id,
      (rp.marketplace_score::REAL
        * CASE WHEN COALESCE(st.is_showcase_active, ss.is_showcase_active) = false THEN 0.01 ELSE 1.0 END
        * COALESCE(public.mp_store_risk_rank_multiplier(st.risk_score), public.mp_partner_risk_rank_multiplier(pt.risk_score))
      ),
      rp.created_at,
      rp.partner_id,
      rp.store_id
    FROM public.recurring_plans rp
    JOIN public.partners pt ON pt.id = rp.partner_id
    LEFT JOIN public.stores st ON st.id = rp.store_id
    LEFT JOIN store_showcase ss ON ss.id = rp.partner_id
    WHERE p_type IN ('tudo', 'planos')
      AND rp.status = 'active'
      AND rp.show_in_marketplace = true
      AND NOT COALESCE(public.mp_store_risk_is_hidden(st.risk_score), public.mp_partner_risk_is_hidden(pt.risk_score))
      AND (p_partner_ids IS NULL OR rp.partner_id = ANY(p_partner_ids))
      AND (p_store_ids IS NULL OR (rp.store_id IS NOT NULL AND rp.store_id = ANY(p_store_ids)))
  )
  SELECT c.item_type, c.id, c.score, c.created_at, c.partner_id, c.store_id
  FROM combined c
  WHERE
    p_cursor_score IS NULL
    OR p_cursor_id IS NULL
    OR (c.score < p_cursor_score OR (c.score = p_cursor_score AND c.id < p_cursor_id))
  ORDER BY c.score DESC, c.id DESC
  LIMIT greatest(p_limit, 1);
END;
$$;

-- ─── 5. Store reputation calculation ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.calc_store_marketplace_reputation(
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

CREATE OR REPLACE FUNCTION public.refresh_store_marketplace_reputation(p_store_id UUID)
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

  UPDATE stores
  SET marketplace_reputation = public.calc_store_marketplace_reputation(
    v_orders, v_appts, v_subs, v_rating, v_cancel_rate
  )
  WHERE id = p_store_id;
END;
$$;

-- ─── 6. Update record_marketplace_order_metrics: also stores ────────────────

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

  SELECT id, partner_id, store_id, situation, buyer_id
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

  -- Also update store counters if store_id is present
  IF v_order.store_id IS NOT NULL THEN
    UPDATE stores
    SET
      vendas_totais = coalesce(vendas_totais, 0) + 1,
      vendas_produtos = vendas_produtos + CASE WHEN v_has_product THEN 1 ELSE 0 END,
      vendas_servicos = vendas_servicos + CASE WHEN v_has_service THEN 1 ELSE 0 END,
      vendas_assinaturas = vendas_assinaturas + CASE WHEN v_has_subscription THEN 1 ELSE 0 END,
      completed_orders_count = completed_orders_count + 1
    WHERE id = v_order.store_id;

    PERFORM public.refresh_store_marketplace_reputation(v_order.store_id);
  END IF;

  PERFORM public.refresh_partner_marketplace_reputation(v_order.partner_id);

  INSERT INTO marketplace_metrics_events (idempotency_key, event_type, entity_type, entity_id, partner_id)
  VALUES (v_key, 'order_paid', 'order', p_order_id, v_order.partner_id);

  RETURN true;
END;
$$;

-- ─── 7. Update record_appointment_booking_metrics: also stores ──────────────

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

  SELECT id, partner_id, store_id, service_name, status, marketplace_order_id, sales_channel
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

  IF v_appt.store_id IS NOT NULL THEN
    UPDATE stores
    SET
      vendas_totais = coalesce(vendas_totais, 0) + 1,
      vendas_servicos = vendas_servicos + 1,
      completed_appointments_count = completed_appointments_count + 1
    WHERE id = v_appt.store_id;

    PERFORM public.refresh_store_marketplace_reputation(v_appt.store_id);
  END IF;

  PERFORM public.refresh_partner_marketplace_reputation(v_appt.partner_id);

  INSERT INTO marketplace_metrics_events (idempotency_key, event_type, entity_type, entity_id, partner_id)
  VALUES (v_key, 'appointment_completed', 'appointment', p_appointment_id, v_appt.partner_id);

  RETURN true;
END;
$$;

-- ─── 8. Update record_subscription_signup_metrics: also stores ──────────────

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

  SELECT id, partner_id, store_id, status, recurring_plan_id, buyer_id
  INTO v_sub
  FROM subscriptions
  WHERE id = p_subscription_id;

  IF NOT FOUND THEN RETURN false; END IF;
  IF v_sub.status NOT IN ('active', 'trialing') THEN RETURN false; END IF;

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

  IF v_sub.store_id IS NOT NULL THEN
    UPDATE stores
    SET
      vendas_totais = coalesce(vendas_totais, 0) + 1,
      vendas_assinaturas = vendas_assinaturas + 1,
      active_subscriptions_count = active_subscriptions_count + 1
    WHERE id = v_sub.store_id;

    PERFORM public.refresh_store_marketplace_reputation(v_sub.store_id);
  END IF;

  PERFORM public.refresh_partner_marketplace_reputation(v_sub.partner_id);

  INSERT INTO marketplace_metrics_events (idempotency_key, event_type, entity_type, entity_id, partner_id)
  VALUES (v_key, 'subscription_signup', 'subscription', p_subscription_id, v_sub.partner_id);

  RETURN true;
END;
$$;
