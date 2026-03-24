-- Função RPC para decrementar estoque de forma atômica
-- Suporta tanto produtos quanto variantes (product_variants)
-- Previne race conditions onde dois compradores compram o mesmo item simultaneamente
CREATE OR REPLACE FUNCTION decrement_stock(p_product_id UUID, p_quantity INTEGER)
RETURNS VOID AS $$
BEGIN
  -- Primeiro tentar decrementar no products
  UPDATE products
  SET stock_quantity = stock_quantity - p_quantity
  WHERE id = p_product_id AND stock_quantity >= p_quantity;

  IF FOUND THEN
    RETURN;
  END IF;

  -- Se não encontrou em products, tentar em product_variants
  UPDATE product_variants
  SET stock_quantity = stock_quantity - p_quantity
  WHERE id = p_product_id AND stock_quantity >= p_quantity;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estoque insuficiente para o produto/variante %', p_product_id;
  END IF;
END;
$$ LANGUAGE plpgsql;
