-- OS ↔ Venda vinculação bidirecional + anexos antes/depois

-- 1. Adicionar sale_id na OS (vínculo direto, igual appointments têm)
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_service_orders_sale_id ON public.service_orders(sale_id);

-- 2. Adicionar origin_type e origin_id na venda (vínculo bidirecional)
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS origin_type TEXT CHECK (origin_type IS NULL OR origin_type IN ('order', 'appointment', 'service_order', 'pos')),
  ADD COLUMN IF NOT EXISTS origin_id UUID;
CREATE INDEX IF NOT EXISTS idx_sales_origin ON public.sales(origin_type, origin_id);

-- 3. Categoria para anexos (normal, antes, depois)
ALTER TABLE public.service_order_attachments
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'normal' CHECK (category IN ('normal', 'antes', 'depois'));
