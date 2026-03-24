-- SCRIPT 047: Remover trigger duplicado e aplicar versão corrigida
-- O trigger auto_decrement_stock_on_order_paid já existe do script 045
-- Vamos remover e recriar com a versão corrigida

-- Step 1: Drop o trigger duplicado
DROP TRIGGER IF EXISTS auto_decrement_stock_on_order_paid ON public.orders CASCADE;

-- Step 2: Drop a função antiga se existir
DROP FUNCTION IF EXISTS public.auto_decrement_stock_on_order_paid() CASCADE;

-- Step 3: Remover outros triggers conflitantes
DROP TRIGGER IF EXISTS order_payment_stock_trigger ON public.orders CASCADE;
DROP TRIGGER IF EXISTS update_stock_on_payment ON public.orders CASCADE;
DROP TRIGGER IF EXISTS final_stock_decrement_trigger ON public.orders CASCADE;

-- Step 4: Remover funções antigas
DROP FUNCTION IF EXISTS public.handle_order_payment_stock() CASCADE;
DROP FUNCTION IF EXISTS public.handle_payment_stock_update() CASCADE;
DROP FUNCTION IF EXISTS public.final_stock_decrement_on_paid() CASCADE;

-- Step 5: Criar ÚNICA função corrigida que decremente estoque quando order passa para paid
CREATE OR REPLACE FUNCTION public.handle_order_stock_decrement()
RETURNS TRIGGER AS $$
DECLARE
  v_item RECORD;
  v_previous_stock INT;
  v_new_stock INT;
BEGIN
  -- APENAS quando a order passa para 'paid' (não regredir)
  IF NEW.situation = 'paid' AND OLD.situation != 'paid' THEN
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

      -- Registrar movimento de estoque - SEM updated_at (não existe)
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

-- Step 6: Criar ÚNICO trigger que roda quando order passa para paid
CREATE TRIGGER stock_decrement_on_order_paid
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_stock_decrement();

-- Step 7: Remover scripts antigos para evitar conflitos futuros
-- (Scripts 031, 030, 044, 045 não precisam mais rodar)
