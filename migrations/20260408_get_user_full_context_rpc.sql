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
            'OWNER' as role,
            '{"products": {"view": true, "create": true, "edit": true, "delete": true}, "services": {"view": true, "create": true, "edit": true, "delete": true}, "orders": {"view": true, "create": true, "edit": true, "delete": true}, "financial": {"view": true, "create": true, "edit": true, "delete": true}, "customers": {"view": true, "create": true, "edit": true, "delete": true}, "quotes": {"view": true, "create": true, "edit": true, "delete": true}}'::jsonb as permissions,
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
            pu.role,
            pu.permissions,
            p.store_name,
            COALESCE(up.full_name, 'Desconhecido') as owner_name,
            p.business_info
        FROM partner_users pu
        JOIN partners p ON p.id = pu.partner_id
        LEFT JOIN user_profiles up ON up.user_id = p.user_id
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