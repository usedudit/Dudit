-- ============================================================================
-- Migration: Fix accept_partner_invitation (role_id + store_members) & backfill
-- ============================================================================
-- Problemas corrigidos:
-- 1. O RPC só gravava a coluna legacy `role` (ex.: 'OPERATOR') e nunca `role_id`,
--    que ficava com DEFAULT 'delivery'. A aplicação lê `role_id` (lowercase) para
--    autorização/exibição -> qualquer convidado virava "Entregador".
-- 2. O RPC não criava store_members -> o convidado aparecia no time, mas não
--    ganhava acesso a nenhuma loja (não aparecia no /select-erp).
-- 3. Backfill dos dados existentes já quebrados (role_id errado + membros sem
--    store_members) usando o mesmo padrão da migração f4_migrate_partner_users_to_store_members.
-- ============================================================================

-- 1. RPC v2: grava role_id (canônico, lowercase) + cria store_members de forma atômica
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

    -- Canonical role_id (lowercase). Convites legados podem ter role_id NULL/vazio
    -- ou roles legacy não canônicos (EDITOR/VIEWER) que não existem na tabela roles.
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

    -- Safety net: role_id deve ser um id existente na tabela roles (FK)
    IF v_role_id NOT IN ('owner', 'admin', 'manager', 'operator', 'delivery') THEN
        v_role_id := 'delivery';
    END IF;

    -- Consume the invitation
    UPDATE public.partner_invitations
    SET used_at = now(),
        used_by = p_user_id
    WHERE id = p_invitation_id;

    -- Insert user into the team (role_id is the canonical column; `role` kept for legacy)
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
    ) ON CONFLICT (partner_id, user_id) DO NOTHING;

    -- Create store_members atomically (same transaction) so the invited user
    -- immediately gains store-level access (select-erp depends on store_members).
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
            -- Fallback: headquarters store (or first store) of the partner
            INSERT INTO public.store_members (partner_user_id, store_id, role, permissions)
            SELECT v_partner_user_id, s.id, v_invitation.role, v_invitation.permissions
            FROM public.stores s
            WHERE s.partner_id = v_invitation.partner_id
            ORDER BY s.is_headquarters DESC NULLS LAST, s.created_at ASC
            LIMIT 1
            ON CONFLICT (partner_user_id, store_id) DO NOTHING;
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'partner_id', v_invitation.partner_id);
END;
$$;

-- Re-apply hardened search_path for the replaced function (idempotent)
DO $$
BEGIN
    ALTER FUNCTION public.accept_partner_invitation(uuid, uuid) SET search_path = public, extensions, pg_temp;
EXCEPTION WHEN undefined_function THEN NULL;
END;
$$;

-- 2. Backfill: corrigir role_id que caiu no DEFAULT 'delivery' quando a coluna
--    legacy `role` diz outra coisa (membros aceitos pelo RPC antigo)
UPDATE public.partner_users pu
SET role_id = CASE UPPER(COALESCE(pu.role, ''))
    WHEN 'OWNER' THEN 'owner'
    WHEN 'ADMIN' THEN 'admin'
    WHEN 'MANAGER' THEN 'manager'
    WHEN 'OPERATOR' THEN 'operator'
    WHEN 'DELIVERY' THEN 'delivery'
    WHEN 'EDITOR' THEN 'operator'
    WHEN 'VIEWER' THEN 'delivery'
    ELSE pu.role_id
END
WHERE pu.role_id = 'delivery'
  AND UPPER(COALESCE(pu.role, '')) IN ('OWNER','ADMIN','MANAGER','OPERATOR','DELIVERY','EDITOR','VIEWER');

-- 3. Backfill: criar store_members para membros sem nenhum acesso de loja
--    (loja matriz is_headquarters, ou a primeira loja do parceiro).
--    Owners não precisam (bypass via resolveEffectivePermissions) e têm cobertura
--    própria no /select-erp via partners.user_id.
INSERT INTO store_members (partner_user_id, store_id, role, permissions)
SELECT
    pu.id,
    s.id,
    pu.role,
    pu.permissions
FROM public.partner_users pu
JOIN public.stores s
  ON s.partner_id = pu.partner_id
 AND s.id = (
     SELECT COALESCE(
         (SELECT id FROM public.stores
          WHERE partner_id = pu.partner_id AND is_headquarters = true
          ORDER BY created_at ASC LIMIT 1),
         (SELECT id FROM public.stores
          WHERE partner_id = pu.partner_id
          ORDER BY created_at ASC LIMIT 1)
     )
 )
WHERE pu.role_id <> 'owner'
AND NOT EXISTS (
    SELECT 1 FROM store_members sm
    WHERE sm.partner_user_id = pu.id
)
AND EXISTS (SELECT 1 FROM public.stores WHERE partner_id = pu.partner_id)
AND NOT EXISTS (
    SELECT 1 FROM store_members sm2
    WHERE sm2.partner_user_id = pu.id AND sm2.store_id = s.id
);
