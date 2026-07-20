-- ============================================================================
-- Fase 10.2 — PDV usa mesmo fluxo de estoque que venda manual
-- ============================================================================
-- Remove TODO inline stock validation from finalize_pos_sale.
-- Stock deduction happens ONLY via create_batch_stock_movement,
-- identical to manual order flow (finalize_order_inventory → create_batch_stock_movement).
--
-- Also DROP first to force PostgreSQL to recompile and clear any cached plan.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.finalize_pos_sale(
  p_partner_id UUID,
  p_pre_sale_id UUID,
  p_finance_account_id UUID,
  p_cash_session_id UUID,
  p_paid_amount NUMERIC,
  p_payment_method TEXT,
  p_payment_breakdown JSONB,
  p_user_id UUID,
  p_store_id UUID
);

CREATE OR REPLACE FUNCTION public.finalize_pos_sale(
  p_partner_id UUID,
  p_pre_sale_id UUID,
  p_finance_account_id UUID,
  p_cash_session_id UUID,
  p_paid_amount NUMERIC,
  p_payment_method TEXT,
  p_payment_breakdown JSONB,
  p_user_id UUID,
  p_store_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_draft RECORD;
  v_item JSONB;
  v_qty NUMERIC;
  v_up NUMERIC;
  v_sale_id UUID;
  v_sale_number INT;
  v_clamped_total NUMERIC;
  v_clamped_paid NUMERIC;
  v_breakdown_total NUMERIC;
  v_stock_items JSONB := '[]'::JSONB;
  v_stock_movement_result JSON;
  v_stock_movement_id UUID;
  v_cash_movement_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('finalize_pos_sale_' || p_pre_sale_id));

  SELECT * INTO v_draft
  FROM public.pre_sales
  WHERE id = p_pre_sale_id AND partner_id = p_partner_id AND status = 'draft'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pré-venda não encontrada ou já finalizada.';
  END IF;

  IF v_draft.items IS NULL OR jsonb_array_length(v_draft.items) = 0 THEN
    RAISE EXCEPTION 'Nenhum item na pré-venda.';
  END IF;

  v_clamped_total := GREATEST(COALESCE(v_draft.total_amount, 0), 0);
  IF v_clamped_total <= 0 THEN
    RAISE EXCEPTION 'Total da venda deve ser maior que zero.';
  END IF;

  v_clamped_paid := GREATEST(COALESCE(p_paid_amount, 0), 0);

  SELECT COALESCE(MAX(sale_number), 0) + 1 INTO v_sale_number
  FROM public.sales
  WHERE partner_id = p_partner_id;

  INSERT INTO public.sales (
    partner_id, store_id, pre_sale_id, customer_id, sale_number,
    subtotal, discount_amount, total_amount, shipping_fee, other_costs,
    payment_method, paid_amount, change_amount, status,
    items, created_by, created_at, updated_at,
    coupon_id, coupon_code, coupon_discount_amount, notes
  ) VALUES (
    p_partner_id, p_store_id, p_pre_sale_id, v_draft.customer_id, v_sale_number,
    COALESCE(v_draft.subtotal, 0), COALESCE(v_draft.discount_amount, 0), v_clamped_total,
    COALESCE(v_draft.shipping_fee, 0), COALESCE(v_draft.other_costs, 0),
    p_payment_method, v_clamped_paid,
    GREATEST(0, v_clamped_paid - v_clamped_total), 'paid',
    v_draft.items, p_user_id, NOW(), NOW(),
    v_draft.coupon_id, v_draft.coupon_code, v_draft.coupon_discount_amount,
    COALESCE(v_draft.notes, '')
  ) RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_draft.items)
  LOOP
    v_qty := COALESCE((v_item->>'quantity')::numeric, (v_item->>'qty')::numeric, 0);
    v_up := COALESCE((v_item->>'unit_price')::numeric, (v_item->>'price')::numeric, 0);

    INSERT INTO public.sale_items (
      sale_id, partner_id, store_id, product_id, variant_id, product_name, variant_name,
      unit_price, quantity, subtotal, total_price,
      is_gift, original_price, is_promotional, promotion_id
    ) VALUES (
      v_sale_id, p_partner_id, p_store_id,
      COALESCE((v_item->>'product_id')::uuid, (v_item->>'productId')::uuid),
      COALESCE((v_item->>'variant_id')::uuid, (v_item->>'variantId')::uuid),
      COALESCE(v_item->>'name', 'Item'),
      COALESCE(v_item->>'variant_name', v_item->>'variantName'),
      v_up, v_qty,
      ROUND(v_qty * v_up, 2),
      ROUND(v_qty * v_up, 2),
      COALESCE((v_item->>'is_gift')::boolean, false),
      (v_item->>'original_price')::numeric,
      COALESCE((v_item->>'is_promotional')::boolean, false),
      (v_item->>'promotion_id')::uuid
    );

    IF COALESCE((v_item->>'product_id')::uuid, (v_item->>'productId')::uuid) IS NOT NULL THEN
      v_stock_items := v_stock_items || jsonb_build_object(
        'product_id', COALESCE(v_item->>'product_id', v_item->>'productId'),
        'variant_id', COALESCE(v_item->>'variant_id', v_item->>'variantId'),
        'quantity', v_qty
      );
    END IF;
  END LOOP;

  IF jsonb_array_length(v_stock_items) > 0 THEN
    v_stock_movement_result := public.create_batch_stock_movement(
      p_partner_id := p_partner_id,
      p_movement_type := 'out',
      p_reason := 'Venda de Produtos',
      p_notes := NULLIF(BTRIM(COALESCE(v_draft.notes, '')), ''),
      p_created_by := p_user_id,
      p_items := v_stock_items,
      p_store_id := p_store_id
    );
    v_stock_movement_id := NULLIF((v_stock_movement_result->>'id'), '')::uuid;
    IF v_stock_movement_id IS NOT NULL THEN
      UPDATE public.stock_movements
      SET reference_name = 'Pedido #' || v_sale_number
      WHERE id = v_stock_movement_id;
    END IF;
  END IF;

  UPDATE public.pre_sales
  SET status = 'finalized', updated_at = NOW()
  WHERE id = p_pre_sale_id;

  IF v_clamped_paid > 0 THEN
    INSERT INTO public.cash_movements (
      partner_id, store_id, cash_session_id, type, description,
      payment_method_id, amount, reference_type, reference_id, created_by_user_id, created_at
    ) VALUES (
      p_partner_id, p_store_id, p_cash_session_id, 'sale',
      'Venda PDV #' || v_sale_number,
      NULL, v_clamped_paid, 'sale', v_sale_id, p_user_id, NOW()
    ) RETURNING id INTO v_cash_movement_id;
  END IF;

  IF p_payment_breakdown IS NOT NULL AND jsonb_array_length(p_payment_breakdown) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payment_breakdown)
    LOOP
      INSERT INTO public.cash_movements (
        partner_id, store_id, cash_session_id, type, description,
        payment_method_id, amount, reference_type, reference_id, created_by_user_id, created_at
      ) VALUES (
        p_partner_id, p_store_id, p_cash_session_id, 'sale',
        'Venda PDV #' || v_sale_number,
        (v_item->>'payment_method_id')::uuid,
        GREATEST((v_item->>'amount')::numeric, 0),
        'sale', v_sale_id, p_user_id, NOW()
      );
    END LOOP;
  END IF;

  UPDATE public.pre_sales
  SET sale_id = v_sale_id, updated_at = NOW()
  WHERE id = p_pre_sale_id;

  RETURN v_sale_id;
END;
$$;

COMMIT;

-- Force PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
