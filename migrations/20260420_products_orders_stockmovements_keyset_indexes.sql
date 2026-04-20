-- Keyset pagination performance indexes
-- Supports stable ordering by (created_at DESC, id DESC) under partner_id scope.

-- Products list (ERP)
CREATE INDEX IF NOT EXISTS idx_products_partner_created_id_desc
  ON public.products (partner_id, created_at DESC, id DESC);

-- Orders list (ERP)
CREATE INDEX IF NOT EXISTS idx_orders_partner_created_id_desc
  ON public.orders (partner_id, created_at DESC, id DESC);

-- Stock movements list (ERP)
CREATE INDEX IF NOT EXISTS idx_stock_movements_partner_created_id_desc
  ON public.stock_movements (partner_id, created_at DESC, id DESC);

