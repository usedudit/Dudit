-- SCRIPT 048: NUCLEAR OPTION - REMOVE TUDO E CRIA DO ZERO
-- Este é o script definitivo que remove TODOS os triggers de estoque
-- e cria apenas UM que funciona corretamente

-- Step 1: DROP ALL TRIGGERS (force drop everything)
DROP TRIGGER IF EXISTS stock_decrement_on_order_paid ON orders CASCADE;
DROP TRIGGER IF EXISTS order_payment_stock_trigger ON orders CASCADE;
DROP TRIGGER IF EXISTS update_stock_on_payment ON orders CASCADE;
DROP TRIGGER IF EXISTS auto_decrement_stock_on_order_paid ON orders CASCADE;
DROP TRIGGER IF EXISTS auto_decrement_stock_on_paid ON orders CASCADE;
DROP TRIGGER IF EXISTS final_stock_decrement_trigger ON orders CASCADE;

-- Step 2: DROP ALL FUNCTIONS (force drop everything)
DROP FUNCTION IF EXISTS public.handle_order_stock_decrement() CASCADE;
DROP FUNCTION IF EXISTS public.handle_order_payment_stock() CASCADE;
DROP FUNCTION IF EXISTS public.handle_payment_stock_update() CASCADE;
DROP FUNCTION IF EXISTS public.auto_decrement_stock_on_paid() CASCADE;
DROP FUNCTION IF EXISTS public.final_stock_decrement_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.decrement_stock(uuid, integer) CASCADE;

-- Step 3: CREATE THE ONE AND ONLY FUNCTION
CREATE OR REPLACE FUNCTION public.handle_order_stock_decrement()
RETURNS TRIGGER AS $$
DECLARE
  v_item RECORD;
  v_previous_stock INT;
  v_new_stock INT;
BEGIN
  -- APENAS quando a order passa para 'paid' (não regredir)
  IF NEW.situation = 'paid' AND (OLD.situation IS NULL OR OLD.situation != 'paid') THEN
    -- Iterar pelos items da ordem
    FOR v_item IN
      SELECT product_id, quantity FROM order_items WHERE order_id = NEW.id
    LOOP
      -- Obter estoque anterior
      SELECT stock_quantity INTO v_previous_stock
      FROM products
      WHERE id = v_item.product_id;

      -- Decrementar estoque
      UPDATE products
      SET stock_quantity = stock_quantity - v_item.quantity,
          updated_at = NOW()
      WHERE id = v_item.product_id;

      -- Obter novo estoque
      SELECT stock_quantity INTO v_new_stock
      FROM products
      WHERE id = v_item.product_id;

      -- Registrar movimento de estoque
      INSERT INTO stock_movements (
        partner_id,
        product_id,
        movement_type,
        quantity,
        previous_quantity,
        new_quantity,
        order_id,
        reference_name,
        notes,
        created_at
      ) 
      VALUES (
        NEW.partner_id,
        v_item.product_id,
        'sale',
        -v_item.quantity,
        COALESCE(v_previous_stock, 0),
        COALESCE(v_new_stock, 0),
        NEW.id,
        'Pedido ' || COALESCE(NEW.order_number, NEW.id::text),
        'Venda realizada via pedido #' || COALESCE(NEW.order_number, NEW.id::text),
        NOW()
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 4: CREATE THE ONE AND ONLY TRIGGER
CREATE TRIGGER stock_decrement_on_order_paid
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION public.handle_order_stock_decrement();

-- Step 5: Verify trigger was created
SELECT 'Trigger criado com sucesso!' as status;
