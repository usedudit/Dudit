-- ============================================================================
-- Fase 6 - Criar tabela store_services com RLS
-- ============================================================================
-- store_services vincula um serviço base (services) a uma store específica.
-- Segue exatamente o mesmo padrão de store_products (Fase 5).
--
-- EXCEÇÃO: services não têm stock_quantity, portanto override_stock_quantity
-- não se aplica. Os únicos override fields são:
--   - override_price  (NUMERIC)
--   - override_sku    (TEXT)
--   - is_active       (BOOLEAN)
--
-- Regras:
-- - service_id + store_id é UNIQUE
-- - override_price NULL → usa price do services
-- - override_sku NULL → usa sku do services
-- - is_active controla visibilidade na store específica
-- - is_active NULL → usa is_active do services (via resolver)
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS store_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  override_price NUMERIC(10,2),
  override_sku TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(service_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_store_services_service_id ON store_services(service_id);
CREATE INDEX IF NOT EXISTS idx_store_services_store_id ON store_services(store_id);
CREATE INDEX IF NOT EXISTS idx_store_services_store_active ON store_services(store_id, is_active) WHERE is_active = true;

ALTER TABLE store_services ENABLE ROW LEVEL SECURITY;

-- SELECT: usuário com acesso à store pode ver os vínculos de serviços
DROP POLICY IF EXISTS store_services_select ON store_services;
CREATE POLICY store_services_select ON store_services
  FOR SELECT USING (
    public.user_has_store_access(store_id)
  );

-- INSERT: apenas owner/admin/manager do partner podem vincular serviços
DROP POLICY IF EXISTS store_services_insert ON store_services;
CREATE POLICY store_services_insert ON store_services
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
DROP POLICY IF EXISTS store_services_update ON store_services;
CREATE POLICY store_services_update ON store_services
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
DROP POLICY IF EXISTS store_services_delete ON store_services;
CREATE POLICY store_services_delete ON store_services
  FOR DELETE USING (
    store_id IN (
      SELECT id FROM stores WHERE partner_id IN (
        SELECT partner_id FROM partner_users WHERE user_id = auth.uid() AND role_id IN ('owner', 'admin')
        UNION
        SELECT id FROM partners WHERE user_id = auth.uid()
      )
    )
  );

-- Backfill: para cada serviço existente com store_id, criar store_services
-- com override fields NULL (herda do serviço base). Idempotente.
INSERT INTO store_services (service_id, store_id, is_active)
SELECT
  s.id,
  s.store_id,
  s.is_active
FROM services s
WHERE s.store_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM store_services ss
    WHERE ss.service_id = s.id AND ss.store_id = s.store_id
  );

COMMIT;
