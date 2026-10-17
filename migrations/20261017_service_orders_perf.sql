-- ============================================================================
-- Migration: 20261017_service_orders_perf.sql
-- Description: Otimizações de performance do módulo de Ordens de Serviço.
--
-- A1) get_user_partner_ids() -> STABLE (hoje VOLATILE: reavaliado em RLS).
-- A2) Policies de service_orders/filhas -> TO authenticated (evita avaliação
--     desnecessária para anon; o portal público usa service_role/admin).
-- A3) Trigger de sync de pagamento: early-return para pedidos não vinculados
--     a nenhuma OS (evita rodar o UPDATE para todo pedido do sistema).
-- A4) RPC set-based recalc_service_order_totals(uuid): recalcula totais da OS,
--     ressincroniza order_items e orders em um único round-trip.
--
-- Idempotente: CREATE OR REPLACE / DROP ... IF EXISTS.
-- ============================================================================

-- ── A1) Volatilidade da função usada em RLS ─────────────────────────────────
ALTER FUNCTION public.get_user_partner_ids() STABLE;

-- ── A2) Policies apenas para authenticated ──────────────────────────────────
DROP POLICY IF EXISTS service_orders_select ON public.service_orders;
CREATE POLICY service_orders_select ON public.service_orders
  FOR SELECT TO authenticated
  USING (
    (partner_id IN (SELECT get_user_partner_ids()))
    AND ((store_id IS NULL) OR user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS service_orders_insert ON public.service_orders;
CREATE POLICY service_orders_insert ON public.service_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    (partner_id IN (SELECT get_user_partner_ids()))
    AND ((store_id IS NULL) OR user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS service_orders_update ON public.service_orders;
CREATE POLICY service_orders_update ON public.service_orders
  FOR UPDATE TO authenticated
  USING (
    (partner_id IN (SELECT get_user_partner_ids()))
    AND ((store_id IS NULL) OR user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS service_orders_delete ON public.service_orders;
CREATE POLICY service_orders_delete ON public.service_orders
  FOR DELETE TO authenticated
  USING (
    (partner_id IN (SELECT get_user_partner_ids()))
    AND ((store_id IS NULL) OR user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS store_isolation ON public.service_order_services;
CREATE POLICY store_isolation ON public.service_order_services
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_services.service_order_id
        AND so.partner_id IN (SELECT get_user_partner_ids())
        AND (so.store_id IS NULL OR user_has_store_access(so.store_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_services.service_order_id
        AND so.partner_id IN (SELECT get_user_partner_ids())
        AND (so.store_id IS NULL OR user_has_store_access(so.store_id))
    )
  );

DROP POLICY IF EXISTS store_isolation ON public.service_order_products;
CREATE POLICY store_isolation ON public.service_order_products
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_products.service_order_id
        AND so.partner_id IN (SELECT get_user_partner_ids())
        AND (so.store_id IS NULL OR user_has_store_access(so.store_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_products.service_order_id
        AND so.partner_id IN (SELECT get_user_partner_ids())
        AND (so.store_id IS NULL OR user_has_store_access(so.store_id))
    )
  );

DROP POLICY IF EXISTS store_isolation ON public.service_order_attachments;
CREATE POLICY store_isolation ON public.service_order_attachments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_attachments.service_order_id
        AND so.partner_id IN (SELECT get_user_partner_ids())
        AND (so.store_id IS NULL OR user_has_store_access(so.store_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_attachments.service_order_id
        AND so.partner_id IN (SELECT get_user_partner_ids())
        AND (so.store_id IS NULL OR user_has_store_access(so.store_id))
    )
  );

-- ── A3) Trigger: early-return para pedidos não vinculados a OS ──────────────
CREATE OR REPLACE FUNCTION public.sync_service_order_payment_from_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment_status TEXT;
BEGIN
  -- Só reage quando situação ou valor pago mudam
  IF NEW.situation IS NOT DISTINCT FROM OLD.situation
     AND NEW.paid_amount IS NOT DISTINCT FROM OLD.paid_amount THEN
    RETURN NEW;
  END IF;

  -- Fast path: pedido sem vínculo com nenhuma OS (por qualquer via indexada)
  IF NEW.source_service_order_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.service_orders so WHERE so.order_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_payment_status := CASE
    WHEN NEW.situation = 'paid' THEN 'paid'
    WHEN NEW.situation = 'partially_paid' THEN 'partially_paid'
    ELSE 'unpaid'
  END;

  UPDATE public.service_orders
  SET payment_status = v_payment_status,
      paid_amount = GREATEST(COALESCE(NEW.paid_amount, 0), 0),
      updated_at = NOW()
  WHERE (NEW.source_service_order_id IS NOT NULL AND id = NEW.source_service_order_id)
     OR (order_id = NEW.id);

  RETURN NEW;
END;
$$;

-- ── A4) RPC de recálculo set-based ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recalc_service_order_totals(p_service_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order service_orders%ROWTYPE;
  v_total_service numeric := 0;
  v_total_product numeric := 0;
  v_subtotal numeric := 0;
  v_discount_amount numeric := 0;
  v_final_total numeric := 0;
  v_linked_order_id uuid;
BEGIN
  SELECT * INTO v_order FROM public.service_orders WHERE id = p_service_order_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(total_price), 0) INTO v_total_service
  FROM public.service_order_services WHERE service_order_id = p_service_order_id;

  SELECT COALESCE(SUM(total_price), 0) INTO v_total_product
  FROM public.service_order_products WHERE service_order_id = p_service_order_id;

  v_subtotal := v_total_service + v_total_product;

  IF v_order.discount_type = 'percentage' THEN
    v_discount_amount := (v_subtotal * COALESCE(v_order.discount_value, 0)) / 100;
  ELSIF v_order.discount_type = 'fixed' THEN
    v_discount_amount := COALESCE(v_order.discount_value, 0);
  ELSIF v_order.discount_type = 'coupon' THEN
    v_discount_amount := COALESCE(v_order.coupon_discount_amount, 0);
  ELSE
    v_discount_amount := 0;
  END IF;

  v_final_total := GREATEST(0, v_subtotal - v_discount_amount + COALESCE(v_order.other_costs, 0));

  UPDATE public.service_orders
  SET total_service_amount = v_total_service,
      total_product_amount = v_total_product,
      total_amount = v_final_total
  WHERE id = p_service_order_id;

  v_linked_order_id := v_order.order_id;
  IF v_linked_order_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.order_items WHERE order_id = v_linked_order_id;

  INSERT INTO public.order_items (
    order_id, product_id, variant_id, product_name, product_price, quantity,
    subtotal, line_type, fulfillment_mode, service_id, is_gift, original_price,
    is_promotional, promotion_id, sort_order
  )
  SELECT
    v_linked_order_id, s.service_id, NULL::uuid, COALESCE(s.service_name, 'Mão de Obra'),
    COALESCE(s.service_price, 0), COALESCE(s.quantity, 1), COALESCE(s.total_price, 0),
    'service_booking', 'on_site', s.service_id, false, NULL::numeric, false, NULL::uuid, COALESCE(s.sort_order, 0)
  FROM public.service_order_services s
  WHERE s.service_order_id = p_service_order_id
  UNION ALL
  SELECT
    v_linked_order_id, p.product_id, p.variant_id, COALESCE(p.product_name, 'Produto'),
    COALESCE(p.unit_price, 0), COALESCE(p.quantity, 1), COALESCE(p.total_price, 0),
    'product', 'delivery', NULL::uuid, false, NULL::numeric, false, NULL::uuid, COALESCE(p.sort_order, 0)
  FROM public.service_order_products p
  WHERE p.service_order_id = p_service_order_id;

  UPDATE public.orders
  SET total_amount = v_final_total,
      discount_value = COALESCE(v_order.discount_value, 0),
      discount_type = v_order.discount_type,
      discount_amount = v_discount_amount,
      additional_costs = COALESCE(v_order.other_costs, 0),
      order_source = 'Ordem de Serviço',
      source_service_order_id = p_service_order_id
  WHERE id = v_linked_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalc_service_order_totals(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
