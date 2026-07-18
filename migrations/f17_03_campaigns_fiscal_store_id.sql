-- F17+ Fase 1: store_id nullable em campaigns + product_fiscal_profiles
-- campaigns: HYBRID nullable (global + opção store)
-- product_fiscal_profiles: store_id profilático (GO/NO-GO ressalva #1)
-- Integridade referencial: ON DELETE SET NULL

BEGIN;

-- ============================================================
-- M7: campaigns
-- ============================================================

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_store_id
  ON campaigns(store_id);

COMMENT ON COLUMN campaigns.store_id IS
  'NULL = global; preenchido = vinculado à store específica';

-- ============================================================
-- M3: product_fiscal_profiles (profilático)
-- ============================================================

ALTER TABLE product_fiscal_profiles
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_product_fiscal_profiles_store_id
  ON product_fiscal_profiles(store_id);

COMMENT ON COLUMN product_fiscal_profiles.store_id IS
  'NULL = perfil fiscal global; preenchido = vinculado à store (profilático para futuro uso)';

COMMIT;
