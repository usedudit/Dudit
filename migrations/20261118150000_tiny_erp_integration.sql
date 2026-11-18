-- ============================================================================
-- Tiny ERP Integration Schema
--
-- 1. Register Tiny ERP in integration_providers
-- 2. Add external sync tracking columns to products (external_id, external_provider, last_external_sync_at)
-- 3. Add external export tracking columns to orders (external_order_id, external_order_number, external_sync_status)
-- ============================================================================

-- 1. Register Provider
INSERT INTO public.integration_providers (slug, category, name, docs_url)
VALUES ('tiny', 'other', 'Tiny ERP', 'https://developer.tiny.com.br/')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, docs_url = EXCLUDED.docs_url;

-- 2. Products external tracking
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS external_provider TEXT,
  ADD COLUMN IF NOT EXISTS last_external_sync_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_products_partner_external
  ON public.products (partner_id, external_provider, external_id);

-- 3. Orders external sync tracking
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS external_order_id TEXT,
  ADD COLUMN IF NOT EXISTS external_order_number TEXT,
  ADD COLUMN IF NOT EXISTS external_provider TEXT,
  ADD COLUMN IF NOT EXISTS external_sync_status TEXT DEFAULT 'pending'
    CHECK (external_sync_status IN ('pending', 'synced', 'error', 'ignored')),
  ADD COLUMN IF NOT EXISTS external_sync_error TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_partner_external_status
  ON public.orders (partner_id, external_sync_status);
