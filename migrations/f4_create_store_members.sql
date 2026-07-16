-- ============================================================================
-- Fase 4 - Criar tabela store_members com RLS
-- ============================================================================
-- store_members vincula um partner_user a uma store específica, permitindo
-- que diferentes usuários tenham acesso a diferentes lojas de um mesmo Partner.
--
-- Regras:
-- - partner_user_id + store_id é UNIQUE
-- - role NULL → herda role do partner_user
-- - permissions NULL → herda permissions do partner_user
-- - OWNERs não precisam de store_member (bypass)
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS store_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_user_id UUID NOT NULL REFERENCES partner_users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  role TEXT,  -- NULL = herda de partner_users.role
  permissions JSONB,  -- NULL = herda de partner_users.permissions
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(partner_user_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_store_members_store_id ON store_members(store_id);
CREATE INDEX IF NOT EXISTS idx_store_members_partner_user_id ON store_members(partner_user_id);

ALTER TABLE store_members ENABLE ROW LEVEL SECURITY;

-- SELECT: o próprio membro vê seus registros; admins do partner veem todos
DROP POLICY IF EXISTS "store_members_select" ON store_members;
CREATE POLICY "store_members_select" ON store_members
  FOR SELECT USING (
    partner_user_id IN (
      SELECT id FROM partner_users WHERE user_id = auth.uid()
    )
    OR store_id IN (
      SELECT id FROM stores WHERE partner_id IN (SELECT public.get_user_partner_ids())
    )
  );

-- INSERT: apenas quem gerencia o partner pode adicionar membros
DROP POLICY IF EXISTS "store_members_insert" ON store_members;
CREATE POLICY "store_members_insert" ON store_members
  FOR INSERT WITH CHECK (
    store_id IN (
      SELECT id FROM stores WHERE partner_id IN (SELECT public.get_user_partner_ids())
    )
  );

-- UPDATE: apenas quem gerencia o partner pode alterar
DROP POLICY IF EXISTS "store_members_update" ON store_members;
CREATE POLICY "store_members_update" ON store_members
  FOR UPDATE USING (
    store_id IN (
      SELECT id FROM stores WHERE partner_id IN (SELECT public.get_user_partner_ids())
    )
  );

-- DELETE: apenas quem gerencia o partner pode remover
DROP POLICY IF EXISTS "store_members_delete" ON store_members;
CREATE POLICY "store_members_delete" ON store_members
  FOR DELETE USING (
    store_id IN (
      SELECT id FROM stores WHERE partner_id IN (SELECT public.get_user_partner_ids())
    )
  );

COMMIT;
