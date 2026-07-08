-- ============================================================================
-- Migration: 20260528_quotes_approval_system.sql
-- Description: Complete public quotation approval system updates.
-- ============================================================================

-- ─── PART 1: ADD COLUMNS TO QUOTES ──────────────────────────────────────────
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS public_token UUID DEFAULT gen_random_uuid() UNIQUE,
  ADD COLUMN IF NOT EXISTS approval_code_salt TEXT,
  ADD COLUMN IF NOT EXISTS approval_code_hash TEXT,
  ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lockout_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lockout_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_viewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_views INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS viewer_ip TEXT,
  ADD COLUMN IF NOT EXISTS approver_ip TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS approval_method TEXT,
  ADD COLUMN IF NOT EXISTS approver_name TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS snapshot JSONB,
  ADD COLUMN IF NOT EXISTS snapshot_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS snapshot_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- ─── PART 2: STATUS CONSTRAINTS ─────────────────────────────────────────────
ALTER TABLE public.quotes
  DROP CONSTRAINT IF EXISTS quotes_status_check;

ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_status_check
  CHECK (status IN ('draft', 'sent', 'pending_client', 'viewed', 'approved', 'rejected', 'expired', 'cancelled', 'converted_to_order'));

-- ─── PART 3: HELPER FUNCTION FOR HASHING ────────────────────────────────────
CREATE OR REPLACE FUNCTION compute_approval_hash(salt TEXT, code TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  BEGIN
    RETURN encode(digest(salt || code, 'sha256'), 'hex');
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      RETURN encode(extensions.digest(salt || code, 'sha256'), 'hex');
    EXCEPTION WHEN OTHERS THEN
      RETURN md5(salt || code);
    END;
  END;
END;
$$;

-- ─── PART 4: POPULATE EXISTING QUOTES ───────────────────────────────────────
DO $$
DECLARE
  r RECORD;
  v_code TEXT;
  v_salt TEXT;
BEGIN
  FOR r IN SELECT id FROM public.quotes WHERE approval_code_hash IS NULL LOOP
    v_code := lpad(floor(random() * 10000)::text, 4, '0');
    v_salt := md5(random()::text);
    UPDATE public.quotes
    SET approval_code_salt = v_salt,
        approval_code_hash = compute_approval_hash(v_salt, v_code)
    WHERE id = r.id;
  END LOOP;
END $$;

-- ─── PART 5: RE-DEFINE set_quote_defaults TRIGGER ───────────────────────────
CREATE OR REPLACE FUNCTION set_quote_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_salt TEXT;
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;

  IF NEW.quote_number IS NULL OR NEW.quote_number = '' THEN
    NEW.quote_number := generate_quote_number();
  END IF;

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

-- ─── PART 6: RE-DEFINE lock_finalized_quote TRIGGER ─────────────────────────
CREATE OR REPLACE FUNCTION lock_finalized_quote()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.partner_id IS DISTINCT FROM OLD.partner_id
     OR NEW.quote_number IS DISTINCT FROM OLD.quote_number
     OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Campos imutáveis do orçamento não podem ser alterados';
  END IF;

  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
       OR NEW.expiration_date IS DISTINCT FROM OLD.expiration_date
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.discount_type IS DISTINCT FROM OLD.discount_type
       OR NEW.discount_value IS DISTINCT FROM OLD.discount_value
       OR NEW.shipping_cost IS DISTINCT FROM OLD.shipping_cost
       OR NEW.additional_costs IS DISTINCT FROM OLD.additional_costs
       OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
    THEN
      RAISE EXCEPTION 'Altere apenas o status nesta operação, sem mudar outros dados do orçamento.';
    END IF;

    IF OLD.status = 'sent' AND NEW.status NOT IN ('pending_client', 'viewed', 'approved', 'rejected', 'draft', 'cancelled', 'expired') THEN
      RAISE EXCEPTION 'Transição de status inválida para orçamento enviado';
    END IF;

    IF OLD.status = 'pending_client' AND NEW.status NOT IN ('viewed', 'approved', 'rejected', 'draft', 'cancelled', 'expired') THEN
      RAISE EXCEPTION 'Transição de status inválida para orçamento pendente';
    END IF;

    IF OLD.status = 'viewed' AND NEW.status NOT IN ('approved', 'rejected', 'draft', 'cancelled', 'expired') THEN
      RAISE EXCEPTION 'Transição de status inválida para orçamento visualizado';
    END IF;

    IF OLD.status = 'approved' AND NEW.status NOT IN ('expired', 'cancelled', 'converted_to_order') THEN
      RAISE EXCEPTION 'Orçamento aprovado só pode ser marcado como expirado, cancelado ou convertido em pedido';
    END IF;

    IF OLD.status = 'rejected' AND NEW.status NOT IN ('draft') THEN
      RAISE EXCEPTION 'Orçamento rejeitado só pode ser reaberto como rascunho';
    END IF;

    IF OLD.status = 'expired' AND NEW.status NOT IN ('draft') THEN
      RAISE EXCEPTION 'Orçamento expirado só pode ser reaberto como rascunho';
    END IF;

    IF OLD.status = 'cancelled' AND NEW.status NOT IN ('draft') THEN
      RAISE EXCEPTION 'Orçamento cancelado só pode ser reaberto como rascunho';
    END IF;

    IF OLD.status = 'converted_to_order' THEN
      RAISE EXCEPTION 'Orçamento convertido em pedido não pode ter seu status alterado';
    END IF;

    RETURN NEW;
  END IF;

  IF OLD.status IN ('pending_client', 'viewed', 'sent') THEN
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
       OR NEW.discount_type IS DISTINCT FROM OLD.discount_type
       OR NEW.discount_value IS DISTINCT FROM OLD.discount_value
       OR NEW.shipping_cost IS DISTINCT FROM OLD.shipping_cost
       OR NEW.additional_costs IS DISTINCT FROM OLD.additional_costs
       OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
    THEN
      RAISE EXCEPTION 'Orçamento enviado/pendente: não é permitido alterar dados financeiros ou comerciais. Reabra como rascunho.';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('approved', 'rejected', 'expired', 'cancelled', 'converted_to_order') THEN
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
       OR NEW.expiration_date IS DISTINCT FROM OLD.expiration_date
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.discount_type IS DISTINCT FROM OLD.discount_type
       OR NEW.discount_value IS DISTINCT FROM OLD.discount_value
       OR NEW.shipping_cost IS DISTINCT FROM OLD.shipping_cost
       OR NEW.additional_costs IS DISTINCT FROM OLD.additional_costs
       OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
    THEN
      RAISE EXCEPTION 'Orçamento finalizado: alterações de dados comerciais ou financeiros não são permitidas.';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- ─── PART 7: QUOTE INTERACTIONS TABLE ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quote_interactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id          UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  partner_id        UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  author_name       TEXT NOT NULL,
  author_role       TEXT NOT NULL CHECK (author_role IN ('customer', 'seller')),
  user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  message           TEXT NOT NULL,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_interactions_quote ON public.quote_interactions(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_interactions_partner ON public.quote_interactions(partner_id);

ALTER TABLE public.quote_interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qi_select_policy" ON public.quote_interactions;
CREATE POLICY "qi_select_policy" ON public.quote_interactions
  FOR SELECT USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid()
    )
  );

-- Block DELETE on quote_interactions permanently to maintain audit history
DROP POLICY IF EXISTS "qi_delete_policy" ON public.quote_interactions;
CREATE POLICY "qi_delete_policy" ON public.quote_interactions
  FOR DELETE USING (false);

-- ─── PART 8: TRANSACTIONAL VERIFICATION FUNCTIONS (RPCs) ────────────────────

-- approve_public_quote
CREATE OR REPLACE FUNCTION approve_public_quote(
  p_quote_id UUID,
  p_name TEXT,
  p_code TEXT,
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
  v_quote RECORD;
  v_lockout_until TIMESTAMPTZ;
  v_failed_attempts INTEGER;
  v_lockout_count INTEGER;
  v_hash TEXT;
  v_correct BOOLEAN := FALSE;
  v_lock_duration INTERVAL;
BEGIN
  -- 1. Acquire row lock (concurrency / race condition protection)
  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id FOR UPDATE;
  
  IF v_quote IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Orçamento não encontrado');
  END IF;
  
  -- Check status
  IF v_quote.status NOT IN ('sent', 'pending_client', 'viewed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Orçamento já finalizado ou não disponível para aprovação');
  END IF;
  
  -- Check lazy expiration
  IF v_quote.expiration_date IS NOT NULL AND v_quote.expiration_date < CURRENT_DATE THEN
    UPDATE quotes SET status = 'expired', updated_at = NOW() WHERE id = p_quote_id;
    RETURN jsonb_build_object('success', false, 'error', 'Orçamento expirado');
  END IF;
  
  -- 2. Validate Code if method is code
  IF p_method = 'code' THEN
    -- Check lockout
    IF v_quote.lockout_until IS NOT NULL AND v_quote.lockout_until > NOW() THEN
      RETURN jsonb_build_object('success', false, 'error', 'Muitas tentativas incorretas. Acesso bloqueado temporariamente.');
    END IF;
    
    -- Compute hash
    v_hash := compute_approval_hash(v_quote.approval_code_salt, p_code);
    
    IF v_hash = v_quote.approval_code_hash THEN
      v_correct := TRUE;
    ELSE
      v_failed_attempts := v_quote.failed_attempts + 1;
      v_lockout_count := v_quote.lockout_count;
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
      
      UPDATE quotes
      SET failed_attempts = v_failed_attempts,
          lockout_count = v_lockout_count,
          lockout_until = v_lockout_until,
          updated_at = NOW()
      WHERE id = p_quote_id;
      
      -- Insert failed audit log
      INSERT INTO audit_logs (table_name, partner_id, entity_type, entity_id, action_type, change_lines, source, metadata)
      VALUES (
        'quotes',
        v_quote.partner_id,
        'quote',
        p_quote_id,
        'quote_failed_attempt',
        ARRAY['Tentativa inválida de aprovação (código incorreto).'],
        'system',
        jsonb_build_object('ipAddress', p_ip, 'userAgent', p_ua, 'timestamp', NOW())
      );
      
      RETURN jsonb_build_object('success', false, 'error', 'Código de aprovação inválido');
    END IF;
  ELSE
    v_correct := TRUE;
  END IF;
  
  -- 3. Perform approval
  IF v_correct THEN
    UPDATE quotes
    SET status = 'approved',
        approved_at = NOW(),
        approver_ip = p_ip,
        user_agent = p_ua,
        approval_method = p_method,
        approver_name = p_name,
        failed_attempts = 0,
        lockout_until = NULL,
        lockout_count = 0,
        updated_at = NOW()
    WHERE id = p_quote_id;
    
    RETURN jsonb_build_object('success', true);
  END IF;
  
  RETURN jsonb_build_object('success', false, 'error', 'Erro desconhecido');
END;
$$;

-- reject_public_quote
CREATE OR REPLACE FUNCTION reject_public_quote(
  p_quote_id UUID,
  p_name TEXT,
  p_code TEXT,
  p_reason TEXT,
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
  v_quote RECORD;
  v_lockout_until TIMESTAMPTZ;
  v_failed_attempts INTEGER;
  v_lockout_count INTEGER;
  v_hash TEXT;
  v_correct BOOLEAN := FALSE;
  v_lock_duration INTERVAL;
BEGIN
  -- 1. Acquire row lock (concurrency / race condition protection)
  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id FOR UPDATE;
  
  IF v_quote IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Orçamento não encontrado');
  END IF;
  
  -- Check status
  IF v_quote.status NOT IN ('sent', 'pending_client', 'viewed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Orçamento já finalizado ou não disponível para recusa');
  END IF;
  
  -- Check lazy expiration
  IF v_quote.expiration_date IS NOT NULL AND v_quote.expiration_date < CURRENT_DATE THEN
    UPDATE quotes SET status = 'expired', updated_at = NOW() WHERE id = p_quote_id;
    RETURN jsonb_build_object('success', false, 'error', 'Orçamento expirado');
  END IF;
  
  -- 2. Validate Code if method is code
  IF p_method = 'code' THEN
    -- Check lockout
    IF v_quote.lockout_until IS NOT NULL AND v_quote.lockout_until > NOW() THEN
      RETURN jsonb_build_object('success', false, 'error', 'Muitas tentativas incorretas. Acesso bloqueado temporariamente.');
    END IF;
    
    -- Compute hash
    v_hash := compute_approval_hash(v_quote.approval_code_salt, p_code);
    
    IF v_hash = v_quote.approval_code_hash THEN
      v_correct := TRUE;
    ELSE
      v_failed_attempts := v_quote.failed_attempts + 1;
      v_lockout_count := v_quote.lockout_count;
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
      
      UPDATE quotes
      SET failed_attempts = v_failed_attempts,
          lockout_count = v_lockout_count,
          lockout_until = v_lockout_until,
          updated_at = NOW()
      WHERE id = p_quote_id;
      
      -- Insert failed audit log
      INSERT INTO audit_logs (table_name, partner_id, entity_type, entity_id, action_type, change_lines, source, metadata)
      VALUES (
        'quotes',
        v_quote.partner_id,
        'quote',
        p_quote_id,
        'quote_failed_attempt',
        ARRAY['Tentativa inválida de recusa (código incorreto).'],
        'system',
        jsonb_build_object('ipAddress', p_ip, 'userAgent', p_ua, 'timestamp', NOW())
      );
      
      RETURN jsonb_build_object('success', false, 'error', 'Código de aprovação inválido');
    END IF;
  ELSE
    v_correct := TRUE;
  END IF;
  
  -- 3. Perform rejection
  IF v_correct THEN
    UPDATE quotes
    SET status = 'rejected',
        rejected_at = NOW(),
        approver_ip = p_ip,
        user_agent = p_ua,
        approval_method = p_method,
        approver_name = p_name,
        rejection_reason = p_reason,
        failed_attempts = 0,
        lockout_until = NULL,
        lockout_count = 0,
        updated_at = NOW()
    WHERE id = p_quote_id;
    
    RETURN jsonb_build_object('success', true);
  END IF;
  
  RETURN jsonb_build_object('success', false, 'error', 'Erro desconhecido');
END;
$$;

-- ─── PART 9: SYSTEM INDEXES FOR SCALING ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_quotes_public_token ON public.quotes(public_token) WHERE public_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_status ON public.quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_approved_at ON public.quotes(approved_at) WHERE approved_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_expiration_date ON public.quotes(expiration_date);
CREATE INDEX IF NOT EXISTS idx_quotes_converted_order_id ON public.quotes(converted_order_id) WHERE converted_order_id IS NOT NULL;
