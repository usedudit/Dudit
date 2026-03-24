-- Remover triggers de estoque legados que causam duplicidade
-- O controle de estoque agora é feito via aplicação (RPC decrement_stock)

DROP TRIGGER IF EXISTS update_stock_on_payment ON public.orders;
DROP FUNCTION IF EXISTS public.handle_payment_stock_update();

-- Também remover versões antigas se existirem
DROP TRIGGER IF EXISTS order_status_stock_movement ON public.orders;
DROP FUNCTION IF EXISTS public.handle_order_stock_movement();

-- Comentário para registro
COMMENT ON TABLE orders IS 'Triggers de estoque legados removidos para evitar double decrement. Controle feito via API.';
