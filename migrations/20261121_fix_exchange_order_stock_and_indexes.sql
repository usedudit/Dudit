-- ============================================================================
-- Fix: create_exchange_order stock movement deduction + returns performance indexes
--
-- 1. Restores stock deduction (`create_batch_stock_movement`) when an exchange
--    order is created, attaching `order_id`, `store_id`, and `reference_name`
--    so the "Venda de Produtos" stock movement is always recorded atomically.
-- 2. Marks `orders.inventory_deducted = TRUE` only after stock is deducted.
-- 3. Adds partial indexes for faster exchange order lookups, stock movement
--    idempotency checks, and paginated return listings.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.create_exchange_order(
  p_request_id UUID,
  p_partner_id UUID,
  p_parent_order_id UUID,
  p_customer_id UUID,
  p_exchange_items JSONB,
  p_actor_user_id UUID DEFAULT NULL,
  p_store_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_parent_order RECORD;
  v_exchange_order_id UUID;
  v_exchange_order_number TEXT;
  v_exchange_total NUMERIC(14,2) := 0;
  v_max_action_amount NUMERIC(14,2) := 0;
  v_exchange_difference NUMERIC(14,2) := 0;
  v_exchange_item JSONB;
  v_store_id UUID;
  v_stock_items JSONB := '[]'::JSONB;
  v_stock_movement JSON;
  v_stock_movement_id UUID;
BEGIN
  SELECT * INTO v_request FROM public.return_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação de devolução não encontrada';
  END IF;

  SELECT * INTO v_parent_order FROM public.orders WHERE id = p_parent_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido original não encontrado';
  END IF;

  v_store_id := COALESCE(p_store_id, v_request.store_id, v_parent_order.store_id);

  -- Calcular total dos itens de troca: unit_price * quantity
  FOR v_exchange_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_exchange_items, '[]'::JSONB))
  LOOP
    v_exchange_total := v_exchange_total
      + ROUND((COALESCE((v_exchange_item->>'unit_price')::NUMERIC, (v_exchange_item->>'price')::NUMERIC, 0)
        * COALESCE((v_exchange_item->>'quantity')::INTEGER, 1))::NUMERIC, 2);
  END LOOP;

  -- Obter valor máximo devolvido dos itens
  SELECT COALESCE(SUM(net_item_value_snapshot), 0)
  INTO v_max_action_amount
  FROM public.return_items
  WHERE return_request_id = p_request_id;

  v_exchange_difference := GREATEST(0, v_exchange_total - v_max_action_amount);

  SELECT COALESCE(v_request.order_number_snapshot, v_parent_order.order_number, 'EX') || '-DVL' ||
         (COALESCE(COUNT(*), 0) + 1)::TEXT
  INTO v_exchange_order_number
  FROM public.orders
  WHERE exchange_parent_order_id = p_parent_order_id;

  INSERT INTO public.orders (
    order_number,
    buyer_id,
    customer_name,
    partner_id,
    store_id,
    total_amount,
    amount_paid,
    paid_amount,
    delivery_fee,
    delivery_type,
    delivery_address,
    payment_method,
    payment_provider,
    situation,
    delivery_status,
    order_source,
    notes,
    exchange_parent_order_id,
    exchange_return_request_id,
    payment_breakdown,
    inventory_deducted,
    created_at,
    updated_at
  ) VALUES (
    v_exchange_order_number,
    COALESCE(p_customer_id, v_request.customer_id, v_parent_order.buyer_id),
    COALESCE(v_request.customer_name_snapshot, v_parent_order.customer_name, 'Cliente'),
    p_partner_id,
    v_store_id,
    v_exchange_total,
    v_exchange_total - v_exchange_difference,
    v_exchange_total - v_exchange_difference,
    0,
    v_parent_order.delivery_type,
    v_parent_order.delivery_address,
    'exchange',
    NULL,
    CASE WHEN v_exchange_difference > 0 THEN 'pending' ELSE 'paid' END,
    'not_sent',
    'Troca',
    'Pedido gerado pela troca DVL-' || UPPER(SUBSTRING(p_request_id::TEXT FROM 1 FOR 6)),
    p_parent_order_id,
    p_request_id,
    jsonb_build_array(jsonb_build_object(
      'method', 'exchange',
      'label', 'Crédito de Troca (DVL-' || UPPER(SUBSTRING(p_request_id::TEXT FROM 1 FOR 6)) || ')',
      'amount', v_exchange_total - v_exchange_difference,
      'return_request_id', p_request_id
    )),
    FALSE,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_exchange_order_id;

  FOR v_exchange_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_exchange_items, '[]'::JSONB))
  LOOP
    INSERT INTO public.order_items (
      order_id,
      product_id,
      variant_id,
      product_name,
      product_price,
      quantity,
      subtotal,
      net_item_value
    )
    SELECT
      v_exchange_order_id,
      (v_exchange_item->>'product_id')::UUID,
      NULLIF(v_exchange_item->>'variant_id', '')::UUID,
      COALESCE(NULLIF(v_exchange_item->>'product_name', ''), (SELECT name FROM public.products WHERE id = (v_exchange_item->>'product_id')::UUID), 'Produto Troca'),
      COALESCE((v_exchange_item->>'unit_price')::NUMERIC, (v_exchange_item->>'price')::NUMERIC, 0),
      COALESCE((v_exchange_item->>'quantity')::INTEGER, 1),
      ROUND((COALESCE((v_exchange_item->>'unit_price')::NUMERIC, (v_exchange_item->>'price')::NUMERIC, 0) * COALESCE((v_exchange_item->>'quantity')::INTEGER, 1))::NUMERIC, 2),
      ROUND((COALESCE((v_exchange_item->>'unit_price')::NUMERIC, (v_exchange_item->>'price')::NUMERIC, 0) * COALESCE((v_exchange_item->>'quantity')::INTEGER, 1))::NUMERIC, 2);
  END LOOP;

  -- Baixa atômica de estoque para os produtos substitutos da troca
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'product_id', oi.product_id,
      'variant_id', oi.variant_id,
      'quantity', oi.quantity
    )),
    '[]'::JSONB
  )
  INTO v_stock_items
  FROM public.order_items oi
  WHERE oi.order_id = v_exchange_order_id
    AND oi.product_id IS NOT NULL
    AND oi.quantity > 0;

  IF jsonb_array_length(v_stock_items) > 0 THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.stock_movements sm WHERE sm.order_id = v_exchange_order_id
    ) THEN
      v_stock_movement := public.create_batch_stock_movement(
        p_partner_id := p_partner_id,
        p_movement_type := 'out',
        p_reason := 'Venda de Produtos',
        p_notes := 'Produtos de reposição - troca DVL-' || UPPER(SUBSTRING(p_request_id::TEXT FROM 1 FOR 6)),
        p_created_by := p_actor_user_id,
        p_items := v_stock_items,
        p_store_id := v_store_id,
        p_reference_name := 'Pedido #' || v_exchange_order_number,
        p_reference_type := 'order'
      );

      v_stock_movement_id := NULLIF(v_stock_movement->>'id', '')::UUID;
      IF v_stock_movement_id IS NOT NULL THEN
        UPDATE public.stock_movements
        SET order_id = v_exchange_order_id,
            reference_name = 'Pedido #' || v_exchange_order_number
        WHERE id = v_stock_movement_id;
      END IF;
    END IF;

    UPDATE public.orders
    SET inventory_deducted = TRUE
    WHERE id = v_exchange_order_id;
  END IF;

  RETURN v_exchange_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_exchange_order(UUID, UUID, UUID, UUID, JSONB, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_exchange_order(UUID, UUID, UUID, UUID, JSONB, UUID, UUID)
  TO service_role;

-- ─── Performance indexes for returns & exchanges ─────────────────────────────

CREATE INDEX IF NOT EXISTS idx_orders_exchange_return_request_id
  ON public.orders(exchange_return_request_id)
  WHERE exchange_return_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_exchange_parent_order_id
  ON public.orders(exchange_parent_order_id)
  WHERE exchange_parent_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_source_return_request_id
  ON public.stock_movements(source_return_request_id)
  WHERE source_return_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_return_requests_partner_store_created
  ON public.return_requests(partner_id, store_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
