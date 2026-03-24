-- SCRIPT FINAL PARA RESOLVER DUPLICAÇÃO DE ESTOQUE
-- Remove TODOS os triggers conflitantes e cria UMA ÚNICA solução
-- Executar após esse script: sem mais triggers duplicados!

-- ============================================
-- PASSO 1: REMOVER TODOS OS TRIGGERS ANTIGOS
-- ============================================
DROP TRIGGER IF EXISTS order_payment_stock_trigger ON public.orders CASCADE;
DROP TRIGGER IF EXISTS update_stock_on_payment ON public.orders CASCADE;
DROP TRIGGER IF EXISTS auto_decrement_stock_on_paid ON public.orders CASCADE;
DROP TRIGGER IF EXISTS order_status_stock_movement ON public.orders CASCADE;
DROP TRIGGER IF EXISTS on_order_payment ON public.orders CASCADE;
DROP TRIGGER IF EXISTS on_order_status_change ON public.orders CASCADE;

-- ============================================
-- PASSO 2: REMOVER TODAS AS FUNÇÕES ANTIGAS
-- ============================================
DROP FUNCTION IF EXISTS public.handle_order_payment_stock() CASCADE;
DROP FUNCTION IF EXISTS public.handle_payment_stock_update() CASCADE;
DROP FUNCTION IF EXISTS public.auto_decrement_stock_on_paid() CASCADE;
DROP FUNCTION IF EXISTS public.register_stock_movement() CASCADE;
DROP FUNCTION IF EXISTS public.handle_order_status_change() CASCADE;
DROP FUNCTION IF EXISTS public.handle_order_payment() CASCADE;

-- ============================================
-- PASSO 3: CRIAR UMA ÚNICA SOLUÇÃO
-- ============================================
-- Esta função roda NO BANCO quando order.situation muda para 'paid'
-- Ela decremente o estoque UMA ÚNICA VEZ
-- E registra a movimentação UMA ÚNICA VEZ
CREATE OR REPLACE FUNCTION public.auto_decrement_stock_on_order_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_previous_stock INTEGER;
  v_new_stock INTEGER;
BEGIN
  -- IMPORTANTE: Só executar quando mudar para 'paid' (e não era 'paid' antes)
  -- Isto previne que o trigger rode múltiplas vezes
  IF NEW.situation = 'paid' AND (OLD.situation IS NULL OR OLD.situation != 'paid') THEN
    
    -- Loop por cada item no pedido
    FOR v_item IN 
      SELECT 
        oi.product_id,
        oi.quantity,
        COALESCE(p.stock_quantity, pv.stock_quantity, 0) as current_stock
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
      LEFT JOIN product_variants pv ON pv.id = oi.product_id
      WHERE oi.order_id = NEW.id
    LOOP
      -- Salvar estoque anterior
      v_previous_stock := v_item.current_stock;
      
      -- Calcular novo estoque (nunca negativo)
      v_new_stock := GREATEST(0, v_item.current_stock - v_item.quantity);
      
      -- DECREMENTAR ESTOQUE - Tentar primeiro em products
      UPDATE products
      SET stock_quantity = v_new_stock,
          updated_at = NOW()
      WHERE id = v_item.product_id;
      
      -- Se não atualizou em products, atualizar em product_variants
      IF NOT FOUND THEN
        UPDATE product_variants
        SET stock_quantity = v_new_stock,
            updated_at = NOW()
        WHERE id = v_item.product_id;
      END IF;
      
      -- REGISTRAR MOVIMENTO DE ESTOQUE - UMA VEZ APENAS
      INSERT INTO public.stock_movements (
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
      SELECT
        NEW.partner_id,
        v_item.product_id,
        'sale',
        -v_item.quantity,
        v_previous_stock,
        v_new_stock,
        NEW.id,
        'Pedido ' || COALESCE(NEW.order_number, NEW.id::text),
        'Venda realizada via pedido #' || COALESCE(NEW.order_number, NEW.id::text),
        NOW()
      ON CONFLICT DO NOTHING; -- Prevent duplicates
      
    END LOOP;
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- ============================================
-- PASSO 4: CRIAR UM ÚNICO TRIGGER
-- ============================================
-- Este trigger APENAS vai rodar quando:
-- - order.situation mudar para 'paid'
-- - E era um status diferente antes (previne re-trigger)
CREATE TRIGGER auto_decrement_stock_on_order_paid
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_decrement_stock_on_order_paid();

-- ============================================
-- PASSO 5: LIMPAR MOVIMENTAÇÕES DUPLICADAS ANTIGAS
-- ============================================
-- Mantém apenas a MAIS RECENTE para cada pedido + produto
WITH numbered_movements AS (
  SELECT 
    id,
    order_id,
    product_id,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY order_id, product_id 
      ORDER BY created_at DESC
    ) AS row_num
  FROM stock_movements
  WHERE order_id IS NOT NULL
    AND movement_type = 'sale'
)
DELETE FROM stock_movements
WHERE id IN (
  SELECT id FROM numbered_movements WHERE row_num > 1
);

-- ============================================
-- PASSO 6: DESABILITAR O RPC decrement_stock NA APP
-- ============================================
-- A partir de agora, o banco faz TUDO automaticamente
-- Remover todas as chamadas .rpc('decrement_stock') dos arquivos TypeScript

COMMENT ON FUNCTION public.auto_decrement_stock_on_order_paid() IS 
'FUNÇÃO PRINCIPAL DE ESTOQUE: Decrementa estoque quando order passa para paid. É a ÚNICA que deve rodar.';
