-- ============================================================================
-- Migration: Fix store-aware RPCs (finalize_pos_sale + create_batch_stock_movement)
-- ============================================================================
-- PROBLEMA: As migrations 20260426, 20260611, 20260703, 20260715 sobrescreveram
-- finalize_pos_sale SEM os parâmetros store-aware (p_store_id, 4 branches de
-- validação de estoque via store_product_variants/store_products). Isso causa
-- regressão crítica: vendas PDV em lojas com override de estoque usam o estoque
-- base em vez do estoque da loja.
--
-- Também corrige create_batch_stock_movement Branch 1 & 3: quando
-- override_stock_quantity é NULL (usar estoque base), o código usava 0 como
-- fallback em vez do stock_quantity da tabela base.
-- ============================================================================

BEGIN;

-- ============================================================
-- 1. Fix create_batch_stock_movement - Branch 1 & 3 fallback
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_batch_stock_movement(
    p_partner_id UUID,
    p_movement_type TEXT,
    p_reason TEXT,
    p_notes TEXT,
    p_created_by UUID DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::JSONB,
    p_store_id UUID DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
    v_movement_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_variant_id UUID;
    v_qty INT;
    v_previous_stock INT;
    v_new_stock INT;
    v_total_quantity INT := 0;
    v_result JSON;
    v_items_count INT;
    v_store_product_id UUID;
    v_store_override_qty INT;
BEGIN
    v_items_count := jsonb_array_length(p_items);

    IF v_items_count = 0 THEN
        RAISE EXCEPTION 'Nenhum item fornecido';
    END IF;

    INSERT INTO public.stock_movements (
        partner_id, movement_type, reason, notes, created_by, store_id, created_at
    ) VALUES (
        p_partner_id, p_movement_type, p_reason, p_notes, p_created_by, p_store_id, NOW()
    )
    RETURNING id INTO v_movement_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
        v_qty := (v_item->>'quantity')::INT;

        IF v_qty <= 0 THEN
            RAISE EXCEPTION 'Quantidade deve ser maior que zero para cada item';
        END IF;

        v_store_product_id := NULL;

        -- Branch 1: Variant + Store → store_product_variants
        IF v_variant_id IS NOT NULL AND p_store_id IS NOT NULL THEN
            SELECT spv.id, spv.override_stock_quantity
            INTO v_store_product_id, v_store_override_qty
            FROM public.store_product_variants spv
            WHERE spv.variant_id = v_variant_id AND spv.store_id = p_store_id;

            IF v_store_product_id IS NOT NULL THEN
                -- FIXED: fallback para product_variants.stock_quantity quando override é NULL
                v_previous_stock := COALESCE(v_store_override_qty, (SELECT COALESCE(stock_quantity, 0) FROM public.product_variants WHERE id = v_variant_id));
                IF p_movement_type = 'in' THEN
                    v_new_stock := v_previous_stock + v_qty;
                ELSE
                    v_new_stock := GREATEST(0, v_previous_stock - v_qty);
                END IF;
                UPDATE public.store_product_variants
                SET override_stock_quantity = v_new_stock, updated_at = NOW()
                WHERE id = v_store_product_id;
            ELSE
                -- Fallback: no store override → use base variant stock
                SELECT stock_quantity INTO v_previous_stock
                FROM product_variants
                WHERE id = v_variant_id AND product_id = v_product_id
                FOR UPDATE;
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Variante não encontrada: %', v_variant_id;
                END IF;
                IF p_movement_type = 'in' THEN
                    v_new_stock := v_previous_stock + v_qty;
                ELSE
                    v_new_stock := GREATEST(0, v_previous_stock - v_qty);
                END IF;
                UPDATE product_variants
                SET stock_quantity = v_new_stock, updated_at = NOW()
                WHERE id = v_variant_id;
            END IF;

        -- Branch 2: Variant only → product_variants
        ELSIF v_variant_id IS NOT NULL THEN
            SELECT stock_quantity INTO v_previous_stock
            FROM product_variants
            WHERE id = v_variant_id AND product_id = v_product_id
            FOR UPDATE;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Variante não encontrada: %', v_variant_id;
            END IF;
            IF p_movement_type = 'in' THEN
                v_new_stock := v_previous_stock + v_qty;
            ELSE
                v_new_stock := GREATEST(0, v_previous_stock - v_qty);
            END IF;
            UPDATE product_variants
            SET stock_quantity = v_new_stock, updated_at = NOW()
            WHERE id = v_variant_id;

        -- Branch 3: Store only (no variant) → store_products
        ELSIF p_store_id IS NOT NULL THEN
            SELECT sp.id, sp.override_stock_quantity
            INTO v_store_product_id, v_store_override_qty
            FROM public.store_products sp
            WHERE sp.product_id = v_product_id AND sp.store_id = p_store_id;

            IF v_store_product_id IS NOT NULL THEN
                -- FIXED: fallback para products.stock_quantity quando override é NULL
                v_previous_stock := COALESCE(v_store_override_qty, (SELECT COALESCE(stock_quantity, 0) FROM public.products WHERE id = v_product_id));
                IF p_movement_type = 'in' THEN
                    v_new_stock := v_previous_stock + v_qty;
                ELSE
                    v_new_stock := GREATEST(0, v_previous_stock - v_qty);
                END IF;
                UPDATE public.store_products
                SET override_stock_quantity = v_new_stock, updated_at = NOW()
                WHERE id = v_store_product_id;
            ELSE
                SELECT stock_quantity INTO v_previous_stock
                FROM products
                WHERE id = v_product_id AND partner_id = p_partner_id
                FOR UPDATE;
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Produto não encontrado: %', v_product_id;
                END IF;
                IF p_movement_type = 'in' THEN
                    v_new_stock := v_previous_stock + v_qty;
                ELSE
                    v_new_stock := GREATEST(0, v_previous_stock - v_qty);
                END IF;
                UPDATE products
                SET stock_quantity = v_new_stock, updated_at = NOW()
                WHERE id = v_product_id;
            END IF;

        -- Branch 4: Neither → products
        ELSE
            SELECT stock_quantity INTO v_previous_stock
            FROM products
            WHERE id = v_product_id AND partner_id = p_partner_id
            FOR UPDATE;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Produto não encontrado: %', v_product_id;
            END IF;
            IF p_movement_type = 'in' THEN
                v_new_stock := v_previous_stock + v_qty;
            ELSE
                v_new_stock := GREATEST(0, v_previous_stock - v_qty);
            END IF;
            UPDATE products
            SET stock_quantity = v_new_stock, updated_at = NOW()
            WHERE id = v_product_id;
        END IF;

        INSERT INTO public.stock_movement_items (
            movement_id, product_id, variant_id, quantity,
            previous_quantity, new_quantity, store_product_id, created_at
        ) VALUES (
            v_movement_id,
            v_product_id,
            v_variant_id,
            CASE WHEN p_movement_type = 'in' THEN v_qty ELSE -v_qty END,
            v_previous_stock,
            v_new_stock,
            v_store_product_id,
            NOW()
        );

        v_total_quantity := v_total_quantity + v_qty;
    END LOOP;

    SELECT json_build_object(
        'id', v_movement_id,
        'items_count', v_items_count,
        'total_quantity', v_total_quantity
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. Fix finalize_pos_sale - merge store-aware (f101) + fee/interest (20260715)
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
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_draft RECORD;
  v_items JSONB;
  v_item JSONB;
  v_subtotal NUMERIC := 0;
  v_discount NUMERIC;
  v_final_amount NUMERIC;
  v_shipping_fee NUMERIC;
  v_other_costs NUMERIC;
  v_product RECORD;
  v_variant RECORD;
  v_available NUMERIC;
  v_sale_id UUID;
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
  v_payment_line INT := 0;

  -- Individual adjustment totals (read from JSONB directly)
  v_interest_total NUMERIC := 0;
  v_fee_total NUMERIC := 0;
  v_fixed_fee_total NUMERIC := 0;
  v_discount_total NUMERIC := 0;
  v_original_amount_total NUMERIC := 0;
  v_final_amount_adjusted NUMERIC := 0;

  -- Store-aware stock check variables
  v_store_product_id UUID;
  v_store_override_qty INT;
  v_store_reserved INT;
  v_spv_stock INT;
  v_allow_sell_without_stock BOOLEAN;
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
  v_shipping_fee := GREATEST(COALESCE(v_draft.shipping_fee, 0), 0);
  v_other_costs := GREATEST(COALESCE(v_draft.other_costs, 0), 0);
  v_final_amount := GREATEST(ROUND(v_subtotal - v_discount + v_shipping_fee + v_other_costs, 2), 0);

  IF v_final_amount <= 0 THEN
    RAISE EXCEPTION 'A venda não pode ser finalizada com valor zerado.';
  END IF;

  IF ABS(v_subtotal - COALESCE(v_draft.subtotal, 0)) > 0.01 THEN
    RAISE EXCEPTION 'Subtotal inconsistente. Atualize a pré-venda antes de finalizar.';
  END IF;

  IF ABS(v_final_amount - COALESCE(v_draft.total_amount, 0)) > 0.01 THEN
    RAISE EXCEPTION 'Total inconsistente. Atualize a pré-venda antes de finalizar.';
  END IF;

  -- Validate stock: store-aware for both products and variants
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

      IF v_vid IS NOT NULL AND p_store_id IS NOT NULL THEN
        -- Branch 1: Variant + Store → store_product_variants
        SELECT spv.id,
               COALESCE(spv.override_stock_quantity, pv.stock_quantity) as effective_stock,
               spv.stock_reserved,
               COALESCE(p.allow_sell_without_stock, false) as allow_sell_without_stock
          INTO v_store_product_id, v_spv_stock, v_store_reserved, v_allow_sell_without_stock
          FROM public.store_product_variants spv
          JOIN public.product_variants pv ON pv.id = spv.variant_id
          JOIN public.products p ON p.id = pv.product_id
         WHERE spv.variant_id = v_vid
           AND spv.store_id = p_store_id
           AND p.partner_id = p_partner_id
           FOR UPDATE OF spv;

        IF NOT FOUND THEN
          -- Fallback: check base variant (no store override)
          SELECT COALESCE(p.allow_sell_without_stock, false)
            INTO v_allow_sell_without_stock
            FROM products p
           WHERE p.id = v_pid
             AND p.partner_id = p_partner_id
             FOR UPDATE;

          IF NOT FOUND THEN
            RAISE EXCEPTION 'Produto não encontrado para "%".', v_name;
          END IF;

          IF NOT COALESCE(v_allow_sell_without_stock, false) THEN
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
            IF v_qty > v_available THEN
              RAISE EXCEPTION 'Estoque insuficiente para o item %', v_name;
            END IF;
          END IF;
        ELSE
          IF NOT COALESCE(v_allow_sell_without_stock, false) THEN
            v_available := GREATEST(0, COALESCE(v_spv_stock, 0) - COALESCE(v_store_reserved, 0));
            IF v_qty > v_available THEN
              RAISE EXCEPTION 'Estoque insuficiente na loja para o item %', v_name;
            END IF;
          END IF;
        END IF;

      ELSIF v_vid IS NOT NULL THEN
        -- Branch 2: Variant only → product_variants (original logic)
        SELECT p.id, p.stock_available, p.allow_sell_without_stock,
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
          IF v_qty > v_available THEN
            RAISE EXCEPTION 'Estoque insuficiente para o item %', v_name;
          END IF;
        END IF;

      ELSIF p_store_id IS NOT NULL THEN
        -- Branch 3: Store only → store_products
        SELECT sp.id, sp.override_stock_quantity, sp.stock_reserved,
               COALESCE(p.allow_sell_without_stock, false) as allow_sell_without_stock
          INTO v_store_product_id, v_store_override_qty, v_store_reserved, v_allow_sell_without_stock
          FROM public.store_products sp
          JOIN public.products p ON p.id = sp.product_id
         WHERE sp.product_id = v_pid
           AND sp.store_id = p_store_id
           FOR UPDATE OF sp;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Produto "%" não está vinculado a esta loja.', v_name;
        END IF;

        IF NOT COALESCE(v_allow_sell_without_stock, false) THEN
          v_available := GREATEST(0, COALESCE(v_store_override_qty, 0) - COALESCE(v_store_reserved, 0));
          IF v_qty > v_available THEN
            RAISE EXCEPTION 'Estoque insuficiente na loja para o item %', v_name;
          END IF;
        END IF;

      ELSE
        -- Branch 4: Neither → products
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

        IF NOT COALESCE(v_product.allow_sell_without_stock, false) THEN
          v_available := COALESCE(v_product.stock_available, 0);
          IF v_qty > v_available THEN
            RAISE EXCEPTION 'Estoque insuficiente para o item %', v_name;
          END IF;
        END IF;
      END IF;
    END;
  END LOOP;

  -- Parse JSONB breakdown: read individual amounts directly
  IF p_payment_breakdown IS NOT NULL AND jsonb_array_length(p_payment_breakdown) > 0 THEN
    SELECT COALESCE(SUM(GREATEST((e->>'amount')::numeric, 0)), 0)
      INTO v_breakdown_total
      FROM jsonb_array_elements(p_payment_breakdown) e;

    FOR v_entry IN SELECT * FROM jsonb_array_elements(p_payment_breakdown)
    LOOP
      DECLARE
        v_adj_type TEXT := COALESCE(v_entry->>'adjustmentType', 'none');
        v_received NUMERIC := ROUND(GREATEST((v_entry->>'amountReceived')::numeric, 0), 2);
        v_interest_amt NUMERIC := ROUND(GREATEST(COALESCE((v_entry->>'interestAmount')::numeric, 0), 0), 2);
        v_fee_amt NUMERIC := ROUND(GREATEST(COALESCE((v_entry->>'feeAmount')::numeric, 0), 0), 2);
        v_fixed_fee_amt NUMERIC := ROUND(GREATEST(COALESCE((v_entry->>'fixedFeeAmount')::numeric, 0), 0), 2);
        v_discount_amt NUMERIC := 0;
      BEGIN
        IF v_adj_type = 'discount' THEN
          v_discount_amt := ROUND(GREATEST((v_entry->>'adjustmentAmount')::numeric, 0), 2);
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
    v_final_amount_adjusted := v_final_amount;
    v_original_amount_total := v_final_amount;
  END IF;

  v_clamped_paid := LEAST(
    v_final_amount_adjusted,
    GREATEST(0, ROUND(
      CASE WHEN v_breakdown_total > 0 THEN v_breakdown_total ELSE COALESCE(p_paid_amount, 0) END
    , 2))
  );

  IF v_clamped_paid >= v_final_amount_adjusted - 0.01 THEN
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
    partner_id, store_id, customer_id, pre_sale_id, total_amount, discount_amount,
    final_amount, paid_amount, payment_status, status, finance_account_id,
    cash_session_id, notes, finalized_by_user_id, sale_number
  ) VALUES (
    p_partner_id, p_store_id, v_draft.customer_id, v_draft.id, v_subtotal, v_discount,
    v_final_amount_adjusted, v_clamped_paid, v_payment_status, v_payment_status,
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
    END;
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
    INSERT INTO public.transactions (
      partner_id, store_id, description, category, customer_id, contact_type,
      amount, due_date, payment_date, transaction_date,
      status, notes, payment_type, original_amount, interest_amount, fee_amount,
      discount_amount,
      transaction_type, origin, reference_note, account_id,
      payment_method_id, created_by_user_id
    ) VALUES (
      p_partner_id, p_store_id,
      v_sale_number,
      'Vendas',
      v_draft.customer_id,
      'customer',
      v_clamped_paid, NULL, v_now, v_now,
      'paid',
      NULL,
      COALESCE(p_payment_method, 'Não informado'),
      v_original_amount_total,
      NULLIF(v_interest_total, 0),
      NULLIF(v_fee_total + v_fixed_fee_total, 0),
      v_discount_total,
      'income', 'system', v_sale_id::text, p_finance_account_id,
      NULL, p_user_id
    ) RETURNING id INTO v_tx_id;

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
            v_entry_received NUMERIC := ROUND(GREATEST((v_entry->>'amountReceived')::numeric, 0), 2);
            v_entry_interest NUMERIC := ROUND(GREATEST(COALESCE((v_entry->>'interestAmount')::numeric, 0), 0), 2);
            v_entry_fee NUMERIC := ROUND(GREATEST(COALESCE((v_entry->>'feeAmount')::numeric, 0), 0), 2);
            v_entry_fixed_fee NUMERIC := ROUND(GREATEST(COALESCE((v_entry->>'fixedFeeAmount')::numeric, 0), 0), 2);
            v_entry_discount NUMERIC := 0;
            v_entry_bearer TEXT := COALESCE(v_entry->>'feeBearer', 'merchant');
          BEGIN
            IF v_entry_adj_type = 'discount' THEN
              v_entry_discount := ROUND(GREATEST((v_entry->>'adjustmentAmount')::numeric, 0), 2);
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
              payment_method_id, amount, reference_id,
              created_by_user_id
            ) VALUES (
              p_partner_id, p_store_id, p_cash_session_id, 'sale',
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
        partner_id, store_id, cash_session_id, type, description,
        payment_method_id, amount, reference_id,
        created_by_user_id
      ) VALUES (
        p_partner_id, p_store_id, p_cash_session_id, 'sale',
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

COMMIT;
