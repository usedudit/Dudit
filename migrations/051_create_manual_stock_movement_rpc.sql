-- SCRIPT: CREATE MANUAL STOCK MOVEMENT RPC
-- This RPC handles manual stock adjustments (in/out) safely using transactions and row locks.
-- It avoids race conditions when reading previous stock and inserting the movement log.

CREATE OR REPLACE FUNCTION public.create_manual_stock_movement(
    p_partner_id uuid,
    p_product_id uuid,
    p_movement_type text,
    p_quantity int,
    p_reason text,
    p_notes text,
    p_created_by text DEFAULT NULL,
    p_variant_id uuid DEFAULT NULL
) RETURNS json AS $$
DECLARE
    v_previous_stock INT;
    v_new_stock INT;
    v_inserted_movement json;
BEGIN
    -- Handle Variant Stock
    IF p_variant_id IS NOT NULL THEN
        -- Lock row and get current stock
        SELECT stock_quantity INTO v_previous_stock
        FROM product_variants
        WHERE id = p_variant_id AND product_id = p_product_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Variante não encontrada';
        END IF;

        -- Calculate new stock
        IF p_movement_type = 'in' THEN
            v_new_stock := v_previous_stock + p_quantity;
        ELSE
            v_new_stock := GREATEST(0, v_previous_stock - p_quantity);
        END IF;

        -- Update variant stock
        UPDATE product_variants
        SET stock_quantity = v_new_stock,
            updated_at = NOW()
        WHERE id = p_variant_id;

    -- Handle Simple Product Stock
    ELSE
        -- Lock row and get current stock
        SELECT stock_quantity INTO v_previous_stock
        FROM products
        WHERE id = p_product_id AND partner_id = p_partner_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Produto não encontrado';
        END IF;

        -- Calculate new stock
        IF p_movement_type = 'in' THEN
            v_new_stock := v_previous_stock + p_quantity;
        ELSE
            v_new_stock := GREATEST(0, v_previous_stock - p_quantity);
        END IF;

        -- Update product stock
        UPDATE products
        SET stock_quantity = v_new_stock,
            updated_at = NOW()
        WHERE id = p_product_id;
    END IF;

    -- Insert stock movement record
    INSERT INTO stock_movements (
        partner_id,
        product_id,
        variant_id,
        movement_type,
        quantity,
        previous_quantity,
        new_quantity,
        reason,
        notes,
        created_by,
        created_at
    ) VALUES (
        p_partner_id,
        p_product_id,
        p_variant_id,
        p_movement_type,
        CASE WHEN p_movement_type = 'in' THEN p_quantity ELSE -p_quantity END,
        v_previous_stock,
        v_new_stock,
        p_reason,
        p_notes,
        p_created_by,
        NOW()
    )
    RETURNING row_to_json(stock_movements.*) INTO v_inserted_movement;

    RETURN v_inserted_movement;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
