-- ============================================================================
-- Rollback: Fase 10.7 - Restore f105 version of finalize_pos_sale
-- ============================================================================
-- ATENÇÃO: Este rollback restaura a versão REGRESSIVA que NÃO cria
-- transactions nem transaction_payments. Use apenas em caso de emergência.
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
  p_user_id UUID
);

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

DROP FUNCTION IF EXISTS public.finalize_pos_sale(
  p_partner_id UUID,
  p_order_id UUID,
  p_created_by UUID,
  p_reason TEXT,
  p_notes TEXT,
  p_items JSONB,
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
RETURNS TABLE(sale_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_draft RECORD;
  v_items JSONB;
  v_item JSONB;
  v_qty NUMERIC;
  v_up NUMERIC;
  v_subtotal NUMERIC := 0;
  v_discount NUMERIC;
  v_final_amount NUMERIC;
  v_final_amount_adjusted NUMERIC;
  v_shipping_fee NUMERIC;
  v_other_costs NUMERIC;
  v_product RECORD;
  v_variant RECORD;
  v_available NUMERIC;
  v_sale_id UUID;
  v_sale_number TEXT;
  v_stock_items JSONB := '[]'::jsonb;
  v_clamped_paid NUMERIC;
  v_payment_status TEXT;
  v_tx_id UUID;
  v_now TIMESTAMPTZ;
  v_entry JSONB;
  v_entry_amount NUMERIC;
  v_entry_pm_id UUID;
  v_breakdown_total NUMERIC := 0;
  v_is_cash BOOLEAN;
  v_movement_id UUID;
  v_cash_movement_id UUID;
  v_stock_movement_result JSON;
  v_stock_movement_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('finalize_pos_sale_' || p_pre_sale_id));

  v_now := NOW();

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

  v_items := v_draft.items;
  v_subtotal := COALESCE(v_draft.subtotal, 0);
  v_discount := COALESCE(v_draft.discount_amount, 0);
  v_final_amount := GREATEST(COALESCE(v_draft.total_amount, 0), 0);
  v_shipping_fee := COALESCE(v_draft.shipping_fee, 0);
  v_other_costs := COALESCE(v_draft.other_costs, 0);

  IF v_final_amount <= 0 THEN
    RAISE EXCEPTION 'Total da venda deve ser maior que zero.';
  END IF;

  v_final_amount_adjusted := v_final_amount + v_shipping_fee + v_other_costs;
  v_clamped_paid := GREATEST(COALESCE(p_paid_amount, 0), 0);
  v_payment_status := CASE
    WHEN v_clamped_paid >= v_final_amount_adjusted THEN 'paid'
    WHEN v_clamped_paid > 0 THEN 'partially_paid'
    ELSE 'pending'
  END;

  v_sale_number := public.generate_sale_number();

  INSERT INTO public.sales (
    partner_id, store_id, customer_id, pre_sale_id, total_amount, discount_amount,
    final_amount, paid_amount, payment_status, status, finance_account_id,
    cash_session_id, notes, finalized_by_user_id, sale_number
  ) VALUES (
    p_partner_id, p_store_id, v_draft.customer_id, v_draft.id, v_subtotal, v_discount,
    v_final_amount_adjusted, v_clamped_paid, v_payment_status, v_payment_status,
    p_finance_account_id, p_cash_session_id, COALESCE(v_draft.notes, ''), p_user_id,
    v_sale_number
  ) RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
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

  IF v_clamped_paid > 0 THEN
    INSERT INTO public.cash_movements (
      partner_id, store_id, cash_session_id, type, description,
      payment_method_id, amount, reference_id, created_by_user_id, created_at
    ) VALUES (
      p_partner_id, p_store_id, p_cash_session_id, 'sale',
      'Venda PDV ' || v_sale_number || ' - ' || COALESCE(NULLIF(p_payment_method, ''), 'PDV'),
      NULL, v_clamped_paid, v_sale_id, p_user_id, v_now
    ) RETURNING id INTO v_cash_movement_id;
  END IF;

  IF p_payment_breakdown IS NOT NULL AND jsonb_array_length(p_payment_breakdown) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payment_breakdown)
    LOOP
      v_entry_amount := GREATEST(COALESCE((v_item->>'amount')::numeric, 0), 0);
      v_entry_pm_id := (v_item->>'payment_method_id')::uuid;
      v_is_cash := v_entry_pm_id IS NULL OR EXISTS (
        SELECT 1 FROM public.payment_methods pm
        WHERE pm.id = v_entry_pm_id AND pm.partner_id = p_partner_id AND pm.type = 'cash'
      );
      IF v_entry_amount > 0 THEN
        INSERT INTO public.cash_movements (
          partner_id, store_id, cash_session_id, type, description,
          payment_method_id, amount, reference_id, created_by_user_id, created_at
        ) VALUES (
          p_partner_id, p_store_id, p_cash_session_id, 'sale',
          'Venda PDV ' || v_sale_number || ' - ' || COALESCE(NULLIF(p_payment_method, ''), 'PDV'),
          v_entry_pm_id, v_entry_amount, v_sale_id, p_user_id, v_now
        );
      END IF;
    END LOOP;
  END IF;

  UPDATE public.pre_sales
  SET status = 'completed', completed_sale_id = v_sale_id, updated_at = v_now
  WHERE id = p_pre_sale_id;

  RETURN QUERY SELECT v_sale_id;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
