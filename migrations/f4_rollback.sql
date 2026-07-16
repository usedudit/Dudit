-- ============================================================================
-- Fase 4 - Rollback
-- ============================================================================
-- Reverte todas as alterações da Fase 4 (Store Members).
-- ============================================================================

BEGIN;

-- 1. Restaurar stores_select RLS para o padrão Fase 3 (get_user_partner_ids)
DROP POLICY IF EXISTS "stores_select" ON stores;
CREATE POLICY "stores_select" ON stores
  FOR SELECT USING (
    partner_id IN (SELECT public.get_user_partner_ids())
  );

-- 2. Restaurar user_has_store_access para o padrão Fase 3 (apenas partner-level)
CREATE OR REPLACE FUNCTION public.user_has_store_access(p_store_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM stores s
    WHERE s.id = p_store_id
    AND s.partner_id IN (SELECT public.get_user_partner_ids())
  );
$$;

-- 3. Remover tabela store_members (cuidado: perde dados)
DROP TABLE IF EXISTS store_members CASCADE;

COMMIT;
