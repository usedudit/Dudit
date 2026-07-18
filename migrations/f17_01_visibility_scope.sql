-- F17+ Fase 1: visibility_scope + marketplace_visible
-- store_products e store_services
-- Baseado em FINAL_ARCHITECTURE.md e GO_NOGO_AUDIT.md
-- Integridade referencial: ON DELETE SET NULL para store_id (quando aplicável)

BEGIN;

-- ============================================================
-- M1: store_products
-- ============================================================

ALTER TABLE store_products
  ADD COLUMN IF NOT EXISTS visibility_scope TEXT NOT NULL DEFAULT 'all'
    CHECK (visibility_scope IN ('all', 'selected', 'exclusive'));

ALTER TABLE store_products
  ADD COLUMN IF NOT EXISTS marketplace_visible BOOLEAN DEFAULT true;

COMMENT ON COLUMN store_products.visibility_scope IS
  'all=visível em todas as lojas, selected=apenas lojas selecionadas (store_product_visibility), exclusive=exclusivo da loja dona';

COMMENT ON COLUMN store_products.marketplace_visible IS
  'false = produto existe mas não aparece no marketplace';

-- ============================================================
-- M2: store_services
-- ============================================================

ALTER TABLE store_services
  ADD COLUMN IF NOT EXISTS visibility_scope TEXT NOT NULL DEFAULT 'all'
    CHECK (visibility_scope IN ('all', 'selected', 'exclusive'));

ALTER TABLE store_services
  ADD COLUMN IF NOT EXISTS marketplace_visible BOOLEAN DEFAULT true;

COMMENT ON COLUMN store_services.visibility_scope IS
  'all=visível em todas as lojas, selected=apenas lojas selecionadas, exclusive=exclusivo da loja dona';

COMMENT ON COLUMN store_services.marketplace_visible IS
  'false = serviço existe mas não aparece no marketplace';

COMMIT;
