-- ============================================================================
-- Fase 5 - Criar tabela store_products com RLS
-- ============================================================================
-- store_products vincula um produto base (products) a uma store específica,
-- permitindo que um mesmo produto exista em múltiplas lojas com preço,
-- estoque e SKU diferentes (override fields) sem duplicar o registro base.
--
-- Fluxo de resolução (feito em lib/store-products.ts):
--   1. Busca o produto base em products
--   2. Busca o store_products para (product_id, store_id)
--   3. Se existir: COALESCE(override_*, base_*) para price/stock/SKU
--   4. Se não existir: usa o produto base como está
--      (backward compatibility com produtos que têm apenas store_id)
--
-- Regras:
-- - product_id + store_id é UNIQUE
-- - override_price NULL → usa price do products
-- - override_stock_quantity NULL → usa stock_quantity do products
-- - override_sku NULL → usa sku do products
-- - is_active controla visibilidade na store específica
-- - is_active NULL → usa is_active do products (via resolver)
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS store_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  override_price NUMERIC(10,2),
  override_stock_quantity INTEGER,
  override_sku TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_store_products_product_id ON store_products(product_id);
CREATE INDEX IF NOT EXISTS idx_store_products_store_id ON store_products(store_id);
CREATE INDEX IF NOT EXISTS idx_store_products_store_active ON store_products(store_id, is_active) WHERE is_active = true;

ALTER TABLE store_products ENABLE ROW LEVEL SECURITY;

-- SELECT: usuário com acesso à store pode ver os vínculos de produtos
DROP POLICY IF EXISTS store_products_select ON store_products;
CREATE POLICY store_products_select ON store_products
  FOR SELECT USING (
    public.user_has_store_access(store_id)
  );

-- INSERT: apenas owner/admin/manager do partner podem vincular produtos
DROP POLICY IF EXISTS store_products_insert ON store_products;
CREATE POLICY store_products_insert ON store_products
  FOR INSERT WITH CHECK (
    store_id IN (
      SELECT id FROM stores WHERE partner_id IN (
        SELECT partner_id FROM partner_users WHERE user_id = auth.uid() AND role_id IN ('owner', 'admin', 'manager')
        UNION
        SELECT id FROM partners WHERE user_id = auth.uid()
      )
    )
  );

-- UPDATE: owner/admin/manager podem alterar overrides
DROP POLICY IF EXISTS store_products_update ON store_products;
CREATE POLICY store_products_update ON store_products
  FOR UPDATE USING (
    store_id IN (
      SELECT id FROM stores WHERE partner_id IN (
        SELECT partner_id FROM partner_users WHERE user_id = auth.uid() AND role_id IN ('owner', 'admin', 'manager')
        UNION
        SELECT id FROM partners WHERE user_id = auth.uid()
      )
    )
  );

-- DELETE: apenas owner/admin podem remover vínculos
DROP POLICY IF EXISTS store_products_delete ON store_products;
CREATE POLICY store_products_delete ON store_products
  FOR DELETE USING (
    store_id IN (
      SELECT id FROM stores WHERE partner_id IN (
        SELECT partner_id FROM partner_users WHERE user_id = auth.uid() AND role_id IN ('owner', 'admin')
        UNION
        SELECT id FROM partners WHERE user_id = auth.uid()
      )
    )
  );

-- Backfill: para cada produto existente com store_id, criar store_products
-- com override fields NULL (herda do produto base). Idempotente.
INSERT INTO store_products (product_id, store_id, is_active)
SELECT
  p.id,
  p.store_id,
  p.is_active
FROM products p
WHERE p.store_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM store_products sp
    WHERE sp.product_id = p.id AND sp.store_id = p.store_id
  );

COMMIT;
