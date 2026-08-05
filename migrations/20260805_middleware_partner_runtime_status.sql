-- ============================================================================
-- Migration: Middleware partner runtime status (works for team members)
-- ============================================================================
-- O middleware valida o active_partner_id consultando partner_users com um
-- join `partners!inner(is_active, erp_disabled)`. Porém a RLS de partners
-- (partners_select_own) só expõe a linha do partner ao DONO — para membros
-- convidados o inner join descarta a linha e o middleware conclui
-- "has no access to partner", limpando o cookie e impedindo o acesso ao ERP.
--
-- Esta RPC retorna APENAS is_active/erp_disabled (não expõe dados do partner)
-- e só responde para quem é dono ou membro (partner_users). Mantém a proteção
-- MED-04: quem manipular o cookie sem ser membro continua recebendo null.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_partner_runtime_status(
    p_partner_id uuid
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT to_jsonb(p) FROM (
        SELECT is_active, erp_disabled
        FROM public.partners
        WHERE id = p_partner_id
          AND (
            user_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM public.partner_users
                WHERE partner_id = p_partner_id AND user_id = auth.uid()
            )
          )
    ) p;
$$;

-- Exposição mínima: apenas autenticados podem chamar; anon/public não.
REVOKE EXECUTE ON FUNCTION public.get_partner_runtime_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_partner_runtime_status(uuid) TO authenticated;
