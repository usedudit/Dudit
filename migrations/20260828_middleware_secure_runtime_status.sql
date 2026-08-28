-- Consolidate protected-route runtime checks into one minimal, authenticated RPC.
-- The function intentionally returns only enforcement flags and public runtime
-- status; it never returns profile, membership, deletion or partner identifiers.

CREATE OR REPLACE FUNCTION public.get_secure_runtime_status(
    p_partner_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_banned_at timestamptz;
    v_banned_until timestamptz;
    v_user_deletion boolean := false;
    v_partner_access boolean := false;
    v_partner_deletion boolean := false;
    v_partner_status jsonb := NULL;
BEGIN
    -- Keep the function safe even if it is called without an authenticated JWT.
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'is_banned', false,
            'ban_expired', false,
            'user_deletion', false,
            'partner_access', false,
            'partner_deletion', false,
            'partner_status', NULL
        );
    END IF;

    SELECT up.banned_at, up.banned_until
      INTO v_banned_at, v_banned_until
      FROM public.user_profiles AS up
     WHERE up.user_id = v_user_id;

    -- Preserve the current immediate-deletion behavior: every status except
    -- completed blocks access until the deletion flow is fully finished.
    v_user_deletion := EXISTS (
        SELECT 1
          FROM public.account_deletions AS ad
         WHERE ad.user_id = v_user_id
           AND ad.status <> 'completed'
    );

    IF p_partner_id IS NOT NULL THEN
        -- A tampered active_partner_id must never expose partner state.
        v_partner_access := EXISTS (
            SELECT 1
              FROM public.partners AS p
             WHERE p.id = p_partner_id
               AND (
                   p.user_id = v_user_id
                   OR EXISTS (
                       SELECT 1
                         FROM public.partner_users AS pu
                        WHERE pu.partner_id = p_partner_id
                          AND pu.user_id = v_user_id
                   )
               )
        );

        IF v_partner_access THEN
            SELECT jsonb_build_object(
                       'is_active', p.is_active,
                       'erp_disabled', p.erp_disabled
                   )
              INTO v_partner_status
              FROM public.partners AS p
             WHERE p.id = p_partner_id;

            v_partner_deletion := EXISTS (
                SELECT 1
                  FROM public.account_deletions AS ad
                 WHERE ad.partner_id = p_partner_id
                   AND ad.status <> 'completed'
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'is_banned', v_banned_at IS NOT NULL
            AND (v_banned_until IS NULL OR v_banned_until > now()),
        'ban_expired', v_banned_at IS NOT NULL
            AND v_banned_until IS NOT NULL
            AND v_banned_until <= now(),
        'user_deletion', v_user_deletion,
        'partner_access', v_partner_access,
        'partner_deletion', v_partner_deletion,
        'partner_status', v_partner_status
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_secure_runtime_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_secure_runtime_status(uuid) TO authenticated;

-- Partial indexes match the exact active-deletion predicates used above.
CREATE INDEX IF NOT EXISTS idx_account_deletions_active_user
    ON public.account_deletions(user_id)
    WHERE status <> 'completed';

CREATE INDEX IF NOT EXISTS idx_account_deletions_active_partner
    ON public.account_deletions(partner_id)
    WHERE status <> 'completed';
