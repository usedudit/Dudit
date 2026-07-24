-- Migration: Clean obsolete/moved columns from partners table and update database RPCs to target stores
-- 1. Ensure all store/metrics columns exist on stores table
-- 2. Backfill stores table from partners table before dropping
-- 3. Drop moved and discontinued columns from partners table
-- 4. Update database RPC functions to query stores table instead of partners table

BEGIN;

-- ─── 1. Add missing columns to stores table if not present ────────────────────
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS risk_score INT DEFAULT 0;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS vendas_produtos INT DEFAULT 0;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS vendas_servicos INT DEFAULT 0;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS vendas_assinaturas INT DEFAULT 0;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS marketplace_reputation NUMERIC DEFAULT 0;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS completed_orders_count INT DEFAULT 0;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS completed_appointments_count INT DEFAULT 0;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS active_subscriptions_count INT DEFAULT 0;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS cancellation_rate NUMERIC DEFAULT 0;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Sao_Paulo';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS pickup_payment_policy TEXT;

-- ─── 2. Backfill stores metrics & settings from partners if stores column is default/null ─────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partners' AND column_name='risk_score') THEN
    EXECUTE 'UPDATE public.stores s SET risk_score = COALESCE(s.risk_score, p.risk_score, 0) FROM public.partners p WHERE s.partner_id = p.id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partners' AND column_name='vendas_produtos') THEN
    EXECUTE 'UPDATE public.stores s SET vendas_produtos = COALESCE(s.vendas_produtos, p.vendas_produtos, 0) FROM public.partners p WHERE s.partner_id = p.id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partners' AND column_name='vendas_servicos') THEN
    EXECUTE 'UPDATE public.stores s SET vendas_servicos = COALESCE(s.vendas_servicos, p.vendas_servicos, 0) FROM public.partners p WHERE s.partner_id = p.id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partners' AND column_name='vendas_assinaturas') THEN
    EXECUTE 'UPDATE public.stores s SET vendas_assinaturas = COALESCE(s.vendas_assinaturas, p.vendas_assinaturas, 0) FROM public.partners p WHERE s.partner_id = p.id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partners' AND column_name='marketplace_reputation') THEN
    EXECUTE 'UPDATE public.stores s SET marketplace_reputation = COALESCE(s.marketplace_reputation, p.marketplace_reputation, 0) FROM public.partners p WHERE s.partner_id = p.id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partners' AND column_name='completed_orders_count') THEN
    EXECUTE 'UPDATE public.stores s SET completed_orders_count = COALESCE(s.completed_orders_count, p.completed_orders_count, 0) FROM public.partners p WHERE s.partner_id = p.id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partners' AND column_name='completed_appointments_count') THEN
    EXECUTE 'UPDATE public.stores s SET completed_appointments_count = COALESCE(s.completed_appointments_count, p.completed_appointments_count, 0) FROM public.partners p WHERE s.partner_id = p.id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partners' AND column_name='active_subscriptions_count') THEN
    EXECUTE 'UPDATE public.stores s SET active_subscriptions_count = COALESCE(s.active_subscriptions_count, p.active_subscriptions_count, 0) FROM public.partners p WHERE s.partner_id = p.id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partners' AND column_name='cancellation_rate') THEN
    EXECUTE 'UPDATE public.stores s SET cancellation_rate = COALESCE(s.cancellation_rate, p.cancellation_rate, 0) FROM public.partners p WHERE s.partner_id = p.id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partners' AND column_name='timezone') THEN
    EXECUTE 'UPDATE public.stores s SET timezone = COALESCE(s.timezone, p.timezone, ''America/Sao_Paulo'') FROM public.partners p WHERE s.partner_id = p.id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partners' AND column_name='pickup_payment_policy') THEN
    EXECUTE 'UPDATE public.stores s SET pickup_payment_policy = COALESCE(s.pickup_payment_policy, p.pickup_payment_policy) FROM public.partners p WHERE s.partner_id = p.id';
  END IF;
END $$;

-- ─── 3. Drop moved and discontinued columns from partners table ───────────────
ALTER TABLE public.partners DROP COLUMN IF EXISTS store_name CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS store_description CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS opening_hours CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS store_image_url CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS rating CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS risk_score CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS vendas_totais CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS latitude CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS longitude CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS phone CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS banner_url CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS gallery CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS vendas_produtos CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS vendas_servicos CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS vendas_assinaturas CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS marketplace_reputation CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS completed_orders_count CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS completed_appointments_count CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS active_subscriptions_count CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS cancellation_rate CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS timezone CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS pickup_payment_policy CASCADE;

-- Discontinued columns
ALTER TABLE public.partners DROP COLUMN IF EXISTS category CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS service_deposit_manual_enabled CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS service_deposit_mp_enabled CASCADE;

-- ─── 4. Update Database RPC Functions to query stores table ──────────────────

-- Risk score increment
CREATE OR REPLACE FUNCTION public.increment_partner_risk_score(
  p_partner_id UUID,
  p_points INTEGER,
  p_source_type TEXT DEFAULT 'manual',
  p_source_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB,
  p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted UUID;
  v_new_score INTEGER;
  v_applied INTEGER := 0;
BEGIN
  IF p_partner_id IS NULL THEN
    RAISE EXCEPTION 'partner_required';
  END IF;
  IF p_points IS NULL OR p_points < 0 OR p_points > 50 THEN
    RAISE EXCEPTION 'invalid_points';
  END IF;

  IF p_source_id IS NOT NULL AND p_source_type IS NOT NULL THEN
    INSERT INTO public.partner_risk_events
      (partner_id, source_type, source_id, points, admin_user_id, metadata)
    VALUES
      (p_partner_id, p_source_type, p_source_id, p_points, p_admin_user_id, COALESCE(p_metadata, '{}'::JSONB))
    ON CONFLICT (source_type, source_id) WHERE reverted_at IS NULL DO NOTHING
    RETURNING id INTO v_inserted;

    IF v_inserted IS NULL THEN
      SELECT risk_score INTO v_new_score FROM public.stores WHERE partner_id = p_partner_id LIMIT 1;
      RETURN jsonb_build_object('applied', 0, 'idempotent', true, 'risk_score', COALESCE(v_new_score, 0));
    END IF;
    v_applied := p_points;
  ELSE
    v_applied := p_points;
  END IF;

  UPDATE public.stores
  SET risk_score = LEAST(100, GREATEST(0, COALESCE(risk_score, 0) + v_applied))
  WHERE partner_id = p_partner_id
  RETURNING risk_score INTO v_new_score;

  RETURN jsonb_build_object(
    'applied', v_applied,
    'idempotent', false,
    'risk_score', COALESCE(v_new_score, 0),
    'partner_id', p_partner_id
  );
END;
$$;

-- Partner reputation refresh helper
CREATE OR REPLACE FUNCTION public.refresh_partner_marketplace_reputation(p_partner_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.stores WHERE partner_id = p_partner_id LOOP
    PERFORM public.refresh_store_marketplace_reputation(r.id);
  END LOOP;
END;
$$;

-- Order metrics
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

  IF NOT v_has_product AND NOT v_has_service AND NOT v_has_subscription THEN
  SELECT EXISTS (
    SELECT 1 FROM order_items WHERE order_id = p_order_id AND product_id IS NOT NULL
  ) INTO v_has_product;
  END IF;

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
  ELSE
    UPDATE stores
    SET
      vendas_totais = coalesce(vendas_totais, 0) + 1,
      vendas_produtos = vendas_produtos + CASE WHEN v_has_product THEN 1 ELSE 0 END,
      vendas_servicos = vendas_servicos + CASE WHEN v_has_service THEN 1 ELSE 0 END,
      vendas_assinaturas = vendas_assinaturas + CASE WHEN v_has_subscription THEN 1 ELSE 0 END,
      completed_orders_count = completed_orders_count + 1
    WHERE partner_id = v_order.partner_id;
  END IF;

  INSERT INTO marketplace_metrics_events (idempotency_key, event_type, entity_type, entity_id, partner_id)
  VALUES (v_key, 'order_paid', 'order', p_order_id, v_order.partner_id);

  RETURN true;
END;
$$;

-- Appointment booking metrics
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

  IF v_appt.store_id IS NOT NULL THEN
    UPDATE stores
    SET
      vendas_totais = coalesce(vendas_totais, 0) + 1,
      vendas_servicos = vendas_servicos + 1,
      completed_appointments_count = completed_appointments_count + 1
    WHERE id = v_appt.store_id;

    PERFORM public.refresh_store_marketplace_reputation(v_appt.store_id);
  ELSE
    UPDATE stores
    SET
      vendas_totais = coalesce(vendas_totais, 0) + 1,
      vendas_servicos = vendas_servicos + 1,
      completed_appointments_count = completed_appointments_count + 1
    WHERE partner_id = v_appt.partner_id;
  END IF;

  INSERT INTO marketplace_metrics_events (idempotency_key, event_type, entity_type, entity_id, partner_id)
  VALUES (v_key, 'appointment_completed', 'appointment', p_appointment_id, v_appt.partner_id);

  RETURN true;
END;
$$;

-- Subscription signup metrics
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

  IF v_sub.store_id IS NOT NULL THEN
    UPDATE stores
    SET
      vendas_totais = coalesce(vendas_totais, 0) + 1,
      vendas_assinaturas = vendas_assinaturas + 1,
      active_subscriptions_count = active_subscriptions_count + 1
    WHERE id = v_sub.store_id;

    PERFORM public.refresh_store_marketplace_reputation(v_sub.store_id);
  ELSE
    UPDATE stores
    SET
      vendas_totais = coalesce(vendas_totais, 0) + 1,
      vendas_assinaturas = vendas_assinaturas + 1,
      active_subscriptions_count = active_subscriptions_count + 1
    WHERE partner_id = v_sub.partner_id;
  END IF;

  INSERT INTO marketplace_metrics_events (idempotency_key, event_type, entity_type, entity_id, partner_id)
  VALUES (v_key, 'subscription_signup', 'subscription', p_subscription_id, v_sub.partner_id);

  RETURN true;
END;
$$;

-- Search FTS RPC update
CREATE OR REPLACE FUNCTION public.search_marketplace_fts(
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
  v_tsq TSQUERY;
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
      ) * public.mp_store_risk_rank_multiplier(st.risk_score) AS rank
    FROM public.products p
    JOIN public.partners pt ON pt.id = p.partner_id
    LEFT JOIN public.stores st ON st.id = p.store_id
    WHERE (p_type IN ('tudo', 'produtos'))
      AND p.is_active = TRUE
      AND p.show_in_marketplace = TRUE
      AND NOT public.mp_store_risk_is_hidden(st.risk_score)
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
      ) * public.mp_store_risk_rank_multiplier(st.risk_score)
    FROM public.services s
    JOIN public.partners pt ON pt.id = s.partner_id
    LEFT JOIN public.stores st ON st.id = s.store_id
    WHERE (p_type IN ('tudo', 'servicos'))
      AND s.is_active = TRUE
      AND s.show_in_marketplace = TRUE
      AND NOT public.mp_store_risk_is_hidden(st.risk_score)
      AND (p_partner_ids IS NULL OR s.partner_id = ANY(p_partner_ids))
      AND (p_store_ids IS NULL OR (s.store_id IS NOT NULL AND s.store_id = ANY(p_store_ids)))
      AND public.mp_search_row_matches(
        s.name, s.mp_search_category_text, s.mp_search_subcategory_text,
        s.fts, v_tsq, v_norm, v_tokens, v_expanded
      )

    UNION ALL

    SELECT
      'loja'::TEXT,
      st.id,
      st.created_at,
      st.partner_id,
      st.id AS store_id,
      public.mp_compute_search_rank(
        st.name, v_norm, v_tokens, v_expanded,
        pt.mp_search_category_text, NULL,
        st.fts, v_tsq, st.marketplace_reputation, st.rating, st.completed_orders_count, st.created_at
      ) * public.mp_store_risk_rank_multiplier(st.risk_score)
    FROM public.stores st
    JOIN public.partners pt ON pt.id = st.partner_id
    WHERE (p_type IN ('tudo', 'vitrines'))
      AND st.is_active = TRUE
      AND NOT public.mp_store_risk_is_hidden(st.risk_score)
      AND (p_partner_ids IS NULL OR st.partner_id = ANY(p_partner_ids))
      AND public.mp_search_row_matches(
        st.name, pt.mp_search_category_text, NULL,
        st.fts, v_tsq, v_norm, v_tokens, v_expanded
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
      ) * public.mp_store_risk_rank_multiplier(st.risk_score)
    FROM public.recurring_plans rp
    JOIN public.partners pt ON pt.id = rp.partner_id
    LEFT JOIN public.stores st ON st.id = rp.store_id
    WHERE (p_type IN ('tudo', 'planos'))
      AND rp.status = 'active'
      AND rp.show_in_marketplace = TRUE
      AND NOT public.mp_store_risk_is_hidden(st.risk_score)
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

-- Browse score RPC update
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
  WITH combined AS (
    SELECT
      'produto'::TEXT AS item_type,
      p.id,
      (p.marketplace_score::REAL
        * CASE WHEN st.is_showcase_active = false THEN 0.01 ELSE 1.0 END
        * public.mp_store_risk_rank_multiplier(st.risk_score)
      ) AS score,
      p.created_at,
      p.partner_id,
      p.store_id
    FROM public.products p
    JOIN public.partners pt ON pt.id = p.partner_id
    LEFT JOIN public.stores st ON st.id = p.store_id
    WHERE p_type IN ('tudo', 'produtos')
      AND p.is_active = true
      AND p.show_in_marketplace = true
      AND NOT public.mp_store_risk_is_hidden(st.risk_score)
      AND (p_partner_ids IS NULL OR p.partner_id = ANY(p_partner_ids))
      AND (p_store_ids IS NULL OR (p.store_id IS NOT NULL AND p.store_id = ANY(p_store_ids)))

    UNION ALL

    SELECT
      'servico'::TEXT,
      s.id,
      (s.marketplace_score::REAL
        * CASE WHEN st.is_showcase_active = false THEN 0.01 ELSE 1.0 END
        * public.mp_store_risk_rank_multiplier(st.risk_score)
      ),
      s.created_at,
      s.partner_id,
      s.store_id
    FROM public.services s
    JOIN public.partners pt ON pt.id = s.partner_id
    LEFT JOIN public.stores st ON st.id = s.store_id
    WHERE p_type IN ('tudo', 'servicos')
      AND s.is_active = true
      AND s.show_in_marketplace = true
      AND NOT public.mp_store_risk_is_hidden(st.risk_score)
      AND (p_partner_ids IS NULL OR s.partner_id = ANY(p_partner_ids))
      AND (p_store_ids IS NULL OR (s.store_id IS NOT NULL AND s.store_id = ANY(p_store_ids)))

    UNION ALL

    SELECT
      'plano'::TEXT,
      rp.id,
      (rp.marketplace_score::REAL
        * CASE WHEN st.is_showcase_active = false THEN 0.01 ELSE 1.0 END
        * public.mp_store_risk_rank_multiplier(st.risk_score)
      ),
      rp.created_at,
      rp.partner_id,
      rp.store_id
    FROM public.recurring_plans rp
    JOIN public.partners pt ON pt.id = rp.partner_id
    LEFT JOIN public.stores st ON st.id = rp.store_id
    WHERE p_type IN ('tudo', 'planos')
      AND rp.status = 'active'
      AND rp.show_in_marketplace = true
      AND NOT public.mp_store_risk_is_hidden(st.risk_score)
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

COMMIT;
