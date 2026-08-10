-- ============================================================================
-- Migration: 20260810_fix_invitation_all_stores_and_backfill
-- ============================================================================
-- 1. Updates accept_partner_invitation RPC so invited users without explicit
--    store restrictions (_store_ids_) receive access to ALL stores of the partner.
-- 2. Backfills store_members for existing invited team members who were previously
--    restricted to only headquarters due to the old LIMIT 1 logic.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.accept_partner_invitation(
    p_invitation_id uuid,
    p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_invitation record;
    v_inviter_active boolean;
    v_valid_roles text[] := ARRAY['OWNER','ADMIN','MANAGER','OPERATOR','DELIVERY','VIEWER'];
    v_role_id text;
    v_partner_user_id uuid;
    v_has_store_ids boolean;
BEGIN
    SELECT * INTO v_invitation
    FROM public.partner_invitations
    WHERE id = p_invitation_id
    FOR UPDATE;

    IF v_invitation IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Convite não encontrado.');
    END IF;

    IF v_invitation.locked_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Convite bloqueado por tentativas excessivas.');
    END IF;

    IF v_invitation.used_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Este convite já foi utilizado.');
    END IF;

    IF v_invitation.revoked_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Este convite foi revogado.');
    END IF;

    IF v_invitation.expires_at < now() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Este convite expirou.');
    END IF;

    IF NOT (v_invitation.role = ANY(v_valid_roles)) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cargo inválido no convite.');
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.partner_users
        WHERE partner_id = v_invitation.partner_id
          AND user_id = v_invitation.created_by_user_id
    ) INTO v_inviter_active;

    IF NOT v_inviter_active THEN
        RETURN jsonb_build_object('success', false, 'error', 'O membro que enviou este convite não faz mais parte da equipe.');
    END IF;

    IF btrim(COALESCE(v_invitation.role_id, '')) = '' THEN
        v_role_id := CASE UPPER(COALESCE(v_invitation.role, ''))
            WHEN 'OWNER' THEN 'owner'
            WHEN 'ADMIN' THEN 'admin'
            WHEN 'MANAGER' THEN 'manager'
            WHEN 'OPERATOR' THEN 'operator'
            WHEN 'DELIVERY' THEN 'delivery'
            WHEN 'EDITOR' THEN 'operator'
            WHEN 'VIEWER' THEN 'delivery'
            ELSE 'delivery'
        END;
    ELSE
        v_role_id := lower(btrim(v_invitation.role_id));
    END IF;

    IF v_role_id NOT IN ('owner', 'admin', 'manager', 'operator', 'delivery') THEN
        v_role_id := 'delivery';
    END IF;

    UPDATE public.partner_invitations
    SET used_at = now(),
        used_by = p_user_id
    WHERE id = p_invitation_id;

    INSERT INTO public.partner_users (
        partner_id,
        user_id,
        role,
        role_id,
        permissions,
        created_by_user_id
    ) VALUES (
        v_invitation.partner_id,
        p_user_id,
        v_invitation.role,
        v_role_id,
        v_invitation.permissions,
        v_invitation.created_by_user_id
    ) ON CONFLICT (partner_id, user_id) DO UPDATE
    SET role = EXCLUDED.role,
        role_id = EXCLUDED.role_id;

    SELECT id INTO v_partner_user_id
    FROM public.partner_users
    WHERE partner_id = v_invitation.partner_id
      AND user_id = p_user_id;

    IF v_partner_user_id IS NOT NULL THEN
        v_has_store_ids := (
            jsonb_typeof(COALESCE(v_invitation.permissions, '{}'::jsonb) -> '_store_ids_') = 'array'
        );

        IF v_has_store_ids THEN
            -- Explicit store list from the invitation
            INSERT INTO public.store_members (partner_user_id, store_id, role, permissions)
            SELECT v_partner_user_id, t.store_id, v_invitation.role, v_invitation.permissions
            FROM (
                SELECT (jsonb_array_elements_text(
                    COALESCE(v_invitation.permissions, '{}'::jsonb) -> '_store_ids_'
                ))::uuid AS store_id
            ) t
            ON CONFLICT (partner_user_id, store_id) DO NOTHING;
        ELSE
            -- Default: ALL stores of the partner
            INSERT INTO public.store_members (partner_user_id, store_id, role, permissions)
            SELECT v_partner_user_id, s.id, v_invitation.role, v_invitation.permissions
            FROM public.stores s
            WHERE s.partner_id = v_invitation.partner_id
            ON CONFLICT (partner_user_id, store_id) DO NOTHING;
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'partner_id', v_invitation.partner_id);
END;
$$;

-- Backfill: Ensure all invited team members without explicit _store_ids_ have store_members for ALL stores of their partner
INSERT INTO public.store_members (partner_user_id, store_id, role, permissions)
SELECT pu.id, s.id, pu.role, pu.permissions
FROM public.partner_users pu
JOIN public.stores s ON s.partner_id = pu.partner_id
WHERE pu.role_id <> 'owner'
  AND jsonb_typeof(COALESCE(pu.permissions, '{}'::jsonb) -> '_store_ids_') IS DISTINCT FROM 'array'
ON CONFLICT (partner_user_id, store_id) DO NOTHING;

COMMIT;
