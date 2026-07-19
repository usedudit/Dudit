-- ============================================================================
-- Fase 3 - Criar tabela store_product_kits (bridge)
-- ============================================================================
-- store_product_kits vincula um kit base (product_kits) a uma store específica,
-- seguindo o mesmo padrão de store_products e store_services.
--
-- Funciona como bridge para o modelo híbrido:
--   - Sem registro: kit global (visibility_scope='all', herdado)
--   - Com registro: kit com overrides/visibilidade controlada por loja
--
-- Regras:
-- - kit_id + store_id é UNIQUE
-- - override_price NULL → usa kit_price do product_kits
-- - is_active controla visibilidade na store específica
-- - visibility_scope: 'all' (padrão), 'selected', 'exclusive'
-- - marketplace_visible: controla exibição no marketplace (default true)
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS store_product_kits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id UUID NOT NULL REFERENCES product_kits(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  override_price NUMERIC(10,2),
  is_active BOOLEAN DEFAULT true,
  visibility_scope TEXT NOT NULL DEFAULT 'all' CHECK (visibility_scope IN ('all', 'selected', 'exclusive')),
  marketplace_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(kit_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_store_product_kits_kit_id ON store_product_kits(kit_id);
CREATE INDEX IF NOT EXISTS idx_store_product_kits_store_id ON store_product_kits(store_id);
CREATE INDEX IF NOT EXISTS idx_store_product_kits_store_active ON store_product_kits(store_id, is_active) WHERE is_active = true;

ALTER TABLE store_product_kits ENABLE ROW LEVEL SECURITY;

-- SELECT: usuário com acesso à store pode ver os vínculos de kits
DROP POLICY IF EXISTS store_product_kits_select ON store_product_kits;
CREATE POLICY store_product_kits_select ON store_product_kits
  FOR SELECT USING (
    public.user_has_store_access(store_id)
  );

-- INSERT: apenas owner/admin/manager do partner podem vincular kits
DROP POLICY IF EXISTS store_product_kits_insert ON store_product_kits;
CREATE POLICY store_product_kits_insert ON store_product_kits
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
DROP POLICY IF EXISTS store_product_kits_update ON store_product_kits;
CREATE POLICY store_product_kits_update ON store_product_kits
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
DROP POLICY IF EXISTS store_product_kits_delete ON store_product_kits;
CREATE POLICY store_product_kits_delete ON store_product_kits
  FOR DELETE USING (
    store_id IN (
      SELECT id FROM stores WHERE partner_id IN (
        SELECT partner_id FROM partner_users WHERE user_id = auth.uid() AND role_id IN ('owner', 'admin')
        UNION
        SELECT id FROM partners WHERE user_id = auth.uid()
      )
    )
  );

-- Nota: Não há backfill para kits existentes com store_id porque:
-- 1. Kits já com store_id são tratados como exclusivos daquela loja
-- 2. Kits SEM store_id são globais e não precisam de bridge
-- 3. Futuramente o ERP pode criar bridges explicitamente

COMMIT;
