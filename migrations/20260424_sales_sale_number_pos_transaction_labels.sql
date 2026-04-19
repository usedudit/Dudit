-- PDV: public sale_number (DDT######, unique vs orders), align transactions + backfill.

CREATE OR REPLACE FUNCTION public.generate_sale_number()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  new_number text;
  exists_orders boolean;
  exists_sales boolean;
BEGIN
  LOOP
    new_number := 'DDT' || lpad(floor(random() * 999999)::text, 6, '0');
    SELECT EXISTS(SELECT 1 FROM public.orders WHERE order_number = new_number) INTO exists_orders;
    SELECT EXISTS(SELECT 1 FROM public.sales WHERE sale_number = new_number) INTO exists_sales;
    EXIT WHEN NOT exists_orders AND NOT exists_sales;
  END LOOP;
  RETURN new_number;
END;
$$;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS sale_number text;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.sales WHERE sale_number IS NULL ORDER BY created_at
  LOOP
    UPDATE public.sales SET sale_number = public.generate_sale_number() WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.sales ALTER COLUMN sale_number SET NOT NULL;

DROP INDEX IF EXISTS public.idx_sales_sale_number_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_sale_number_unique ON public.sales (sale_number);

-- Fix existing finance rows that still point at PDV UUID-style descriptions
UPDATE public.transactions t
SET description = s.sale_number
FROM public.sales s
WHERE t.partner_id = s.partner_id
  AND t.reference_note = s.id::text
  AND t.category = 'Vendas'
  AND t.transaction_type = 'income'
  AND t.description IS DISTINCT FROM s.sale_number;

-- Remove textos automáticos antigos de recebimento PDV (observação não é necessária)
UPDATE public.transactions
SET notes = NULL
WHERE category = 'Vendas'
  AND transaction_type = 'income'
  AND origin = 'system'
  AND reference_note ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND notes IS NOT NULL
  AND (
    notes ILIKE '%pdv%'
    OR notes ILIKE '%finalização%'
    OR notes ILIKE '%finalizacao%'
    OR notes ILIKE '%venda de produtos%'
  );

CREATE OR REPLACE FUNCTION public.finalize_pos_sale(
  p_partner_id UUID,
  p_pre_sale_id UUID,
  p_finance_account_id UUID,
  p_cash_session_id UUID,
  p_paid_amount NUMERIC,
  p_payment_method TEXT,
  p_payment_breakdown JSONB,
  p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_is_cash BOOLEAN;
  v_sale_number TEXT;
  v_stock_movement_result JSON;
  v_stock_movement_id UUID;
BEGIN
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

  IF ABS(v_subtotal - COALESCE(v_draft.subtotal, 0)) > 0.01 THEN
    RAISE EXCEPTION 'Subtotal inconsistente. Atualize a pré-venda antes de finalizar.';
  END IF;

  IF ABS(v_final_amount - COALESCE(v_draft.total_amount, 0)) > 0.01 THEN
    RAISE EXCEPTION 'Total inconsistente. Atualize a pré-venda antes de finalizar.';
  END IF;

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

  PERFORM 1
    FROM public.cash_sessions cs
   WHERE cs.id = p_cash_session_id
     AND cs.partner_id = p_partner_id
     AND cs.status = 'open'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixa inválido ou já fechado.';
  END IF;

  v_sale_number := public.generate_sale_number();

  INSERT INTO public.sales (
    partner_id, customer_id, pre_sale_id, total_amount, discount_amount,
    final_amount, paid_amount, payment_status, status, finance_account_id,
    cash_session_id, notes, finalized_by_user_id, sale_number
  ) VALUES (
    p_partner_id, v_draft.customer_id, v_draft.id, v_subtotal, v_discount,
    v_final_amount, v_clamped_paid, v_payment_status, v_payment_status,
    p_finance_account_id, p_cash_session_id, v_draft.notes, p_user_id,
    v_sale_number
  ) RETURNING id INTO v_sale_id;

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

      IF COALESCE((v_item->>'product_id')::uuid, (v_item->>'productId')::uuid) IS NOT NULL THEN
        v_stock_items := v_stock_items || jsonb_build_object(
          'product_id', COALESCE(v_item->>'product_id', v_item->>'productId'),
          'variant_id', COALESCE(v_item->>'variant_id', v_item->>'variantId'),
          'quantity', v_qty
        );
      END IF;
    END;
  END LOOP;

  IF jsonb_array_length(v_stock_items) > 0 THEN
    v_stock_movement_result := public.create_batch_stock_movement(
      p_partner_id := p_partner_id,
      p_movement_type := 'out',
      p_reason := 'Venda de Produtos',
      p_notes := NULLIF(BTRIM(COALESCE(v_draft.notes, '')), ''),
      p_created_by := p_user_id,
      p_items := v_stock_items
    );
    v_stock_movement_id := NULLIF((v_stock_movement_result->>'id'), '')::uuid;
    IF v_stock_movement_id IS NOT NULL THEN
      UPDATE public.stock_movements
      SET reference_name = 'Pedido #' || v_sale_number
      WHERE id = v_stock_movement_id;
    END IF;
  END IF;

  IF v_clamped_paid > 0 THEN
    INSERT INTO public.transactions (
      partner_id, description, category, customer_id, contact_type,
      amount, due_date, payment_date, transaction_date,
      status, notes, payment_type, original_amount, interest_amount, fee_amount,
      transaction_type, origin, reference_note, account_id,
      payment_method_id, created_by_user_id
    ) VALUES (
      p_partner_id,
      v_sale_number,
      'Vendas',
      v_draft.customer_id,
      'customer',
      v_clamped_paid, NULL, v_now, v_now,
      'paid',
      NULL,
      COALESCE(p_payment_method, 'Não informado'),
      v_clamped_paid, NULL, 0,
      'income', 'system', v_sale_id::text, p_finance_account_id,
      NULL, p_user_id
    ) RETURNING id INTO v_tx_id;

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
              partner_id, cash_session_id, type, description,
              payment_method_id, amount, reference_id,
              created_by_user_id
            ) VALUES (
              p_partner_id, p_cash_session_id, 'sale',
              'Venda PDV ' || v_sale_number || ' - PDV',
              v_entry_pm_id,
              ABS(v_entry_amount),
              v_sale_id,
              p_user_id
            );
          END IF;
        END IF;
      END LOOP;
    ELSE
      INSERT INTO public.cash_movements (
        partner_id, cash_session_id, type, description,
        payment_method_id, amount, reference_id,
        created_by_user_id
      ) VALUES (
        p_partner_id, p_cash_session_id, 'sale',
        'Venda PDV ' || v_sale_number || ' - PDV',
        NULL, ABS(v_clamped_paid), v_sale_id,
        p_user_id
      );
    END IF;
  END IF;

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
