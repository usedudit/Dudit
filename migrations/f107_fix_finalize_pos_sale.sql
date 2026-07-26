-- ============================================================================
-- Fase 10.7 — Fix finalize_pos_sale: restore transactions + transaction_payments
-- ============================================================================
-- REGRESSÃO: As migrations f103/f104/f105 removeram a criação de lançamentos
-- financeiros (transactions + transaction_payments) da função finalize_pos_sale.
-- Isto fez com que vendas PDV finalizadas não gerassem registros financeiros,
-- quebrando relatórios financeiros e conciliação bancária.
--
-- CORREÇÃO: Recria a função com:
--   1. Parsing completo do payment_breakdown (interestAmount, feeAmount,
--      fixedFeeAmount, discountAmount lidos DIRETAMENTE)
--   2. Criação de uma transaction (agregada) com interest/fee/discount separados
--   3. Criação de um transaction_payments por linha do breakdown
--   4. Criação de cash_movements para métodos em dinheiro
--   5. Store-aware stock movement (delega para create_batch_stock_movement)
--   6. Payment_status correto (paid/partially_paid/pending)
--   7. Preenchimento das colunas payment_method_interest/fee/fixed_fee na sales
--   8. RETURNS TABLE(sale_id UUID) para compatibilidade com PostgREST
-- ============================================================================

BEGIN;

-- ============================================================
-- 1. DROP ALL overloads de finalize_pos_sale
-- ============================================================
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

-- ============================================================
-- 2. CREATE finalize_pos_sale — 9-param com RETURNS TABLE
-- ============================================================
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
  v_cash_movement_id UUID;
  v_stock_movement_result JSON;
  v_stock_movement_id UUID;
  v_payment_line INT := 0;

  -- Aggregated totals from payment breakdown (read directly, not derived)
  v_interest_total NUMERIC := 0;
  v_fee_total NUMERIC := 0;
  v_fixed_fee_total NUMERIC := 0;
  v_discount_total NUMERIC := 0;
  v_original_amount_total NUMERIC := 0;
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

  -- ── Parse payment_breakdown: read individual amounts directly ────────────
  IF p_payment_breakdown IS NOT NULL AND jsonb_array_length(p_payment_breakdown) > 0 THEN
    SELECT COALESCE(SUM(GREATEST((e->>'amount')::numeric, 0)), 0)
      INTO v_breakdown_total
      FROM jsonb_array_elements(p_payment_breakdown) e;

    FOR v_entry IN SELECT * FROM jsonb_array_elements(p_payment_breakdown)
    LOOP
      DECLARE
        v_adj_type TEXT := COALESCE(v_entry->>'adjustmentType', 'none');
        v_received NUMERIC := ROUND(GREATEST(COALESCE((v_entry->>'amountReceived')::numeric, 0), 0), 2);
        v_interest_amt NUMERIC := ROUND(GREATEST(COALESCE((v_entry->>'interestAmount')::numeric, 0), 0), 2);
        v_fee_amt NUMERIC := ROUND(GREATEST(COALESCE((v_entry->>'feeAmount')::numeric, 0), 0), 2);
        v_fixed_fee_amt NUMERIC := ROUND(GREATEST(COALESCE((v_entry->>'fixedFeeAmount')::numeric, 0), 0), 2);
        v_discount_amt NUMERIC := 0;
      BEGIN
        IF v_adj_type = 'discount' THEN
          v_discount_amt := ROUND(GREATEST(COALESCE((v_entry->>'adjustmentAmount')::numeric, 0), 0), 2);
        END IF;

        v_interest_total := v_interest_total + v_interest_amt;
        v_fee_total := v_fee_total + v_fee_amt;
        v_fixed_fee_total := v_fixed_fee_total + v_fixed_fee_amt;
        v_discount_total := v_discount_total + v_discount_amt;
        v_original_amount_total := v_original_amount_total + v_received;
      END;
    END LOOP;
  END IF;

  IF v_breakdown_total > 0 THEN
    v_final_amount_adjusted := v_breakdown_total;
  ELSE
    v_original_amount_total := v_final_amount_adjusted;
  END IF;

  v_clamped_paid := LEAST(
    v_final_amount_adjusted,
    GREATEST(0, ROUND(
      CASE WHEN v_breakdown_total > 0 THEN v_breakdown_total ELSE COALESCE(p_paid_amount, 0) END
    , 2))
  );

  v_payment_status := CASE
    WHEN v_clamped_paid >= v_final_amount_adjusted - 0.01 THEN 'paid'
    WHEN v_clamped_paid > 0 THEN 'partially_paid'
    ELSE 'pending'
  END;

  v_sale_number := public.generate_sale_number();

  -- ── Insert sales record with financial breakdown columns ────────────────
  INSERT INTO public.sales (
    partner_id, store_id, customer_id, pre_sale_id, sale_number,
    total_amount, discount_amount, final_amount, paid_amount,
    payment_status, status, finance_account_id,
    cash_session_id, notes, finalized_by_user_id,
    payment_method_interest_amount, payment_method_fee_amount,
    payment_method_fixed_fee_amount
  ) VALUES (
    p_partner_id, p_store_id, v_draft.customer_id, v_draft.id, v_sale_number,
    v_subtotal, v_discount, v_final_amount_adjusted, v_clamped_paid,
    v_payment_status, v_payment_status,
    p_finance_account_id, p_cash_session_id, COALESCE(v_draft.notes, ''), p_user_id,
    NULLIF(v_interest_total, 0), NULLIF(v_fee_total, 0), NULLIF(v_fixed_fee_total, 0)
  ) RETURNING id INTO v_sale_id;

  -- ── Insert sale items ───────────────────────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    v_qty := COALESCE((v_item->>'quantity')::numeric, (v_item->>'qty')::numeric, 0);
    v_up := COALESCE((v_item->>'unit_price')::numeric, (v_item->>'price')::numeric, 0);

    INSERT INTO public.sale_items (
      sale_id, partner_id, store_id, product_id, variant_id,
      product_name, variant_name, unit_price, quantity, subtotal, total_price,
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

  -- ── Stock movement (delegates to create_batch_stock_movement) ────────────
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

  -- ── Create financial transaction (if paid) ──────────────────────────────
  IF v_clamped_paid > 0 THEN
    INSERT INTO public.transactions (
      partner_id, store_id, description, category,
      customer_id, contact_type,
      amount, due_date, payment_date, transaction_date,
      status, notes, payment_type,
      original_amount, interest_amount, fee_amount, discount_amount,
      transaction_type, origin, reference_note, account_id,
      payment_method_id, created_by_user_id
    ) VALUES (
      p_partner_id, p_store_id,
      v_sale_number, 'Vendas',
      v_draft.customer_id, 'customer',
      v_clamped_paid, NULL, v_now, v_now,
      'paid', NULL,
      COALESCE(p_payment_method, 'Não informado'),
      v_original_amount_total,
      NULLIF(v_interest_total, 0),
      NULLIF(v_fee_total + v_fixed_fee_total, 0),
      v_discount_total,
      'income', 'system', v_sale_id::text, p_finance_account_id,
      NULL, p_user_id
    ) RETURNING id INTO v_tx_id;

    -- ── Create transaction_payments (one per breakdown entry) ──────────────
    IF p_payment_breakdown IS NOT NULL AND jsonb_array_length(p_payment_breakdown) > 0 THEN
      v_payment_line := 0;
      FOR v_entry IN SELECT * FROM jsonb_array_elements(p_payment_breakdown)
      LOOP
        v_payment_line := v_payment_line + 1;
        v_entry_amount := ROUND(GREATEST((v_entry->>'amount')::numeric, 0), 2);
        IF v_entry_amount > 0 THEN
          v_entry_pm_id := (v_entry->>'paymentMethodId')::uuid;

          DECLARE
            v_entry_adj_type TEXT := COALESCE(v_entry->>'adjustmentType', 'none');
            v_entry_received NUMERIC := ROUND(GREATEST(COALESCE((v_entry->>'amountReceived')::numeric, 0), 0), 2);
            v_entry_interest NUMERIC := ROUND(GREATEST(COALESCE((v_entry->>'interestAmount')::numeric, 0), 0), 2);
            v_entry_fee NUMERIC := ROUND(GREATEST(COALESCE((v_entry->>'feeAmount')::numeric, 0), 0), 2);
            v_entry_fixed_fee NUMERIC := ROUND(GREATEST(COALESCE((v_entry->>'fixedFeeAmount')::numeric, 0), 0), 2);
            v_entry_discount NUMERIC := 0;
            v_entry_bearer TEXT := COALESCE(v_entry->>'feeBearer', 'merchant');
          BEGIN
            IF v_entry_adj_type = 'discount' THEN
              v_entry_discount := ROUND(GREATEST(COALESCE((v_entry->>'adjustmentAmount')::numeric, 0), 0), 2);
            END IF;

            INSERT INTO public.transaction_payments (
              partner_id, transaction_id, amount, base_amount,
              interest_amount, fee_amount, discount_amount, fee_bearer,
              payment_method_id,
              created_by_user_id, created_at, idempotency_key
            ) VALUES (
              p_partner_id, v_tx_id, v_entry_amount, v_entry_received,
              v_entry_interest, v_entry_fee + v_entry_fixed_fee, v_entry_discount, v_entry_bearer,
              v_entry_pm_id,
              p_user_id, v_now,
              p_partner_id::text || ':' || v_sale_id::text || ':line' || v_payment_line::text || ':' || COALESCE(v_entry_pm_id::text, 'none')
            );
          END;
        END IF;
      END LOOP;
    END IF;

    -- ── Create cash_movements per method (only cash methods) ──────────────
    IF p_payment_breakdown IS NOT NULL AND jsonb_array_length(p_payment_breakdown) > 0 THEN
      FOR v_entry IN SELECT * FROM jsonb_array_elements(p_payment_breakdown)
      LOOP
        v_entry_amount := ROUND(GREATEST((v_entry->>'amount')::numeric, 0), 2);
        IF v_entry_amount > 0 THEN
          v_entry_pm_id := (v_entry->>'paymentMethodId')::uuid;
          IF v_entry_pm_id IS NULL THEN
            v_is_cash := true;
          ELSE
            SELECT EXISTS (
              SELECT 1 FROM public.payment_methods pm
              WHERE pm.id = v_entry_pm_id
                AND pm.partner_id = p_partner_id
                AND pm.type = 'cash'
            ) INTO v_is_cash;
          END IF;

          IF v_is_cash THEN
            INSERT INTO public.cash_movements (
              partner_id, store_id, cash_session_id, type, description,
              payment_method_id, amount, reference_id, created_by_user_id, created_at
            ) VALUES (
              p_partner_id, p_store_id, p_cash_session_id, 'sale',
              'Venda PDV ' || v_sale_number || ' - PDV',
              v_entry_pm_id, ABS(v_entry_amount), v_sale_id, p_user_id, v_now
            );
          END IF;
        END IF;
      END LOOP;
    ELSE
      -- Fallback: single cash_movement for total paid
      INSERT INTO public.cash_movements (
        partner_id, store_id, cash_session_id, type, description,
        payment_method_id, amount, reference_id, created_by_user_id, created_at
      ) VALUES (
        p_partner_id, p_store_id, p_cash_session_id, 'sale',
        'Venda PDV ' || v_sale_number || ' - PDV',
        NULL, ABS(v_clamped_paid), v_sale_id, p_user_id, v_now
      );
    END IF;
  END IF;

  -- ── Update pre_sale status ─────────────────────────────────────────────
  UPDATE public.pre_sales
  SET status = 'completed', completed_sale_id = v_sale_id, updated_at = v_now
  WHERE id = p_pre_sale_id;

  RETURN QUERY SELECT v_sale_id;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
