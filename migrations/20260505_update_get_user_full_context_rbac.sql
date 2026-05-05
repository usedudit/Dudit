-- ============================================================================
-- 20260505: Update get_user_full_context() to DB-backed RBAC roles
-- - Removes hardcoded OWNER permission JSON
-- - Returns role_id + role permissions from roles table for invited access
-- - For owners, returns role_id='owner' and permissions as '{}' (owner override is code-side)
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
            p.store_name,
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
            p.store_name,
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

