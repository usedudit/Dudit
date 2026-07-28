-- ============================================================================
-- Fase 10.10 — Corrige NULLIF nas colunas NOT NULL de sales (finalize_pos_sale)
--              Apenas isso — lógica de estoque vai no TypeScript (orders.ts).
-- ============================================================================
-- Problema: finalize_pos_sale usa NULLIF(v_fee_total, 0) no INSERT INTO sales,
-- mas as colunas payment_method_fee_amount/interest_amount/fixed_fee_amount
-- foram criadas como NOT NULL (f106). Quando o total é 0, NULLIF retorna NULL
-- e o INSERT viola a constraint.
--
-- A única alteração neste arquivo é trocar NULLIF(v, 0) por
-- COALESCE(NULLIF(v, 0), 0) na linha do INSERT. O resto do corpo da função é
-- idêntico ao da f107.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.finalize_pos_sale(
    p_partner_id UUID,
    p_store_id UUID,
    p_pre_sale_id UUID,
    p_items JSONB,
    p_payment_breakdown JSONB DEFAULT NULL,
    p_paid_amount NUMERIC DEFAULT 0,
    p_finance_account_id UUID DEFAULT NULL,
    p_cash_session_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT '',
    p_user_id UUID DEFAULT NULL,
    p_order_id UUID DEFAULT NULL,
    p_discount_amount NUMERIC DEFAULT 0
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_draft RECORD;
    v_item JSONB;
    v_qty NUMERIC;
    v_base_price NUMERIC;
    v_discount NUMERIC;
    v_subtotal NUMERIC := 0;
    v_subtotal_promo NUMERIC := 0;
    v_discount_total NUMERIC := 0;
    v_final_amount NUMERIC := 0;
    v_final_amount_adjusted NUMERIC := 0;
    v_original_amount_total NUMERIC;
    v_clamped_paid NUMERIC;
    v_sale_number TEXT;
    v_payment_status TEXT;
    v_payment_method_description TEXT;
    v_entry JSONB;
    v_sale_id UUID;
    v_interest_total NUMERIC := 0;
    v_fee_total NUMERIC := 0;
    v_fixed_fee_total NUMERIC := 0;
    v_breakdown_total NUMERIC := 0;
    v_stock_items JSONB := '[]'::JSONB;
    v_stock_item JSONB;
    v_stock_movement_result JSON;
    v_stock_movement_id UUID;
    v_fulfillment_count INT := 0;
    v_service_count INT := 0;
    v_credit_sale_id UUID;
    v_installment JSONB;
    v_installment_count INT;
    v_grace_days INT;
    v_first_payment_date TIMESTAMPTZ;
    v_due_date TIMESTAMPTZ;
BEGIN
    -- Fetch the pre-sale / draft
    SELECT * INTO v_draft
    FROM public.pre_sales
    WHERE id = p_pre_sale_id AND partner_id = p_partner_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Pré-venda não encontrada');
    END IF;

    -- ── Process items ────────────────────────────────────────────────────────
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_qty := COALESCE((v_item->>'quantity')::numeric, (v_item->>'qty')::numeric, 0);
        IF v_qty <= 0 THEN
            CONTINUE;
        END IF;

        v_base_price := COALESCE((v_item->>'unitPrice')::numeric, (v_item->>'unit_price')::numeric, 0);
        v_discount := COALESCE((v_item->>'discount')::numeric, 0);

        v_subtotal := v_subtotal + (v_base_price * v_qty);

        IF (v_item->>'isPromotional')::bool IS TRUE OR (v_item->>'is_promotional')::bool IS TRUE THEN
            v_subtotal_promo := v_subtotal_promo + ((v_base_price - v_discount) * v_qty);
        ELSE
            v_subtotal := v_subtotal + ((v_base_price - v_discount) * v_qty);
        END IF;

        v_discount_total := v_discount_total + (v_discount * v_qty);

        IF (v_item->>'lineType' IN ('product', 'simple')) OR (v_item->>'line_type' IN ('product', 'simple')) OR (v_item->>'productId') IS NOT NULL OR (v_item->>'product_id') IS NOT NULL THEN
            v_fulfillment_count := v_fulfillment_count + 1;
        END IF;

        IF (v_item->>'lineType') = 'service' OR (v_item->>'line_type') = 'service' OR (v_item->>'serviceId') IS NOT NULL OR (v_item->>'service_id') IS NOT NULL THEN
            v_service_count := v_service_count + 1;
        END IF;
    END LOOP;

    v_final_amount := GREATEST(v_subtotal - v_discount_total, 0);

    v_final_amount_adjusted := v_final_amount;

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
        -- FIX: COALESCE(NULLIF(v, 0), 0) — NULLIF retorna NULL quando = 0, mas
        -- a coluna é NOT NULL (f106). COALESCE converte de volta pra 0.
        COALESCE(NULLIF(v_interest_total, 0), 0),
        COALESCE(NULLIF(v_fee_total, 0), 0),
        COALESCE(NULLIF(v_fixed_fee_total, 0), 0)
    ) RETURNING id INTO v_sale_id;

    -- ── Insert sale items ───────────────────────────────────────────────────
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_qty := COALESCE((v_item->>'quantity')::numeric, (v_item->>'qty')::numeric, 0);
        IF v_qty <= 0 THEN
            CONTINUE;
        END IF;

        v_base_price := COALESCE((v_item->>'unitPrice')::numeric, (v_item->>'unit_price')::numeric, 0);
        v_discount := COALESCE((v_item->>'discount')::numeric, 0);

        INSERT INTO public.sale_items (
            sale_id, product_id, variant_id, product_name,
            quantity, unit_price, total_price, discount_amount,
            sort_order, line_type
        ) VALUES (
            v_sale_id,
            NULLIF(v_item->>'productId', '')::UUID,
            NULLIF(v_item->>'variantId', '')::UUID,
            COALESCE(v_item->>'customName', v_item->>'custom_name', 'Item'),
            v_qty,
            v_base_price,
            (v_base_price - v_discount) * v_qty,
            v_discount,
            COALESCE((v_item->>'sortOrder')::INT, (v_item->>'sort_order')::INT, 1),
            COALESCE(v_item->>'lineType', v_item->>'line_type', 'product')
        );
    END LOOP;

    -- ── Build stock items (products only, not services) for movement ─────────
    v_stock_items := (
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'product_id', COALESCE(v_item2->>'productId', v_item2->>'product_id'),
                'variant_id', COALESCE(NULLIF(v_item2->>'variantId', ''), NULLIF(v_item2->>'variant_id', '')),
                'quantity', GREATEST(COALESCE((v_item2->>'quantity')::INT, (v_item2->>'qty')::INT, 0), 0)
            )
        ), '[]'::JSONB)
        FROM jsonb_array_elements(p_items) v_item2
        WHERE (
            (v_item2->>'lineType' IN ('product', 'simple') OR v_item2->>'line_type' IN ('product', 'simple'))
            OR (v_item2->>'productId') IS NOT NULL OR (v_item2->>'product_id') IS NOT NULL
        )
        AND (v_item2->>'serviceId') IS NULL AND (v_item2->>'service_id') IS NULL
        AND (v_item2->>'lineType') IS DISTINCT FROM 'service' AND (v_item2->>'line_type') IS DISTINCT FROM 'service'
    );

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

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'sale_number', v_sale_number,
        'paid_amount', v_clamped_paid,
        'payment_status', v_payment_status,
        'final_amount', v_final_amount_adjusted
    );
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
