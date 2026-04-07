-- ============================================================================
-- MIGRATION: Migrate Stock Movements to Items and Drop Legacy Columns
-- ============================================================================

-- 1. Migrate existing single-item stock movements to the new items table
-- Only migrate rows that have a product_id (legacy rows)
INSERT INTO public.stock_movement_items (
    movement_id,
    product_id,
    variant_id,
    quantity,
    previous_quantity,
    new_quantity,
    created_at
)
SELECT 
    id,
    product_id,
    variant_id,
    quantity,
    COALESCE(previous_quantity, 0),
    COALESCE(new_quantity, COALESCE(previous_quantity, 0) + quantity),
    created_at
FROM public.stock_movements
WHERE product_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 2. Drop the old columns from stock_movements
ALTER TABLE public.stock_movements
DROP COLUMN IF EXISTS product_id CASCADE,
DROP COLUMN IF EXISTS variant_id CASCADE,
DROP COLUMN IF EXISTS quantity CASCADE,
DROP COLUMN IF EXISTS previous_quantity CASCADE,
DROP COLUMN IF EXISTS new_quantity CASCADE;

-- 3. Update the RPC to not reference the dropped column `quantity`
CREATE OR REPLACE FUNCTION public.create_batch_stock_movement(
    p_partner_id UUID,
    p_movement_type TEXT,        -- 'in' or 'out'
    p_reason TEXT,
    p_notes TEXT,
    p_created_by UUID DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::JSONB   -- array of { product_id, variant_id, quantity }
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
BEGIN
    v_items_count := jsonb_array_length(p_items);
    
    IF v_items_count = 0 THEN
        RAISE EXCEPTION 'Nenhum item fornecido';
    END IF;

    -- Create the parent movement record (without product-specific data and quantity)
    INSERT INTO public.stock_movements (
        partner_id,
        movement_type,
        reason,
        notes,
        created_by,
        created_at
    ) VALUES (
        p_partner_id,
        p_movement_type,
        p_reason,
        p_notes,
        p_created_by,
        NOW()
    )
    RETURNING id INTO v_movement_id;

    -- Process each item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
        v_qty := (v_item->>'quantity')::INT;

        IF v_qty <= 0 THEN
            RAISE EXCEPTION 'Quantidade deve ser maior que zero para cada item';
        END IF;

        -- Handle Variant Stock
        IF v_variant_id IS NOT NULL THEN
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

        -- Handle Simple Product Stock
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

        -- Insert item record with quantities
        INSERT INTO public.stock_movement_items (
            movement_id,
            product_id,
            variant_id,
            quantity,
            previous_quantity,
            new_quantity,
            created_at
        ) VALUES (
            v_movement_id,
            v_product_id,
            v_variant_id,
            CASE WHEN p_movement_type = 'in' THEN v_qty ELSE -v_qty END,
            v_previous_stock,
            v_new_stock,
            NOW()
        );

        v_total_quantity := v_total_quantity + v_qty;
    END LOOP;

    -- Return the movement with items count
    SELECT json_build_object(
        'id', v_movement_id,
        'items_count', v_items_count,
        'total_quantity', v_total_quantity
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
