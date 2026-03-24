-- SCRIPT 050: FIX STOCK TRIGGER FOR VARIANTS
-- Replaces previous stock triggers with a logic that correctly handles variants
-- Validated for both simple products and products with variants

-- 0. Ensure variant_id exists in stock_movements (Fix for missing column error)
ALTER TABLE stock_movements 
ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL;

-- 1. Drop existing trigger and function (cleanup)
DROP TRIGGER IF EXISTS stock_decrement_on_order_paid ON orders CASCADE;
DROP TRIGGER IF EXISTS stock_decrement_on_order_paid_v2 ON orders CASCADE; -- Drop the v2 one if it was partially created
DROP FUNCTION IF EXISTS public.handle_order_stock_decrement() CASCADE;
DROP FUNCTION IF EXISTS public.handle_order_stock_decrement_v2() CASCADE;

-- 2. Create the robust stock decrement function
CREATE OR REPLACE FUNCTION public.handle_order_stock_decrement_v2()
RETURNS TRIGGER AS $$
DECLARE
  v_item RECORD;
  v_previous_stock INT;
  v_new_stock INT;
BEGIN
  -- Run ONLY when order status changes to 'paid' (and wasn't 'paid' before)
  IF NEW.situation = 'paid' AND (OLD.situation IS NULL OR OLD.situation != 'paid') THEN
    
    -- Iterate through order items
    FOR v_item IN
      SELECT product_id, variant_id, quantity 
      FROM order_items 
      WHERE order_id = NEW.id
    LOOP
      
      -- CASE 1: Item has a Variant ID (It's a variant!)
      IF v_item.variant_id IS NOT NULL THEN
        -- Decrement stock in product_variants
        UPDATE product_variants
        SET stock_quantity = GREATEST(0, stock_quantity - v_item.quantity),
            updated_at = NOW()
        WHERE id = v_item.variant_id
        RETURNING stock_quantity INTO v_new_stock;

        -- Log movement for variant
        INSERT INTO stock_movements (
          partner_id, product_id, variant_id, movement_type, quantity, 
          previous_quantity, new_quantity, order_id, reference_name, notes, created_at
        ) VALUES (
          NEW.partner_id, v_item.product_id, v_item.variant_id, 'sale', -v_item.quantity,
          v_new_stock + v_item.quantity, v_new_stock, NEW.id,
          'Pedido ' || COALESCE(NEW.order_number, NEW.id::text),
          'Venda de variante via pedido #' || COALESCE(NEW.order_number, NEW.id::text),
          NOW()
        ) ON CONFLICT DO NOTHING;

      -- CASE 2: Item does NOT have a Variant ID (It's a simple product OR old data)
      ELSE
        -- Decrement stock in products
        UPDATE products
        SET stock_quantity = GREATEST(0, stock_quantity - v_item.quantity),
            updated_at = NOW()
        WHERE id = v_item.product_id
        RETURNING stock_quantity INTO v_new_stock;

        -- Log movement for product
        INSERT INTO stock_movements (
          partner_id, product_id, movement_type, quantity, 
          previous_quantity, new_quantity, order_id, reference_name, notes, created_at
        ) VALUES (
          NEW.partner_id, v_item.product_id, 'sale', -v_item.quantity,
          v_new_stock + v_item.quantity, v_new_stock, NEW.id,
          'Pedido ' || COALESCE(NEW.order_number, NEW.id::text),
          'Venda de produto via pedido #' || COALESCE(NEW.order_number, NEW.id::text),
          NOW()
        ) ON CONFLICT DO NOTHING;
        
      END IF;

    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create the new trigger
CREATE TRIGGER stock_decrement_on_order_paid_v2
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION public.handle_order_stock_decrement_v2();

-- 4. Verify
SELECT 'Trigger v2 created successfully. Variants will now have their stock decremented correctly.' as status;
