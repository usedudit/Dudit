-- ============================================================================
-- Fase 10.9 - Fix create_batch_stock_movement: re-add stock_movement_items
-- insert + set order_id / reference_name in finalize_order_inventory
-- ============================================================================
-- REGRESSÃO: A migration 20260722 removeu o INSERT INTO stock_movement_items
-- dentro de create_batch_stock_movement, fazendo com que movimentos de estoque
-- perdessem o registro de quais itens foram movimentados.
--
-- Além disso, finalize_order_inventory nunca setava order_id e reference_name
-- na stock_movement criada, impedindo a exibição correta no ERP.
-- ============================================================================

BEGIN;

-- ============================================================
-- 1. Fix create_batch_stock_movement - re-add stock_movement_items insert
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
    v_items_count INT;
BEGIN
    v_items_count := COALESCE(jsonb_array_length(p_items), 0);

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
        v_product_id := NULLIF(v_item->>'product_id', '')::UUID;
        v_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
        v_qty := COALESCE((v_item->>'quantity')::INT, 0);

        IF v_product_id IS NULL OR v_qty <= 0 THEN
            CONTINUE;
        END IF;

        -- Variant
        IF v_variant_id IS NOT NULL THEN
            SELECT stock_quantity INTO v_previous_stock
            FROM public.product_variants
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

            UPDATE public.product_variants
            SET stock_quantity = v_new_stock, updated_at = NOW()
            WHERE id = v_variant_id;

        -- Product only
        ELSE
            SELECT stock_quantity INTO v_previous_stock
            FROM public.products
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

            UPDATE public.products
            SET stock_quantity = v_new_stock, updated_at = NOW()
            WHERE id = v_product_id;
        END IF;

        -- Insert stock_movement_items record for each item
        INSERT INTO public.stock_movement_items (
            movement_id, product_id, variant_id, quantity,
            previous_quantity, new_quantity, created_at
        ) VALUES (
            v_movement_id, v_product_id, v_variant_id,
            CASE WHEN p_movement_type = 'in' THEN v_qty ELSE -v_qty END,
            v_previous_stock, v_new_stock, NOW()
        );
    END LOOP;

    RETURN jsonb_build_object(
        'id', v_movement_id,
        'success', true,
        'items_count', v_items_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- ============================================================
-- 2. Fix finalize_order_inventory - set order_id + reference_name
-- ============================================================
CREATE OR REPLACE FUNCTION public.finalize_order_inventory(
    p_partner_id UUID,
    p_order_id UUID,
    p_created_by UUID DEFAULT NULL,
    p_reason TEXT DEFAULT 'Venda de Produtos',
    p_items JSONB DEFAULT '[]'::JSONB,
    p_store_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_item JSONB;
    v_product_id UUID;
    v_variant_id UUID;
    v_qty INTEGER;
    v_reserved INTEGER;
    v_allow_sell_without_stock BOOLEAN;
    v_movement JSON;
    v_movement_id UUID;
    v_order_number TEXT;
BEGIN
    IF COALESCE(jsonb_array_length(p_items), 0) = 0 THEN
        RETURN jsonb_build_object('success', true, 'items_count', 0);
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := NULLIF(v_item->>'product_id', '')::UUID;
        v_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
        v_qty := COALESCE((v_item->>'quantity')::INTEGER, 0);

        IF v_product_id IS NULL OR v_qty <= 0 THEN
            CONTINUE;
        END IF;

        IF v_variant_id IS NOT NULL THEN
            SELECT stock_reserved, COALESCE(allow_sell_without_stock, false)
            INTO v_reserved, v_allow_sell_without_stock
            FROM public.product_variants
            WHERE id = v_variant_id AND product_id = v_product_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Variante não encontrada para finalizar estoque: %', v_variant_id;
            END IF;

            IF NOT v_allow_sell_without_stock THEN
                IF COALESCE(v_reserved, 0) < v_qty THEN
                    RAISE EXCEPTION 'Reserva insuficiente para finalizar a variante %', v_variant_id;
                END IF;
            END IF;

            UPDATE public.product_variants
            SET stock_reserved = GREATEST(0, COALESCE(stock_reserved, 0) - v_qty), updated_at = NOW()
            WHERE id = v_variant_id;

        ELSE
            SELECT stock_reserved, COALESCE(allow_sell_without_stock, false)
            INTO v_reserved, v_allow_sell_without_stock
            FROM public.products
            WHERE id = v_product_id AND partner_id = p_partner_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Produto não encontrado para finalizar estoque: %', v_product_id;
            END IF;

            IF NOT v_allow_sell_without_stock THEN
                IF COALESCE(v_reserved, 0) < v_qty THEN
                    RAISE EXCEPTION 'Reserva insuficiente para finalizar o produto %', v_product_id;
                END IF;
            END IF;

            UPDATE public.products
            SET stock_reserved = GREATEST(0, COALESCE(stock_reserved, 0) - v_qty), updated_at = NOW()
            WHERE id = v_product_id;
        END IF;
    END LOOP;

    -- Create batch stock movement to record stock reduction
    v_movement := public.create_batch_stock_movement(
        p_partner_id := p_partner_id,
        p_movement_type := 'out',
        p_reason := p_reason,
        p_notes := NULL,
        p_created_by := p_created_by,
        p_items := p_items,
        p_store_id := p_store_id
    );

    v_movement_id := (v_movement->>'id')::UUID;

    -- Set order_id and reference_name on the stock movement
    SELECT order_number INTO v_order_number
    FROM public.orders
    WHERE id = p_order_id;

    UPDATE public.stock_movements
    SET
        order_id = p_order_id,
        reference_name = 'Pedido #' || COALESCE(v_order_number, p_order_id::TEXT)
    WHERE id = v_movement_id;

    RETURN jsonb_build_object('success', true, 'items_count', jsonb_array_length(p_items), 'movement_id', v_movement_id);
END;
$$;

-- ============================================================
-- 3. Fix createOrderStockMovement in app code - use order_number
--    (This is fixed in the TypeScript code separately)
-- ============================================================

COMMIT;

