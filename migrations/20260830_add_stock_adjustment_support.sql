-- ============================================================================
-- Migration: Add Stock Adjustment Support to create_batch_stock_movement
--
-- Supports p_movement_type = 'adjustment':
-- When p_movement_type = 'adjustment', the item quantity is interpreted as
-- the new desired stock (target stock >= 0). The delta is calculated as
-- (v_new_stock - v_previous_stock), and stored in stock_movement_items.
-- ============================================================================

-- Ensure constraint allows 'adjustment' (idempotent check)
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_movement_type_check 
CHECK (movement_type IN ('sale', 'return', 'adjustment', 'purchase', 'damage', 'loss', 'in', 'out'));

CREATE OR REPLACE FUNCTION public.create_batch_stock_movement(
    p_partner_id UUID,
    p_movement_type TEXT,
    p_reason TEXT,
    p_notes TEXT,
    p_created_by UUID DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::JSONB,
    p_store_id UUID DEFAULT NULL,
    p_reference_name TEXT DEFAULT NULL,
    p_reference_type TEXT DEFAULT NULL
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
    v_delta INT;
BEGIN
    v_items_count := COALESCE(jsonb_array_length(p_items), 0);

    IF v_items_count = 0 THEN
        RAISE EXCEPTION 'Nenhum item fornecido';
    END IF;

    INSERT INTO public.stock_movements (
        partner_id, movement_type, reason, notes, reference_name, reference_type, created_by, store_id, created_at
    ) VALUES (
        p_partner_id, p_movement_type, p_reason, p_notes, p_reference_name, p_reference_type, p_created_by, p_store_id, NOW()
    )
    RETURNING id INTO v_movement_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := NULLIF(v_item->>'product_id', '')::UUID;
        v_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
        v_qty := COALESCE((v_item->>'quantity')::INT, 0);

        IF v_product_id IS NULL THEN
            CONTINUE;
        END IF;

        -- In and Out require quantity > 0. Adjustment allows quantity >= 0 (e.g. zeroing stock).
        IF p_movement_type != 'adjustment' AND v_qty <= 0 THEN
            CONTINUE;
        END IF;
        IF p_movement_type = 'adjustment' AND v_qty < 0 THEN
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
                v_delta := v_qty;
            ELSIF p_movement_type = 'adjustment' THEN
                v_new_stock := GREATEST(0, v_qty);
                v_delta := v_new_stock - v_previous_stock;
            ELSE
                v_new_stock := GREATEST(0, v_previous_stock - v_qty);
                v_delta := -v_qty;
            END IF;

            UPDATE public.product_variants
            SET stock_quantity = v_new_stock, updated_at = NOW()
            WHERE id = v_variant_id;

            INSERT INTO public.stock_movement_items (
                movement_id, product_id, variant_id, quantity, previous_quantity, new_quantity, created_at
            ) VALUES (
                v_movement_id, v_product_id, v_variant_id,
                v_delta,
                v_previous_stock, v_new_stock, NOW()
            );

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
                v_delta := v_qty;
            ELSIF p_movement_type = 'adjustment' THEN
                v_new_stock := GREATEST(0, v_qty);
                v_delta := v_new_stock - v_previous_stock;
            ELSE
                v_new_stock := GREATEST(0, v_previous_stock - v_qty);
                v_delta := -v_qty;
            END IF;

            UPDATE public.products
            SET stock_quantity = v_new_stock, updated_at = NOW()
            WHERE id = v_product_id;

            INSERT INTO public.stock_movement_items (
                movement_id, product_id, variant_id, quantity, previous_quantity, new_quantity, created_at
            ) VALUES (
                v_movement_id, v_product_id, NULL,
                v_delta,
                v_previous_stock, v_new_stock, NOW()
            );
        END IF;
    END LOOP;

    RETURN json_build_object('id', v_movement_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.create_batch_stock_movement(UUID, TEXT, TEXT, TEXT, UUID, JSONB, UUID, TEXT, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
