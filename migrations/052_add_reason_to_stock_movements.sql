-- SCRIPT: ADD REASON COLUMN AND UPDATE STOCK LOGIC
-- ADD REASON COLUMN TO STOCK_MOVEMENTS
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS reason TEXT;

-- UPDATE MANUAL STOCK MOVEMENT RPC
CREATE OR REPLACE FUNCTION public.create_manual_stock_movement(
    p_partner_id uuid,
    p_product_id uuid,
    p_movement_type text,
    p_quantity int,
    p_reason text,
    p_notes text,
    p_created_by uuid DEFAULT NULL, -- Changed from text to uuid
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

-- UPDATE ORDER PAYMENT TRIGGER
CREATE OR REPLACE FUNCTION handle_order_payment()
RETURNS trigger AS $$
BEGIN
  -- Se o pedido foi marcado como pago
  IF new.situation = 'paid' AND (old.situation IS NULL OR old.situation != 'paid') THEN
    -- Dar baixa nos produtos do pedido
    UPDATE products
    SET stock_quantity = stock_quantity - oi.quantity
    FROM order_items oi
    WHERE products.id = oi.product_id
      AND oi.order_id = new.id
      AND products.stock_quantity >= oi.quantity;
    
    -- Registrar movimentação de estoque para cada item
    INSERT INTO stock_movements (
      partner_id,
      product_id,
      order_id,
      movement_type,
      quantity,
      previous_quantity,
      new_quantity,
      reference_type,
      reference_name,
      reason,
      notes
    )
    SELECT 
      new.partner_id,
      oi.product_id,
      new.id,
      'sale',
      -oi.quantity,
      p.stock_quantity + oi.quantity,
      p.stock_quantity,
      'customer',
      'Pedido #' || new.order_number,
      'Venda',
      'Venda realizada via pedido'
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = new.id;
  END IF;
  
  RETURN new;
END;
$$ LANGUAGE plpgsql;
