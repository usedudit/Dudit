-- OS ↔ Pedido (orders) vinculação: cria venda na página de pedidos igual agendamentos

-- 1. Adicionar order_id na OS (vínculo direto com a row em orders, igual appointments.marketplace_order_id)
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_service_orders_order_id ON public.service_orders(order_id);
