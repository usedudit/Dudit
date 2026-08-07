-- Adicionar order_item_id na tabela appointments para vínculo individual por item de serviço do pedido
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_order_item_id ON public.appointments(order_item_id);
