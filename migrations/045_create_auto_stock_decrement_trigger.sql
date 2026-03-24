-- Script para criar trigger automático de decremento de estoque
-- Quando uma order passa para 'paid', automaticamente decrementa o estoque
-- Isso garante que não há duplicação entre process-payment, webhook e sync-payment-status

DROP TRIGGER IF EXISTS auto_decrement_stock_on_paid ON public.orders;
DROP FUNCTION IF EXISTS public.auto_decrement_stock_on_paid();

CREATE OR REPLACE FUNCTION auto_decrement_stock_on_paid()
RETURNS TRIGGER AS $$
BEGIN
  -- Se o status mudou para 'paid' (e não era 'paid' antes)
  IF (TG_OP = 'UPDATE' 
      AND OLD.situation != 'paid' 
      AND NEW.situation = 'paid'
      AND NEW.id IS NOT NULL) THEN
    
    -- Buscar todos os itens do pedido e decrementar estoque
    DECLARE
      order_item RECORD;
    BEGIN
      FOR order_item IN
        SELECT product_id, quantity, variant_id
        FROM order_items
        WHERE order_id = NEW.id
      LOOP
        -- Chamar RPC para decrementar estoque de forma atômica
        PERFORM decrement_stock(
          COALESCE(order_item.variant_id, order_item.product_id),
          order_item.quantity
        );
      END LOOP;
    END;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_decrement_stock_on_paid
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION auto_decrement_stock_on_paid();

COMMENT ON FUNCTION auto_decrement_stock_on_paid() IS 'Automatically decrements stock when order status changes to paid. Prevents duplicate decrements across payment processes.';
