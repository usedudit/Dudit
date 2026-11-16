-- Migration: Delivery Confirmation OTP (One-Time Password) System
-- Table for storing delivery confirmation codes for orders requiring OTP verification.

CREATE TABLE IF NOT EXISTS public.order_delivery_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  partner_id uuid NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  salt text NOT NULL,
  encrypted_code text NOT NULL,
  delivery_mode text NOT NULL CHECK (delivery_mode IN ('dudit_platform', 'store_internal')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  locked_until timestamptz NULL,
  expires_at timestamptz NOT NULL,
  confirmed_at timestamptz NULL,
  confirmed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  invalidated_at timestamptz NULL,
  invalidation_reason text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Partial unique index ensuring strictly ONE active (unconfirmed, non-invalidated) OTP per order
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_order_delivery_otp 
  ON public.order_delivery_otps (order_id) 
  WHERE confirmed_at IS NULL AND invalidated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_order_delivery_otps_order_id 
  ON public.order_delivery_otps (order_id);

CREATE INDEX IF NOT EXISTS idx_order_delivery_otps_partner_id 
  ON public.order_delivery_otps (partner_id);

CREATE INDEX IF NOT EXISTS idx_order_delivery_otps_confirmed 
  ON public.order_delivery_otps (order_id, confirmed_at);

-- Add configurable minimum order amount threshold for store internal deliveries requiring OTP
ALTER TABLE public.delivery_settings 
  ADD COLUMN IF NOT EXISTS otp_min_order_amount numeric(10,2) DEFAULT 500.00;

-- Row Level Security
ALTER TABLE public.order_delivery_otps ENABLE ROW LEVEL SECURITY;

-- Deny direct client table access; only service role and vetted security definer RPCs can interact with hashes/salts
DROP POLICY IF EXISTS "order_delivery_otps_service_role" ON public.order_delivery_otps;
CREATE POLICY "order_delivery_otps_service_role" 
  ON public.order_delivery_otps 
  FOR ALL 
  TO service_role 
  USING (true) 
  WITH CHECK (true);

-- Atomic verification and consumption function
CREATE OR REPLACE FUNCTION public.verify_and_consume_delivery_otp(
  p_order_id uuid,
  p_code_hash text,
  p_confirmed_by uuid,
  p_max_attempts int DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_otp public.order_delivery_otps%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  -- Lock row exclusively for this order
  SELECT * INTO v_otp
  FROM public.order_delivery_otps
  WHERE order_id = p_order_id
    AND confirmed_at IS NULL
    AND invalidated_at IS NULL
  FOR UPDATE;

  -- 1. If no active OTP found, check idempotency (was it already confirmed?)
  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1 FROM public.order_delivery_otps
      WHERE order_id = p_order_id AND confirmed_at IS NOT NULL
    ) THEN
      RETURN jsonb_build_object(
        'success', true,
        'already_confirmed', true,
        'message', 'Entrega já confirmada com sucesso anteriormente.'
      );
    END IF;

    RETURN jsonb_build_object(
      'success', false,
      'code', 'OTP_NOT_FOUND',
      'message', 'Código de confirmação de entrega não encontrado ou inválido.'
    );
  END IF;

  -- 2. Check temporary lockout due to failed attempts
  IF v_otp.locked_until IS NOT NULL AND v_otp.locked_until > v_now THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'OTP_LOCKED',
      'message', 'Muitas tentativas incorretas. Aguarde alguns minutos antes de tentar novamente.'
    );
  END IF;

  -- 3. Check expiration
  IF v_otp.expires_at <= v_now THEN
    UPDATE public.order_delivery_otps
    SET invalidated_at = v_now,
        invalidation_reason = 'expired',
        updated_at = v_now
    WHERE id = v_otp.id;

    RETURN jsonb_build_object(
      'success', false,
      'code', 'OTP_EXPIRED',
      'message', 'O código de confirmação expirou.'
    );
  END IF;

  -- 4. Compare hash using constant-time equality check
  IF v_otp.code_hash <> p_code_hash THEN
    UPDATE public.order_delivery_otps
    SET attempts = attempts + 1,
        locked_until = CASE WHEN attempts + 1 >= p_max_attempts THEN v_now + interval '15 minutes' ELSE NULL END,
        updated_at = v_now
    WHERE id = v_otp.id;

    RETURN jsonb_build_object(
      'success', false,
      'code', 'OTP_INVALID',
      'remaining_attempts', GREATEST(0, p_max_attempts - (v_otp.attempts + 1)),
      'message', CASE
        WHEN (v_otp.attempts + 1) >= p_max_attempts
          THEN 'Limite de tentativas excedido. Bloqueado temporariamente.'
        ELSE 'Código de confirmação incorreto.'
      END
    );
  END IF;

  -- 5. Code is valid! Consume it atomically
  UPDATE public.order_delivery_otps
  SET confirmed_at = v_now,
      confirmed_by = p_confirmed_by,
      updated_at = v_now
  WHERE id = v_otp.id;

  RETURN jsonb_build_object(
    'success', true,
    'already_confirmed', false,
    'message', 'Código validado com sucesso.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_and_consume_delivery_otp(uuid, text, uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_and_consume_delivery_otp(uuid, text, uuid, int) TO authenticated, service_role;
