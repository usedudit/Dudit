-- Função para contar pedidos pendentes de um produto específico
-- Substitui 3 chamadas de API por 1 execução interna
CREATE OR REPLACE FUNCTION get_product_pending_orders_count(p_product_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER -- Roda com permissões elevadas para garantir a leitura correta dos pedidos
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(DISTINCT o.id)
  INTO v_count
  FROM orders o
  JOIN order_items oi ON o.id = oi.order_id
  WHERE oi.product_id = p_product_id
  AND o.situation IN ('pending', 'processing'); -- Mesmos status do seu código original

  RETURN COALESCE(v_count, 0);
END;
$$;
