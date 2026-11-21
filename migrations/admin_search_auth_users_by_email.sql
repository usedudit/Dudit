-- Admin helper RPC to search auth.users by partial email (case-insensitive)
-- Restricted strictly to service_role (used by server-side admin actions only).

CREATE OR REPLACE FUNCTION public.admin_search_auth_users_by_email(
    search_term text,
    max_results int DEFAULT 50
)
RETURNS TABLE (
    user_id uuid,
    email text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
    SELECT u.id AS user_id, u.email::text AS email
    FROM auth.users u
    WHERE u.email ILIKE '%' || replace(replace(replace(trim(search_term), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    ORDER BY u.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(max_results, 50), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.admin_search_auth_users_by_email(text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_search_auth_users_by_email(text, int) FROM anon;
REVOKE ALL ON FUNCTION public.admin_search_auth_users_by_email(text, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search_auth_users_by_email(text, int) TO service_role;
