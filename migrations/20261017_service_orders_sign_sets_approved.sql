-- ============================================================================
-- Migration: 20261017_service_orders_sign_sets_approved.sql
-- Description: Assinatura do cliente passa a aprovar a OS.
--   Quando a OS está em 'aberta' ou 'aguardando_aprovacao', a assinatura
--   (via código no portal público) muda o status para 'aprovada'.
--   Estados operacionais (em_andamento, etc.) são preservados.
-- Idempotente: CREATE OR REPLACE FUNCTION.
-- ============================================================================

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
  v_should_approve BOOLEAN := FALSE;
BEGIN
  -- 1. Acquire row lock
  SELECT * INTO v_so FROM service_orders WHERE id = p_so_id FOR UPDATE;

  IF v_so IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ordem de serviço não encontrada');
  END IF;

  -- Check status (if already completed/cancelled, is it editable?)
  IF v_so.status IN ('concluida', 'entregue', 'cancelada') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ordem de serviço já finalizada ou cancelada');
  END IF;

  -- 2. Validate Code if method is code, or user identity if method is auth
  IF p_method = 'code' THEN
    -- Check lockout
    IF v_so.lockout_until IS NOT NULL AND v_so.lockout_until > NOW() THEN
      RETURN jsonb_build_object('success', false, 'error', 'Muitas tentativas incorretas. Acesso bloqueado temporariamente.');
    END IF;

    -- Compute hash
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

      -- Insert failed audit log
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
    -- Verify the authenticated user is the assigned professional, creator, or a partner member
    IF auth.uid() = v_so.assigned_user_id OR auth.uid() = v_so.created_by OR EXISTS (
      SELECT 1 FROM public.partner_users pu WHERE pu.partner_id = v_so.partner_id AND pu.user_id = auth.uid()
    ) THEN
      v_correct := TRUE;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Você não tem permissão para assinar esta OS.');
    END IF;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Método de assinatura inválido');
  END IF;

  -- 3. Perform signature
  IF v_correct THEN
    v_should_approve := v_so.status IN ('aberta', 'aguardando_aprovacao');

    UPDATE service_orders
    SET signature_image_key = p_signature_key,
        signed_at = NOW(),
        failed_attempts = 0,
        lockout_until = NULL,
        lockout_count = 0,
        status = CASE WHEN v_should_approve THEN 'aprovada' ELSE status END,
        updated_at = NOW()
    WHERE id = p_so_id;

    -- Insert success audit log
    INSERT INTO audit_logs (table_name, action, partner_id, entity_type, entity_id, action_type, change_lines, source, metadata)
    VALUES (
      'service_orders',
      'SIGNED',
      v_so.partner_id,
      'service_order',
      p_so_id,
      'signed',
      ARRAY['OS assinada pelo cliente via portal público']
        || CASE WHEN v_should_approve
             THEN ARRAY['Status alterado: ' || v_so.status || ' → aprovada (assinatura do cliente)']
             ELSE ARRAY[]::text[] END,
      'system',
      jsonb_build_object('ipAddress', p_ip, 'userAgent', p_ua, 'timestamp', NOW(), 'approver_name', p_name)
    );

    RETURN jsonb_build_object('success', true);
  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'Erro desconhecido');
END;
$$;

NOTIFY pgrst, 'reload schema';
