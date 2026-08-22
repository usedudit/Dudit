-- =============================================================================
-- Fix: Remove dropped 'partners' metric columns references in RPC functions
-- =============================================================================
-- In migration 20260729_clean_partners_schema.sql, metric counter columns
-- (vendas_totais, vendas_produtos, vendas_servicos, vendas_assinaturas,
-- completed_orders_count, completed_appointments_count, active_subscriptions_count)
-- were moved from 'partners' to 'stores'.
--
-- Migration 20260812 accidentally reintroduced UPDATE partners SET vendas_totais...
-- This migration updates record_marketplace_order_metrics,
-- record_appointment_booking_metrics, record_subscription_signup_metrics and
-- backfill_reset_marketplace_counters to only target the 'stores' table.
-- =============================================================================

-- 1. record_marketplace_order_metrics
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

  SELECT id, partner_id, store_id, situation, buyer_id, order_source
  INTO v_order
  FROM orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN RETURN false; END IF;
  IF lower(coalesce(v_order.situation, '')) NOT IN ('paid', 'approved') THEN RETURN false; END IF;

  -- GUARD: Only count orders that originated from the marketplace (Vitrine Online)
  IF lower(coalesce(v_order.order_source, '')) <> 'vitrine online' THEN
    RETURN false;
  END IF;

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

  -- Update store counters
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

  PERFORM public.refresh_partner_marketplace_reputation(v_order.partner_id);

  INSERT INTO marketplace_metrics_events (idempotency_key, event_type, entity_type, entity_id, partner_id)
  VALUES (v_key, 'order_paid', 'order', p_order_id, v_order.partner_id);

  RETURN true;
END;
$$;

-- 2. record_appointment_booking_metrics
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

  -- GUARD: Only count marketplace-origin bookings (online_storefront channel)
  IF lower(coalesce(v_appt.sales_channel, '')) <> 'online_storefront' THEN
    RETURN false;
  END IF;

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

  PERFORM public.refresh_partner_marketplace_reputation(v_appt.partner_id);

  INSERT INTO marketplace_metrics_events (idempotency_key, event_type, entity_type, entity_id, partner_id)
  VALUES (v_key, 'appointment_completed', 'appointment', p_appointment_id, v_appt.partner_id);

  RETURN true;
END;
$$;

-- 3. record_subscription_signup_metrics
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

  SELECT id, partner_id, store_id, status, recurring_plan_id, buyer_id, sales_channel
  INTO v_sub
  FROM recurring_subscriptions
  WHERE id = p_subscription_id;

  IF NOT FOUND THEN RETURN false; END IF;
  IF v_sub.status NOT IN ('active', 'trialing') THEN RETURN false; END IF;

  -- GUARD: Only count marketplace-origin subscriptions (online_storefront channel)
  IF lower(coalesce(v_sub.sales_channel, '')) <> 'online_storefront' THEN
    RETURN false;
  END IF;

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

  PERFORM public.refresh_partner_marketplace_reputation(v_sub.partner_id);

  INSERT INTO marketplace_metrics_events (idempotency_key, event_type, entity_type, entity_id, partner_id)
  VALUES (v_key, 'subscription_signup', 'subscription', p_subscription_id, v_sub.partner_id);

  RETURN true;
END;
$$;

-- 4. backfill_reset_marketplace_counters
CREATE OR REPLACE FUNCTION public.backfill_reset_marketplace_counters()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE stores SET
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

-- 5. Revoke execute from public/anon/authenticated
REVOKE EXECUTE ON FUNCTION public.record_marketplace_order_metrics(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_appointment_booking_metrics(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_subscription_signup_metrics(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.backfill_reset_marketplace_counters() FROM anon, authenticated;
