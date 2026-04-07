-- ============================================================================
-- MIGRATION: Multi-Item Stock Movements
-- ============================================================================
-- This migration adds support for multiple items per stock movement.
-- Previous single-item columns on stock_movements are preserved for backward
-- compatibility but new movements will store items in stock_movement_items.
-- ============================================================================

-- 1. Create the stock_movement_items table
CREATE TABLE IF NOT EXISTS public.stock_movement_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    movement_id UUID NOT NULL REFERENCES public.stock_movements(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
    quantity INT NOT NULL,            -- positive for 'in', negative for 'out'
    previous_quantity INT NOT NULL DEFAULT 0,
    new_quantity INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_smi_movement_id ON public.stock_movement_items(movement_id);
CREATE INDEX IF NOT EXISTS idx_smi_product_id ON public.stock_movement_items(product_id);

-- RLS
ALTER TABLE public.stock_movement_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_movement_items_select"
    ON public.stock_movement_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.stock_movements sm
            WHERE sm.id = stock_movement_items.movement_id
              AND sm.partner_id = (current_setting('request.jwt.claims', true)::json->>'partner_id')::uuid
        )
    );

CREATE POLICY "stock_movement_items_insert"
    ON public.stock_movement_items FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.stock_movements sm
            WHERE sm.id = stock_movement_items.movement_id
              AND sm.partner_id = (current_setting('request.jwt.claims', true)::json->>'partner_id')::uuid
        )
    );

-- 2. Create the batch stock movement RPC
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

    -- Create the parent movement record (without product-specific data)
    INSERT INTO public.stock_movements (
        partner_id,
        movement_type,
        quantity,
        reason,
        notes,
        created_by,
        created_at
    ) VALUES (
        p_partner_id,
        p_movement_type,
        0,  -- will be updated below
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

        -- Insert item record
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

    -- Update parent movement total quantity
    UPDATE public.stock_movements
    SET quantity = CASE WHEN p_movement_type = 'in' THEN v_total_quantity ELSE -v_total_quantity END
    WHERE id = v_movement_id;

    -- Return the movement with items count
    SELECT json_build_object(
        'id', v_movement_id,
        'items_count', v_items_count,
        'total_quantity', v_total_quantity
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
