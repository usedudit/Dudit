-- Performance indexes for appointment_items search
-- Enables fast LIKE/ILIKE searches on products for appointment item search

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram index for fast product name/sku searches (used by searchProductsForAppointmentItems)
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON public.products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_sku_trgm ON public.products USING gin (sku gin_trgm_ops);

-- Composite index for partner-scoped product searches (filters by partner first, then searches)
CREATE INDEX IF NOT EXISTS idx_products_partner_active_name ON public.products(partner_id, is_active, name);
CREATE INDEX IF NOT EXISTS idx_products_partner_active_sku ON public.products(partner_id, is_active, sku);
