-- Migration: 20260628_service_orders_approval_system.sql
-- Description: Add public signature security columns and RPCs to service orders.

-- Part 1: Add columns to service_orders
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS approval_code_salt TEXT,
  ADD COLUMN IF NOT EXISTS approval_code_hash TEXT,
  ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lockout_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lockout_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Part 2: Trigger/Function to set defaults (e.g. public_token if missing, and code)
CREATE OR REPLACE FUNCTION set_service_order_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_salt TEXT;
BEGIN
  IF NEW.public_token IS NULL THEN
    NEW.public_token := gen_random_uuid();
  END IF;

  IF NEW.approval_code_hash IS NULL THEN
    v_code := lpad(floor(random() * 10000)::text, 4, '0');
    v_salt := md5(random()::text);
    NEW.approval_code_salt := v_salt;
    NEW.approval_code_hash := compute_approval_hash(v_salt, v_code);
    NEW.metadata := jsonb_set(COALESCE(NEW.metadata, '{}'::jsonb), '{plain_code}', to_jsonb(v_code));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_service_order_defaults ON public.service_orders;
CREATE TRIGGER trg_set_service_order_defaults
  BEFORE INSERT ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION set_service_order_defaults();

-- Part 3: Populate existing service orders
DO $$
DECLARE
  r RECORD;
  v_code TEXT;
  v_salt TEXT;
BEGIN
  FOR r IN SELECT id FROM public.service_orders WHERE approval_code_hash IS NULL LOOP
    v_code := lpad(floor(random() * 10000)::text, 4, '0');
    v_salt := md5(random()::text);
    UPDATE public.service_orders
    SET approval_code_salt = v_salt,
        approval_code_hash = compute_approval_hash(v_salt, v_code),
        metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{plain_code}', to_jsonb(v_code))
    WHERE id = r.id;
  END LOOP;
END $$;

-- Part 4: sign_public_service_order RPC
CREATE OR REPLACE FUNCTION sign_public_service_order(
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
SET search_path = public
AS $$
DECLARE
  v_so RECORD;
  v_lockout_until TIMESTAMPTZ;
  v_failed_attempts INTEGER;
  v_lockout_count INTEGER;
  v_hash TEXT;
  v_correct BOOLEAN := FALSE;
  v_lock_duration INTERVAL;
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
    UPDATE service_orders
    SET signature_image_key = p_signature_key,
        signed_at = NOW(),
        failed_attempts = 0,
        lockout_until = NULL,
        lockout_count = 0,
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
      ARRAY['OS assinada pelo cliente via portal público'],
      'system',
      jsonb_build_object('ipAddress', p_ip, 'userAgent', p_ua, 'timestamp', NOW(), 'approver_name', p_name)
    );
    
    RETURN jsonb_build_object('success', true);
  END IF;
  
  RETURN jsonb_build_object('success', false, 'error', 'Erro desconhecido');
END;
$$;
