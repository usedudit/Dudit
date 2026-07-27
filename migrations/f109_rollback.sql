-- Rollback: restore create_batch_stock_movement and finalize_order_inventory
-- to the versions from 20260722_fix_reserve_order_inventory_store_stock.sql

BEGIN;

-- Revert finalize_order_inventory to 20260722 version (no order_id/reference_name update)
-- This is the version from 20260722_fix_reserve_order_inventory_store_stock.sql
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

    RETURN jsonb_build_object('success', true, 'items_count', jsonb_array_length(p_items), 'movement_id', v_movement_id);
END;
$$;

COMMIT;

