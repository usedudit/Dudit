-- ============================================================================
-- Fase 3 - Função auxiliar user_has_store_access para RLS
-- ============================================================================
-- Cria uma função SECURITY DEFINER que verifica se o usuário autenticado
-- tem acesso a uma store específica.
--
-- Em Fase 3 (antes de store_members existir), a função verifica apenas
-- se o usuário tem acesso ao partner da store via get_user_partner_ids().
-- Em Fase 4, esta função será expandida para também consultar store_members.
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
    AND s.partner_id IN (SELECT public.get_user_partner_ids())
  );
$$;

COMMIT;
