-- ============================================================================
-- Fase 4 - Atualizar user_has_store_access para verificar store_members
-- ============================================================================
-- Agora a função verifica duas formas de acesso:
-- 1. Owner access: usuário é dono do partner (via partners.user_id)
-- 2. Member access: usuário tem store_member para a store
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.user_has_store_access(p_store_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM stores s
    WHERE s.id = p_store_id
    AND (
      -- Owner access: user owns the partner
      s.partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
      OR
      -- Member access: user has store_member record
      EXISTS (
        SELECT 1 FROM store_members sm
        JOIN partner_users pu ON pu.id = sm.partner_user_id
        WHERE sm.store_id = p_store_id
        AND pu.user_id = auth.uid()
      )
    )
  );
$$;

-- Atualizar também a RLS da tabela stores para usar a função atualizada
-- A stores_select atual usa get_user_partner_ids() que dá acesso a todas
-- as stores do partner. Precisamos restringir para apenas stores com acesso.
DROP POLICY IF EXISTS "stores_select" ON stores;
CREATE POLICY "stores_select" ON stores
  FOR SELECT USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
    OR id IN (
      SELECT sm.store_id FROM store_members sm
      JOIN partner_users pu ON pu.id = sm.partner_user_id
      WHERE pu.user_id = auth.uid()
    )
  );

COMMIT;
