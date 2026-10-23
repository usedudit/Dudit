-- ============================================================================
-- Migration: 20261017_service_orders_approval_split.sql
-- Description: Separa APROVAÇÃO de ASSINATURA na Ordem de Serviço.
--   - Nova RPC approve_public_service_order: valida código/identidade e muda o
--     status para 'aprovada' (autorização pré-execução), registrando o
--     aprovador em metadata (approver_name + approved_at) e auditando 'approved'.
--   - sign_public_service_order passa a registrar SOMENTE a assinatura de
--     aceite, sem alterar o status, e só é permitida quando a OS está
--     concluída/entregue. Adiciona o método 'trusted' (assinatura sem código
--     quando a OS já foi aprovada pelo portal).
-- Idempotente: CREATE OR REPLACE FUNCTION.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) APROVAÇÃO (autorização pré-execução)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_public_service_order(
  p_so_id UUID,
  p_name TEXT,
  p_code TEXT,
  p_ip TEXT,
  p_ua TEXT,
  p_method TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_so RECORD;
  v_lockout_until TIMESTAMPTZ;
  v_failed_attempts INTEGER;
  v_lockout_count INTEGER;
  v_hash TEXT;
  v_correct BOOLEAN := FALSE;
  v_lock_duration INTERVAL;
  v_display_name TEXT;
BEGIN
  -- 1. Acquire row lock
  SELECT * INTO v_so FROM service_orders WHERE id = p_so_id FOR UPDATE;

  IF v_so IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ordem de serviço não encontrada');
  END IF;

  IF v_so.status NOT IN ('aberta', 'aguardando_aprovacao') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta ordem de serviço não está mais aguardando aprovação');
  END IF;

  IF v_so.signature_image_key IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta ordem de serviço já foi assinada.');
  END IF;

  -- 2. Validate Code / identity
  IF p_method = 'code' THEN
    IF v_so.lockout_until IS NOT NULL AND v_so.lockout_until > NOW() THEN
      RETURN jsonb_build_object('success', false, 'error', 'Muitas tentativas incorretas. Acesso bloqueado temporariamente.');
    END IF;

    v_hash := compute_approval_hash(v_so.approval_code_salt, p_code);

    IF v_hash = v_so.approval_code_hash THEN
      v_correct := TRUE;
    ELSE
      v_failed_attempts := v_so.failed_attempts + 1;
      v_lockout_count := v_so.lockout_count;
      v_lockout_until := NULL;

      IF v_failed_attempts >= 5 THEN
        v_lockout_count := v_lockout_count + 1;
        IF v_lockout_count > 1 THEN
          v_lock_duration := INTERVAL '1 hour';
        ELSE
          v_lock_duration := INTERVAL '15 minutes';
        END IF;
        v_lockout_until := NOW() + v_lock_duration;
        v_failed_attempts := 0;
      END IF;

      UPDATE service_orders
      SET failed_attempts = v_failed_attempts,
          lockout_count = v_lockout_count,
          lockout_until = v_lockout_until,
          updated_at = NOW()
      WHERE id = p_so_id;

      INSERT INTO audit_logs (table_name, action, partner_id, entity_type, entity_id, action_type, change_lines, source, metadata)
      VALUES (
        'service_orders',
        'FAILED_APPROVAL_ATTEMPT',
        v_so.partner_id,
        'service_order',
        p_so_id,
        'service_order_failed_approval_attempt',
        ARRAY['Tentativa inválida de aprovação (código incorreto).'],
        'system',
        jsonb_build_object('ipAddress', p_ip, 'userAgent', p_ua, 'timestamp', NOW())
      );

      RETURN jsonb_build_object('success', false, 'error', 'Código de aprovação inválido');
    END IF;
  ELSIF p_method = 'auth' THEN
    IF auth.uid() = v_so.assigned_user_id OR auth.uid() = v_so.created_by OR EXISTS (
      SELECT 1 FROM public.partner_users pu WHERE pu.partner_id = v_so.partner_id AND pu.user_id = auth.uid()
    ) THEN
      v_correct := TRUE;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Você não tem permissão para aprovar esta OS.');
    END IF;
  ELSIF p_method = 'trusted' THEN
    v_correct := TRUE;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Método de aprovação inválido');
  END IF;

  -- 3. Perform approval
  IF v_correct THEN
    v_display_name := NULLIF(btrim(COALESCE(p_name, '')), '');

    UPDATE service_orders
    SET status = 'aprovada',
        failed_attempts = 0,
        lockout_until = NULL,
        lockout_count = 0,
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'approver_name', COALESCE(v_display_name, 'Cliente'),
          'approved_at', NOW()::text
        ),
        updated_at = NOW()
    WHERE id = p_so_id;

    INSERT INTO audit_logs (table_name, action, partner_id, entity_type, entity_id, action_type, change_lines, source, metadata)
    VALUES (
      'service_orders',
      'APPROVED',
      v_so.partner_id,
      'service_order',
      p_so_id,
      'approved',
      ARRAY['OS aprovada pelo cliente via portal público', 'Status alterado: ' || v_so.status || ' → aprovada'],
      'system',
      jsonb_build_object('ipAddress', p_ip, 'userAgent', p_ua, 'timestamp', NOW(), 'approver_name', COALESCE(v_display_name, 'Cliente'))
    );

    RETURN jsonb_build_object('success', true);
  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'Erro desconhecido');
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) ASSINATURA (aceite na conclusão - não altera status)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sign_public_service_order(
  p_so_id UUID,
  p_name TEXT,
  p_code TEXT,
  p_signature_key TEXT,
  p_ip TEXT,
  p_ua TEXT,
  p_method TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_so RECORD;
  v_lockout_until TIMESTAMPTZ;
  v_failed_attempts INTEGER;
  v_lockout_count INTEGER;
  v_hash TEXT;
  v_correct BOOLEAN := FALSE;
  v_lock_duration INTERVAL;
  v_display_name TEXT;
BEGIN
  -- 1. Acquire row lock
  SELECT * INTO v_so FROM service_orders WHERE id = p_so_id FOR UPDATE;

  IF v_so IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ordem de serviço não encontrada');
  END IF;

  IF v_so.signature_image_key IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta ordem de serviço já possui assinatura registrada.');
  END IF;

  IF v_so.status IN ('concluida', 'entregue') IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'A assinatura está disponível apenas após a conclusão do serviço.');
  END IF;

  -- 2. Validate Code / identity
  IF p_method = 'code' THEN
    IF v_so.lockout_until IS NOT NULL AND v_so.lockout_until > NOW() THEN
      RETURN jsonb_build_object('success', false, 'error', 'Muitas tentativas incorretas. Acesso bloqueado temporariamente.');
    END IF;

    v_hash := compute_approval_hash(v_so.approval_code_salt, p_code);

    IF v_hash = v_so.approval_code_hash THEN
      v_correct := TRUE;
    ELSE
      v_failed_attempts := v_so.failed_attempts + 1;
      v_lockout_count := v_so.lockout_count;
      v_lockout_until := NULL;

      IF v_failed_attempts >= 5 THEN
        v_lockout_count := v_lockout_count + 1;
        IF v_lockout_count > 1 THEN
          v_lock_duration := INTERVAL '1 hour';
        ELSE
          v_lock_duration := INTERVAL '15 minutes';
        END IF;
        v_lockout_until := NOW() + v_lock_duration;
        v_failed_attempts := 0;
      END IF;

      UPDATE service_orders
      SET failed_attempts = v_failed_attempts,
          lockout_count = v_lockout_count,
          lockout_until = v_lockout_until,
          updated_at = NOW()
      WHERE id = p_so_id;

      INSERT INTO audit_logs (table_name, action, partner_id, entity_type, entity_id, action_type, change_lines, source, metadata)
      VALUES (
        'service_orders',
        'FAILED_SIGNATURE_ATTEMPT',
        v_so.partner_id,
        'service_order',
        p_so_id,
        'service_order_failed_signature_attempt',
        ARRAY['Tentativa inválida de assinatura (código incorreto).'],
        'system',
        jsonb_build_object('ipAddress', p_ip, 'userAgent', p_ua, 'timestamp', NOW())
      );

      RETURN jsonb_build_object('success', false, 'error', 'Código de assinatura inválido');
    END IF;
  ELSIF p_method = 'auth' THEN
    IF auth.uid() = v_so.assigned_user_id OR auth.uid() = v_so.created_by OR EXISTS (
      SELECT 1 FROM public.partner_users pu WHERE pu.partner_id = v_so.partner_id AND pu.user_id = auth.uid()
    ) THEN
      v_correct := TRUE;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Você não tem permissão para assinar esta OS.');
    END IF;
  ELSIF p_method = 'trusted' THEN
    -- Permitido quando a OS já foi aprovada previamente pelo portal
    IF (v_so.metadata ? 'approved_at') THEN
      v_correct := TRUE;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Código de assinatura obrigatório.');
    END IF;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Método de assinatura inválido');
  END IF;

  -- 3. Perform signature (não altera status)
  IF v_correct THEN
    v_display_name := NULLIF(btrim(COALESCE(p_name, '')), '');

    UPDATE service_orders
    SET signature_image_key = p_signature_key,
        signed_at = NOW(),
        failed_attempts = 0,
        lockout_until = NULL,
        lockout_count = 0,
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('approver_name', COALESCE(v_display_name, 'Cliente')),
        updated_at = NOW()
    WHERE id = p_so_id;

    INSERT INTO audit_logs (table_name, action, partner_id, entity_type, entity_id, action_type, change_lines, source, metadata)
    VALUES (
      'service_orders',
      'SIGNED',
      v_so.partner_id,
      'service_order',
      p_so_id,
      'signed',
      ARRAY['OS assinada pelo cliente via portal público'],
      'system',
      jsonb_build_object('ipAddress', p_ip, 'userAgent', p_ua, 'timestamp', NOW(), 'approver_name', COALESCE(v_display_name, 'Cliente'))
    );

    RETURN jsonb_build_object('success', true);
  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'Erro desconhecido');
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_public_service_order(uuid, text, text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sign_public_service_order(uuid, text, text, text, text, text, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
