-- ============================================================================
-- PDV: desconto por linha em `sale_items` (base para DRE)
-- 1. Adiciona `discount_amount` em sale_items.
-- 2. Normaliza `original_price` (preço nominal) das linhas antigas.
-- 3. Atualiza finalize_pos_sale para persistir preço nominal + desconto da linha.
--
-- O fluxo atual do PDV finaliza via `orders`/`order_items` (createERPOrderAction);
-- esta migration mantém a tabela legada `sales`/`sale_items` consistente para
-- DRE, exportações e qualquer chamada remanescente da RPC.
-- ============================================================================

BEGIN;

-- ── 1. Coluna de desconto por linha ─────────────────────────────────────────
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sale_items_discount_amount_check'
      AND conrelid = 'public.sale_items'::regclass
  ) THEN
    ALTER TABLE public.sale_items
      ADD CONSTRAINT sale_items_discount_amount_check
      CHECK (discount_amount >= 0);
  END IF;
END
$$;

COMMENT ON COLUMN public.sale_items.discount_amount IS
  'Desconto total da linha ((preço nominal - preço cobrado) × quantidade).';

-- ── 2. Backfill: linhas antigas ficaram com original_price = 0 ──────────────
-- Sem o preço nominal histórico não é possível recuperar o desconto por linha;
-- igualamos o nominal ao preço cobrado (mesmo critério usado no DRE) para não
-- derrubar a receita bruta. Brindes mantêm o preço de catálogo.
UPDATE public.sale_items
SET original_price = unit_price
WHERE is_gift = false
  AND (original_price IS NULL OR original_price = 0);

-- Onde o preço nominal já existia, recupera o desconto da linha.
UPDATE public.sale_items
SET discount_amount = GREATEST(0, ROUND((original_price - unit_price) * quantity, 2))
WHERE is_gift = false
  AND original_price > unit_price;


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
    v_nominal NUMERIC;
    v_item_discount NUMERIC;
    v_subtotal NUMERIC := 0;
    v_discount NUMERIC;
    v_final_amount NUMERIC;
    v_final_amount_adjusted NUMERIC;
    v_shipping_fee NUMERIC;
    v_other_costs NUMERIC;
    v_discount_total NUMERIC := 0;
    v_clamped_paid NUMERIC;
    v_sale_number TEXT;
    v_sale_id UUID;
    v_payment_status TEXT;
    v_entry JSONB;
    v_interest_total NUMERIC := 0;
    v_fee_total NUMERIC := 0;
    v_fixed_fee_total NUMERIC := 0;
    v_breakdown_total NUMERIC := 0;
    v_original_amount_total NUMERIC := 0;
    v_stock_items JSONB := '[]'::JSONB;
    v_stock_movement_result JSON;
    v_stock_movement_id UUID;
    v_tx_id UUID;
    v_entry_amount NUMERIC;
    v_entry_pm_id UUID;
    v_payment_line INT := 0;
    v_now TIMESTAMPTZ := now();
BEGIN
    -- Validate cash session belongs to partner and is open
    IF p_cash_session_id IS NOT NULL THEN
        PERFORM 1
        FROM public.cash_sessions cs
        WHERE cs.id = p_cash_session_id
          AND cs.partner_id = p_partner_id
          AND cs.status = 'open'
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Caixa inválido ou já fechado.';
        END IF;
    END IF;

    -- Fetch the pre-sale / draft
    SELECT * INTO v_draft
    FROM public.pre_sales
    WHERE id = p_pre_sale_id AND partner_id = p_partner_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pré-venda não encontrada';
    END IF;

    -- Load items from pre_sale
    SELECT COALESCE(v_draft.items, '[]'::JSONB) INTO v_items;

    -- ── Process items ────────────────────────────────────────────────────────
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
        v_qty := COALESCE((v_item->>'quantity')::numeric, (v_item->>'qty')::numeric, 0);
        IF v_qty <= 0 THEN
            CONTINUE;
        END IF;

        v_up := COALESCE((v_item->>'unit_price')::numeric, (v_item->>'price')::numeric, 0);
        v_discount := COALESCE((v_item->>'discount')::numeric, 0);

        v_subtotal := v_subtotal + (v_up * v_qty);

        IF (v_item->>'isPromotional')::bool IS NOT TRUE AND (v_item->>'is_promotional')::bool IS NOT TRUE THEN
            v_discount_total := v_discount_total + (v_discount * v_qty);
        END IF;
    END LOOP;

    v_final_amount := GREATEST(v_subtotal - v_discount_total, 0);
    v_shipping_fee := COALESCE(v_draft.shipping_fee, 0);
    v_other_costs := COALESCE(v_draft.other_costs, 0);
    v_final_amount := v_final_amount + v_shipping_fee + v_other_costs;

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
        v_subtotal, COALESCE(v_draft.discount_amount, 0), v_final_amount_adjusted, v_clamped_paid,
        v_payment_status, v_payment_status,
        p_finance_account_id, p_cash_session_id, COALESCE(v_draft.notes, ''), p_user_id,
        COALESCE(NULLIF(v_interest_total, 0), 0),
        COALESCE(NULLIF(v_fee_total, 0), 0),
        COALESCE(NULLIF(v_fixed_fee_total, 0), 0)
    ) RETURNING id INTO v_sale_id;

    -- ── Insert sale items ───────────────────────────────────────────────────
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
        v_qty := COALESCE((v_item->>'quantity')::numeric, (v_item->>'qty')::numeric, 0);
        IF v_qty <= 0 THEN
            CONTINUE;
        END IF;

        v_up := COALESCE((v_item->>'unit_price')::numeric, (v_item->>'price')::numeric, 0);

        -- Preço nominal da linha: lista > preço original (brinde) > cobrado + desconto.
        v_nominal := COALESCE(
            NULLIF((v_item->>'list_unit_price')::numeric, 0),
            NULLIF((v_item->>'listUnitPrice')::numeric, 0),
            NULLIF((v_item->>'original_price')::numeric, 0),
            NULLIF((v_item->>'originalPrice')::numeric, 0),
            v_up + COALESCE((v_item->>'discount')::numeric, 0),
            v_up
        );

        -- Brinde: sem desconto comercial (receita já é zero).
        v_item_discount := CASE
            WHEN COALESCE((v_item->>'is_gift')::bool, (v_item->>'isGift')::bool, false)
                THEN 0
            ELSE GREATEST(0, ROUND((v_nominal - v_up) * v_qty, 2))
        END;

        INSERT INTO public.sale_items (
            sale_id, partner_id, store_id, product_id, variant_id,
            product_name, variant_name, unit_price, quantity, subtotal, total_price,
            is_gift, original_price, discount_amount, is_promotional, promotion_id
        ) VALUES (
            v_sale_id, p_partner_id, p_store_id,
            NULLIF(v_item->>'productId', '')::UUID,
            NULLIF(v_item->>'variantId', '')::UUID,
            COALESCE(v_item->>'customName', v_item->>'custom_name', 'Item'),
            v_item->>'variant_name',
            v_up, v_qty,
            (v_up - COALESCE((v_item->>'discount')::numeric, 0)) * v_qty,
            v_up * v_qty,
            COALESCE((v_item->>'is_gift')::bool, (v_item->>'isGift')::bool, false),
            v_nominal,
            v_item_discount,
            COALESCE((v_item->>'is_promotional')::bool, (v_item->>'isPromotional')::bool, false),
            NULLIF(v_item->>'promotionId', '')::UUID
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
        FROM jsonb_array_elements(v_items) v_item2
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

    -- ── Create financial transactions ─────────────────────────────────────────
    IF v_clamped_paid > 0 THEN
        INSERT INTO public.transactions (
            partner_id, store_id,
            description, category,
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
            NULLIF(v_discount_total, 0),
            'income', 'system', v_sale_id::text, p_finance_account_id,
            NULL, p_user_id
        ) RETURNING id INTO v_tx_id;

        -- Create transaction_payments (one per breakdown entry)
        IF p_payment_breakdown IS NOT NULL AND jsonb_array_length(p_payment_breakdown) > 0 THEN
            v_payment_line := 0;
            FOR v_entry IN SELECT * FROM jsonb_array_elements(p_payment_breakdown)
            LOOP
                v_payment_line := v_payment_line + 1;
                v_entry_amount := ROUND(GREATEST(COALESCE((v_entry->>'amount')::numeric, (v_entry->>'effectiveAmount')::numeric, 0), 0), 2);
                IF v_entry_amount > 0 THEN
                    v_entry_pm_id := NULLIF(v_entry->>'paymentMethodId', '')::uuid;
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

        -- ── Create cash_movements for all payment methods in active cash session ──────────
        IF p_cash_session_id IS NOT NULL THEN
            IF p_payment_breakdown IS NOT NULL AND jsonb_array_length(p_payment_breakdown) > 0 THEN
                FOR v_entry IN SELECT * FROM jsonb_array_elements(p_payment_breakdown)
                LOOP
                    v_entry_amount := ROUND(GREATEST(COALESCE((v_entry->>'amount')::numeric, (v_entry->>'effectiveAmount')::numeric, 0), 0), 2);
                    IF v_entry_amount > 0 THEN
                        v_entry_pm_id := NULLIF(v_entry->>'paymentMethodId', '')::uuid;
                        INSERT INTO public.cash_movements (
                            partner_id, store_id, cash_session_id, type, description,
                            payment_method_id, amount, reference_id, created_by_user_id, created_at
                        ) VALUES (
                            p_partner_id, p_store_id, p_cash_session_id, 'sale',
                            'Venda PDV #' || v_sale_number || ' - ' || COALESCE(v_entry->>'method', p_payment_method, 'PDV'),
                            v_entry_pm_id, ABS(v_entry_amount), v_sale_id, p_user_id, v_now
                        ) ON CONFLICT DO NOTHING;
                    END IF;
                END LOOP;
            ELSE
                INSERT INTO public.cash_movements (
                    partner_id, store_id, cash_session_id, type, description,
                    payment_method_id, amount, reference_id, created_by_user_id, created_at
                ) VALUES (
                    p_partner_id, p_store_id, p_cash_session_id, 'sale',
                    'Venda PDV #' || v_sale_number || ' - ' || COALESCE(p_payment_method, 'PDV'),
                    NULL, ABS(v_clamped_paid), v_sale_id, p_user_id, v_now
                ) ON CONFLICT DO NOTHING;
            END IF;
        END IF;
    END IF;

    -- ── Update pre_sale status to completed ─────────────────────────────────
    UPDATE public.pre_sales
    SET status = 'completed', completed_sale_id = v_sale_id, updated_at = v_now
    WHERE id = p_pre_sale_id;

    RETURN QUERY SELECT v_sale_id;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';