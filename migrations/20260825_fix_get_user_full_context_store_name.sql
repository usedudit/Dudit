-- ============================================================================
-- Fix: get_user_full_context() ainda referenciava partners.store_name
-- ============================================================================
-- A coluna store_name foi removida da tabela partners
-- (ver migration 20260729_clean_partners_schema.sql) e agora vive apenas em
-- stores.name.
--
-- Como get_user_full_context() é SECURITY DEFINER e é invocada por policies
-- RLS, qualquer query que disparava essas políticas quebrava com:
--   "column partners.store_name does not exist"
--
-- Fix: substituir p.store_name por lookup na tabela stores.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION get_user_full_context()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result JSONB;
    req_user_id UUID := auth.uid();
BEGIN
    IF req_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    WITH user_owned AS (
        SELECT
            p.id as partner_id,
            req_user_id as user_id,
            'owner'::text as role_id,
            '{}'::jsonb as permissions,
            (
                SELECT s.name
                FROM stores s
                WHERE s.partner_id = p.id
                ORDER BY s.is_headquarters DESC NULLS LAST, s.created_at ASC
                LIMIT 1
            ) as store_name,
            'Você' as owner_name,
            p.business_info
        FROM partners p
        WHERE p.user_id = req_user_id
    ),
    user_invited AS (
        SELECT
            pu.partner_id,
            req_user_id as user_id,
            pu.role_id,
            COALESCE(r.permissions, '{}'::jsonb) as permissions,
            (
                SELECT s.name
                FROM stores s
                WHERE s.partner_id = p.id
                ORDER BY s.is_headquarters DESC NULLS LAST, s.created_at ASC
                LIMIT 1
            ) as store_name,
            COALESCE(up.full_name, 'Desconhecido') as owner_name,
            p.business_info
        FROM partner_users pu
        JOIN partners p ON p.id = pu.partner_id
        LEFT JOIN user_profiles up ON up.user_id = p.user_id
        LEFT JOIN roles r ON r.id = pu.role_id
        WHERE pu.user_id = req_user_id
    )
    SELECT jsonb_agg(combined)
    INTO result
    FROM (
        SELECT * FROM user_owned
        UNION ALL
        SELECT * FROM user_invited ui
        WHERE NOT EXISTS (
            SELECT 1 FROM user_owned uo
            WHERE uo.partner_id = ui.partner_id
        )
    ) combined;

    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

COMMIT;
