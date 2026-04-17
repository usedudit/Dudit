-- =============================================================================
-- System Hardening Migration
-- Atomic RPCs, Idempotency Constraints, Performance Indexes
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Idempotency: prevent duplicate sale finalization from the same pre-sale
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_pre_sale_id_unique
  ON public.sales (pre_sale_id)
  WHERE pre_sale_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2) Idempotency: transaction_payments.idempotency_key
-- -----------------------------------------------------------------------------
ALTER TABLE public.transaction_payments
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transaction_payments_idempotency
  ON public.transaction_payments (partner_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3) Performance Indexes
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_transactions_reference_note
  ON public.transactions (partner_id, reference_note)
  WHERE reference_note IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_customer_id
  ON public.transactions (customer_id)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cash_movements_reference_id
  ON public.cash_movements (reference_id)
  WHERE reference_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_partner_situation
  ON public.orders (partner_id, situation);

CREATE INDEX IF NOT EXISTS idx_transaction_payments_transaction_id
  ON public.transaction_payments (transaction_id);

CREATE INDEX IF NOT EXISTS idx_sale_items_product_id
  ON public.sale_items (product_id)
  WHERE product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sale_items_variant_id
  ON public.sale_items (variant_id)
  WHERE variant_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4) Atomic RPC: apply_account_balance_delta
--    Replaces the read-modify-write pattern with FOR UPDATE locking.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_account_balance_delta(
  p_account_id UUID,
  p_partner_id UUID,
  p_delta NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current NUMERIC;
  v_new NUMERIC;
BEGIN
  IF p_delta = 0 THEN RETURN NULL; END IF;
  IF p_account_id IS NULL THEN RETURN NULL; END IF;

  SELECT current_balance INTO v_current
    FROM public.finance_accounts
   WHERE id = p_account_id
     AND partner_id = p_partner_id
   FOR UPDATE;

  IF NOT FOUND THEN RETURN NULL; END IF;

  v_current := COALESCE(v_current, 0);
  v_new := ROUND(v_current + p_delta, 2);

  UPDATE public.finance_accounts
     SET current_balance = v_new,
         updated_at = NOW()
   WHERE id = p_account_id
     AND partner_id = p_partner_id;

  RETURN v_new;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5) Atomic RPC: finalize_pos_sale
--    Wraps the entire POS finalize flow in a single transaction.
--    Uses SELECT ... FOR UPDATE on products/variants for stock safety.
--    Recalculates totals from items (never trusts frontend).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_pos_sale(
  p_partner_id UUID,
  p_pre_sale_id UUID,
  p_finance_account_id UUID,
  p_cash_session_id UUID,
  p_paid_amount NUMERIC,
  p_payment_method TEXT,
  p_payment_breakdown JSONB,  -- [{ "amount": N, "paymentMethodId": "..." }]
  p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_draft RECORD;
  v_items JSONB;
  v_item JSONB;
  v_item_arr JSONB[];
  v_subtotal NUMERIC := 0;
  v_discount NUMERIC;
  v_final_amount NUMERIC;
  v_product RECORD;
  v_variant RECORD;
  v_agg_key TEXT;
  v_agg_qty NUMERIC;
  v_available NUMERIC;
  v_has_variants BOOLEAN;
  v_sale_id UUID;
  v_sale_item RECORD;
  v_stock_items JSONB := '[]'::jsonb;
  v_clamped_paid NUMERIC;
  v_payment_status TEXT;
  v_tx_id UUID;
  v_now TIMESTAMPTZ;
  v_entry JSONB;
  v_entry_amount NUMERIC;
  v_entry_pm_id UUID;
  v_breakdown_total NUMERIC := 0;
BEGIN
  -- ── 0. Fetch and lock the draft ──────────────────────────────────────
  SELECT * INTO v_draft
    FROM public.pre_sales
   WHERE id = p_pre_sale_id
     AND partner_id = p_partner_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pré-venda não encontrada.';
  END IF;

  IF v_draft.status != 'draft' THEN
    RAISE EXCEPTION 'Esta pré-venda já foi finalizada.';
  END IF;

  -- Check idempotency: if a sale already exists for this pre-sale, return it
  SELECT id INTO v_sale_id
    FROM public.sales
   WHERE pre_sale_id = p_pre_sale_id
     AND partner_id = p_partner_id
   LIMIT 1;
  IF v_sale_id IS NOT NULL THEN
    RETURN v_sale_id;
  END IF;

  v_items := COALESCE(v_draft.items, '[]'::jsonb);
  IF jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Não é possível finalizar venda sem itens.';
  END IF;

  -- ── 1. Recalculate totals from items (NEVER trust frontend) ──────────
  v_subtotal := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    DECLARE
      v_qty NUMERIC;
      v_unit_price NUMERIC;
    BEGIN
      v_qty := COALESCE((v_item->>'quantity')::numeric, (v_item->>'qty')::numeric, 0);
      v_unit_price := COALESCE((v_item->>'unit_price')::numeric, (v_item->>'price')::numeric, 0);
      IF v_qty <= 0 THEN
        RAISE EXCEPTION 'Quantidade inválida para item "%".', COALESCE(v_item->>'name', 'desconhecido');
      END IF;
      IF v_unit_price < 0 THEN
        RAISE EXCEPTION 'Preço inválido para item "%".', COALESCE(v_item->>'name', 'desconhecido');
      END IF;
      v_subtotal := v_subtotal + ROUND(v_qty * v_unit_price, 2);
    END;
  END LOOP;

  v_discount := LEAST(COALESCE(v_draft.discount_amount, 0), v_subtotal);
  v_final_amount := GREATEST(ROUND(v_subtotal - v_discount, 2), 0);

  IF v_final_amount <= 0 THEN
    RAISE EXCEPTION 'A venda não pode ser finalizada com valor zerado.';
  END IF;

  -- Validate consistency with stored values (tolerance 0.01)
  IF ABS(v_subtotal - COALESCE(v_draft.subtotal, 0)) > 0.01 THEN
    RAISE EXCEPTION 'Subtotal inconsistente. Atualize a pré-venda antes de finalizar.';
  END IF;

  IF ABS(v_final_amount - COALESCE(v_draft.total_amount, 0)) > 0.01 THEN
    RAISE EXCEPTION 'Total inconsistente. Atualize a pré-venda antes de finalizar.';
  END IF;

  -- ── 2. Lock products/variants and validate stock ─────────────────────
  -- We aggregate quantities by product/variant first
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    DECLARE
      v_pid UUID;
      v_vid UUID;
      v_qty NUMERIC;
      v_name TEXT;
    BEGIN
      v_pid := (v_item->>'product_id')::uuid;
      IF v_pid IS NULL THEN v_pid := (v_item->>'productId')::uuid; END IF;
      IF v_pid IS NULL THEN CONTINUE; END IF;

      v_vid := (v_item->>'variant_id')::uuid;
      IF v_vid IS NULL THEN v_vid := (v_item->>'variantId')::uuid; END IF;

      v_qty := COALESCE((v_item->>'quantity')::numeric, (v_item->>'qty')::numeric, 0);
      v_name := COALESCE(v_item->>'name', 'item');

      -- Lock product row
      SELECT id, stock_available, allow_sell_without_stock,
             (SELECT count(*) FROM product_variants pv WHERE pv.product_id = p.id) as variant_count
        INTO v_product
        FROM products p
       WHERE p.id = v_pid
         AND p.partner_id = p_partner_id
       FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado para "%".', v_name;
      END IF;

      IF v_product.variant_count > 0 AND v_vid IS NULL THEN
        RAISE EXCEPTION 'Variação não informada para o item %', v_name;
      END IF;

      IF NOT COALESCE(v_product.allow_sell_without_stock, false) THEN
        IF v_vid IS NOT NULL THEN
          -- Lock variant row
          SELECT pv.id, pv.stock_available, pv.product_id
            INTO v_variant
            FROM product_variants pv
           WHERE pv.id = v_vid
           FOR UPDATE;

          IF NOT FOUND THEN
            RAISE EXCEPTION 'A variação do item % não existe mais.', v_name;
          END IF;

          IF v_variant.product_id != v_pid THEN
            RAISE EXCEPTION 'Combinação inválida de variação para o item %', v_name;
          END IF;

          v_available := COALESCE(v_variant.stock_available, 0);
        ELSE
          v_available := COALESCE(v_product.stock_available, 0);
        END IF;

        IF v_qty > v_available THEN
          RAISE EXCEPTION 'Estoque insuficiente para o item %', v_name;
        END IF;
      END IF;
    END;
  END LOOP;

  -- ── 3. Compute payment status ────────────────────────────────────────
  -- Sum payment breakdown
  IF p_payment_breakdown IS NOT NULL AND jsonb_array_length(p_payment_breakdown) > 0 THEN
    SELECT COALESCE(SUM(GREATEST((e->>'amount')::numeric, 0)), 0)
      INTO v_breakdown_total
      FROM jsonb_array_elements(p_payment_breakdown) e;
  END IF;

  v_clamped_paid := LEAST(
    v_final_amount,
    GREATEST(0, ROUND(
      CASE WHEN v_breakdown_total > 0 THEN v_breakdown_total ELSE COALESCE(p_paid_amount, 0) END
    , 2))
  );

  IF v_clamped_paid >= v_final_amount - 0.01 THEN
    v_payment_status := 'paid';
  ELSIF v_clamped_paid > 0 THEN
    v_payment_status := 'partially_paid';
  ELSE
    v_payment_status := 'pending';
  END IF;

  v_now := NOW();

  -- ── 4. Create sale ───────────────────────────────────────────────────
  INSERT INTO public.sales (
    partner_id, customer_id, pre_sale_id, total_amount, discount_amount,
    final_amount, paid_amount, payment_status, status, finance_account_id,
    cash_session_id, notes, finalized_by_user_id
  ) VALUES (
    p_partner_id, v_draft.customer_id, v_draft.id, v_subtotal, v_discount,
    v_final_amount, v_clamped_paid, v_payment_status, v_payment_status,
    p_finance_account_id, p_cash_session_id, v_draft.notes, p_user_id
  ) RETURNING id INTO v_sale_id;

  -- ── 5. Create sale items ─────────────────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    DECLARE
      v_qty NUMERIC;
      v_up NUMERIC;
    BEGIN
      v_qty := COALESCE((v_item->>'quantity')::numeric, (v_item->>'qty')::numeric, 0);
      v_up := COALESCE((v_item->>'unit_price')::numeric, (v_item->>'price')::numeric, 0);

      INSERT INTO public.sale_items (
        sale_id, partner_id, product_id, variant_id, product_name, variant_name,
        unit_price, quantity, subtotal, total_price
      ) VALUES (
        v_sale_id, p_partner_id,
        COALESCE((v_item->>'product_id')::uuid, (v_item->>'productId')::uuid),
        COALESCE((v_item->>'variant_id')::uuid, (v_item->>'variantId')::uuid),
        COALESCE(v_item->>'name', 'Item'),
        COALESCE(v_item->>'variant_name', v_item->>'variantName'),
        v_up, v_qty,
        ROUND(v_qty * v_up, 2),
        ROUND(v_qty * v_up, 2)
      );

      -- Collect stock items for batch movement
      IF COALESCE((v_item->>'product_id')::uuid, (v_item->>'productId')::uuid) IS NOT NULL THEN
        v_stock_items := v_stock_items || jsonb_build_object(
          'product_id', COALESCE(v_item->>'product_id', v_item->>'productId'),
          'variant_id', COALESCE(v_item->>'variant_id', v_item->>'variantId'),
          'quantity', v_qty
        );
      END IF;
    END;
  END LOOP;

  -- ── 6. Stock movement ───────────────────────────────────────────────
  IF jsonb_array_length(v_stock_items) > 0 THEN
    PERFORM public.create_batch_stock_movement(
      p_partner_id := p_partner_id,
      p_movement_type := 'out',
      p_reason := 'Venda PDV',
      p_notes := 'Baixa de estoque da venda ' || v_sale_id::text,
      p_created_by := p_user_id,
      p_items := v_stock_items
    );
  END IF;

  -- ── 7. Financial transaction ─────────────────────────────────────────
  IF v_clamped_paid > 0 THEN
    INSERT INTO public.transactions (
      partner_id, description, category, customer_id, contact_type,
      amount, due_date, payment_date, transaction_date,
      status, notes, payment_type, original_amount, interest_amount, fee_amount,
      transaction_type, origin, reference_note, account_id,
      payment_method_id, created_by_user_id
    ) VALUES (
      p_partner_id,
      'PDV ' || UPPER(LEFT(v_sale_id::text, 8)),
      'Vendas',
      v_draft.customer_id,
      'customer',
      v_clamped_paid, NULL, v_now, v_now,
      'paid',
      'Recebimento gerado pela finalização do PDV.',
      COALESCE(p_payment_method, 'Não informado'),
      v_clamped_paid, NULL, 0,
      'income', 'system', v_sale_id::text, p_finance_account_id,
      NULL, p_user_id
    ) RETURNING id INTO v_tx_id;

    -- Insert transaction payments from breakdown
    IF p_payment_breakdown IS NOT NULL AND jsonb_array_length(p_payment_breakdown) > 0 THEN
      FOR v_entry IN SELECT * FROM jsonb_array_elements(p_payment_breakdown)
      LOOP
        v_entry_amount := ROUND(GREATEST((v_entry->>'amount')::numeric, 0), 2);
        IF v_entry_amount > 0 THEN
          v_entry_pm_id := (v_entry->>'paymentMethodId')::uuid;
          INSERT INTO public.transaction_payments (
            partner_id, transaction_id, amount, payment_method_id,
            created_by_user_id, idempotency_key
          ) VALUES (
            p_partner_id, v_tx_id, v_entry_amount, v_entry_pm_id,
            p_user_id,
            p_partner_id::text || ':' || v_sale_id::text || ':' || COALESCE(v_entry_pm_id::text, 'none')
          );
        END IF;
      END LOOP;
    END IF;

    -- Cash movements
    IF p_payment_breakdown IS NOT NULL AND jsonb_array_length(p_payment_breakdown) > 0 THEN
      FOR v_entry IN SELECT * FROM jsonb_array_elements(p_payment_breakdown)
      LOOP
        v_entry_amount := ROUND(GREATEST((v_entry->>'amount')::numeric, 0), 2);
        IF v_entry_amount > 0 THEN
          INSERT INTO public.cash_movements (
            partner_id, cash_session_id, type, description,
            payment_method_id, amount, reference_id
          ) VALUES (
            p_partner_id, p_cash_session_id, 'sale',
            'Venda PDV ' || UPPER(LEFT(v_sale_id::text, 8)) || ' - PDV',
            (v_entry->>'paymentMethodId')::uuid,
            ABS(v_entry_amount),
            v_sale_id
          );
        END IF;
      END LOOP;
    ELSE
      INSERT INTO public.cash_movements (
        partner_id, cash_session_id, type, description,
        payment_method_id, amount, reference_id
      ) VALUES (
        p_partner_id, p_cash_session_id, 'sale',
        'Venda PDV ' || UPPER(LEFT(v_sale_id::text, 8)) || ' - PDV',
        NULL, ABS(v_clamped_paid), v_sale_id
      );
    END IF;
  END IF;

  -- ── 8. Mark pre-sale as completed ────────────────────────────────────
  UPDATE public.pre_sales
     SET status = 'completed',
         completed_sale_id = v_sale_id,
         updated_at = NOW()
   WHERE id = p_pre_sale_id
     AND partner_id = p_partner_id
     AND status = 'draft';

  RETURN v_sale_id;
END;
$$;
