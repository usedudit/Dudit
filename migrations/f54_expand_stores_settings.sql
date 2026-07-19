-- ============================================================================
-- F5.4a/b - Expand stores com colunas de vitrine, negócio e marketplace
-- ============================================================================

BEGIN;

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS is_showcase_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS order_flow VARCHAR(20) DEFAULT 'dudit',
  ADD COLUMN IF NOT EXISTS business_info JSONB DEFAULT '{"sells":["products"],"mode":"erp"}'::jsonb,
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES marketplace_partner_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES marketplace_partner_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  ADD COLUMN IF NOT EXISTS pickup_payment_policy TEXT DEFAULT 'require_online_payment';

CREATE INDEX IF NOT EXISTS idx_stores_category ON stores(category_id);
CREATE INDEX IF NOT EXISTS idx_stores_coordinates ON stores(latitude, longitude);

COMMIT;
