-- ============================================================
-- Migration: Add source_service_order_id to orders
-- Links orders directly to the source service_order (mirroring source_quote_id)
-- ============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS source_service_order_id UUID REFERENCES public.service_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_source_service_order_id ON public.orders(source_service_order_id);

-- Backfill source_service_order_id from existing service_orders where order_id is set
UPDATE public.orders o
SET source_service_order_id = so.id,
    order_source = CASE WHEN o.order_source = 'admin_service_order' THEN 'Ordem de Serviço' ELSE o.order_source END
FROM public.service_orders so
WHERE so.order_id = o.id
  AND (o.source_service_order_id IS NULL OR o.order_source = 'admin_service_order');

-- Normalize any remaining legacy order_source = 'admin_service_order'
UPDATE public.orders
SET order_source = 'Ordem de Serviço'
WHERE order_source = 'admin_service_order';
