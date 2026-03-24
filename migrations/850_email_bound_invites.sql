-- ============================================================================
-- Migration: Email-Bound Invites & Enterprise Security
-- Enforces email on invitations, prevents duplicates, and adds atomic acceptance
-- ============================================================================

-- 1. Handle existing NULL emails before setting NOT NULL
UPDATE public.partner_invitations
SET email = 'legacy_' || substr(id::text, 1, 8) || '@migrated.local'
WHERE email IS NULL;

-- 2. Normalize existing emails (lowercase + trim)
UPDATE public.partner_invitations
SET email = lower(trim(email));

-- 3. Set NOT NULL constraint
ALTER TABLE public.partner_invitations
ALTER COLUMN email SET NOT NULL;

-- 4. Create unique conditional index to prevent duplicate pending invites
-- Allows multiple used/revoked invites for the same email, but only one pending.
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_invitations_unique_pending 
ON public.partner_invitations (partner_id, email) 
WHERE used_at IS NULL AND revoked_at IS NULL;

-- 5. Create the Atomic Acceptance RPC
-- Performs the consume + insert within a single blocking transaction
CREATE OR REPLACE FUNCTION accept_partner_invitation(
    p_invitation_id uuid,
    p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_invitation record;
    v_inviter_active boolean;
BEGIN
    -- Obter convite travando a linha (FOR UPDATE) para evitar race conditions simultâneas
    SELECT * INTO v_invitation
    FROM public.partner_invitations
    WHERE id = p_invitation_id
    FOR UPDATE;

    IF v_invitation IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Convite não encontrado.');
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

    -- Verificar se o criador do convite ainda pertence ao tenant
    SELECT EXISTS (
        SELECT 1 FROM public.partner_users
        WHERE partner_id = v_invitation.partner_id
          AND user_id = v_invitation.created_by_user_id
    ) INTO v_inviter_active;

    IF NOT v_inviter_active THEN
        RETURN jsonb_build_object('success', false, 'error', 'O membro que enviou este convite não faz mais parte da equipe, invalidando o link.');
    END IF;

    -- Marcar convite como usado
    UPDATE public.partner_invitations
    SET used_at = now(),
        used_by = p_user_id
    WHERE id = p_invitation_id;

    -- Inserir o novo usuário na equipe (ON CONFLICT DO NOTHING se ele já estiver)
    INSERT INTO public.partner_users (
        partner_id,
        user_id,
        role,
        permissions,
        created_by_user_id
    ) VALUES (
        v_invitation.partner_id,
        p_user_id,
        v_invitation.role,
        v_invitation.permissions,
        v_invitation.created_by_user_id
    ) ON CONFLICT (partner_id, user_id) DO NOTHING;

    RETURN jsonb_build_object('success', true, 'partner_id', v_invitation.partner_id);
END;
$$;
