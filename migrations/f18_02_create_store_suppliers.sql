-- ============================================================================
-- Fase 3 - Criar tabela store_suppliers (bridge)
-- ============================================================================
-- store_suppliers vincula um fornecedor base (suppliers) a uma store específica,
-- seguindo o mesmo padrão de store_products e store_services.
--
-- Funciona como bridge para o modelo híbrido:
--   - Sem registro: fornecedor global (visibility_scope='all', herdado)
--   - Com registro: fornecedor com visibilidade controlada por loja
--
-- Regras:
-- - supplier_id + store_id é UNIQUE
-- - is_active controla visibilidade na store específica
-- - visibility_scope: 'all' (padrão), 'selected', 'exclusive'
-- - marketplace_visible: controla exibição no marketplace (default true)
-- - Diferente de store_products, não tem override fields (fornecedor
--   não tem preço/estoque — apenas vínculo produto-fornecedor)
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS store_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  visibility_scope TEXT NOT NULL DEFAULT 'all' CHECK (visibility_scope IN ('all', 'selected', 'exclusive')),
  marketplace_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(supplier_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_store_suppliers_supplier_id ON store_suppliers(supplier_id);
CREATE INDEX IF NOT EXISTS idx_store_suppliers_store_id ON store_suppliers(store_id);
CREATE INDEX IF NOT EXISTS idx_store_suppliers_store_active ON store_suppliers(store_id, is_active) WHERE is_active = true;

ALTER TABLE store_suppliers ENABLE ROW LEVEL SECURITY;

-- SELECT: usuário com acesso à store pode ver os vínculos de fornecedores
DROP POLICY IF EXISTS store_suppliers_select ON store_suppliers;
CREATE POLICY store_suppliers_select ON store_suppliers
  FOR SELECT USING (
    public.user_has_store_access(store_id)
  );

-- INSERT: apenas owner/admin/manager do partner podem vincular fornecedores
DROP POLICY IF EXISTS store_suppliers_insert ON store_suppliers;
CREATE POLICY store_suppliers_insert ON store_suppliers
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
DROP POLICY IF EXISTS store_suppliers_update ON store_suppliers;
CREATE POLICY store_suppliers_update ON store_suppliers
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
DROP POLICY IF EXISTS store_suppliers_delete ON store_suppliers;
CREATE POLICY store_suppliers_delete ON store_suppliers
  FOR DELETE USING (
    store_id IN (
      SELECT id FROM stores WHERE partner_id IN (
        SELECT partner_id FROM partner_users WHERE user_id = auth.uid() AND role_id IN ('owner', 'admin')
        UNION
        SELECT id FROM partners WHERE user_id = auth.uid()
      )
    )
  );

-- Nota: Não há backfill para fornecedores existentes com store_id porque:
-- 1. Fornecedores já com store_id são tratados como exclusivos daquela loja
-- 2. Fornecedores SEM store_id são globais e não precisam de bridge
-- 3. Futuramente o ERP pode criar bridges explicitamente

COMMIT;
