-- ============================================================================
-- Migration: Paranoid Invitation Hardening
-- Adds brute-force protection, role validation in RPC, and performance indexes
-- ============================================================================

-- 1. Add brute-force tracking columns
ALTER TABLE public.partner_invitations
ADD COLUMN IF NOT EXISTS failed_attempts INT DEFAULT 0;

ALTER TABLE public.partner_invitations
ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Performance index on token_hash for fast lookups
CREATE INDEX IF NOT EXISTS idx_partner_invitations_token_hash
ON public.partner_invitations (token_hash);

-- 3. Performance index for listing invitations per tenant
CREATE INDEX IF NOT EXISTS idx_partner_invitations_partner_created
ON public.partner_invitations (partner_id, created_at DESC);

-- 4. RPC: Atomic increment of failed attempts + auto-lock after 5 failures
CREATE OR REPLACE FUNCTION increment_invite_failed_attempts(
    p_invitation_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_attempts INT;
BEGIN
    UPDATE public.partner_invitations
    SET failed_attempts = failed_attempts + 1
    WHERE id = p_invitation_id
      AND used_at IS NULL
      AND revoked_at IS NULL
      AND locked_at IS NULL
    RETURNING failed_attempts INTO v_attempts;

    IF v_attempts IS NULL THEN
        RETURN jsonb_build_object('locked', false, 'attempts', 0);
    END IF;

    -- Auto-lock after 5 failed attempts
    IF v_attempts >= 5 THEN
        UPDATE public.partner_invitations
        SET locked_at = now()
        WHERE id = p_invitation_id;

        RETURN jsonb_build_object('locked', true, 'attempts', v_attempts);
    END IF;

    RETURN jsonb_build_object('locked', false, 'attempts', v_attempts);
END;
$$;

-- 5. Updated accept RPC with role validation and lock check
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
    v_valid_roles text[] := ARRAY['OWNER','ADMIN','MANAGER','OPERATOR','DELIVERY','VIEWER'];
BEGIN
    -- Lock row to prevent race conditions
    SELECT * INTO v_invitation
    FROM public.partner_invitations
    WHERE id = p_invitation_id
    FOR UPDATE;

    IF v_invitation IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Convite não encontrado.');
    END IF;

    -- Check lock status (brute-force protection)
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

    -- Validate role is in the allowed set (prevent privilege injection)
    IF NOT (v_invitation.role = ANY(v_valid_roles)) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cargo inválido no convite.');
    END IF;

    -- Verify inviter is still active in the tenant
    SELECT EXISTS (
        SELECT 1 FROM public.partner_users
        WHERE partner_id = v_invitation.partner_id
          AND user_id = v_invitation.created_by_user_id
    ) INTO v_inviter_active;

    IF NOT v_inviter_active THEN
        RETURN jsonb_build_object('success', false, 'error', 'O membro que enviou este convite não faz mais parte da equipe.');
    END IF;

    -- Consume the invitation
    UPDATE public.partner_invitations
    SET used_at = now(),
        used_by = p_user_id
    WHERE id = p_invitation_id;

    -- Insert user into the team
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
