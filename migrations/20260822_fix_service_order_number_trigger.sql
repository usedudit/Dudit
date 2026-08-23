-- Migration: 20260822_fix_service_order_number_trigger.sql
-- Description: Ensure service_order_number_seq, generate_service_order_number(), and set_service_order_defaults trigger automatically assigns order_number on INSERT.

-- 1. Ensure global sequence for service order numbers exists
CREATE SEQUENCE IF NOT EXISTS public.service_order_number_seq START 1 INCREMENT 1;

-- 2. Ensure generator function exists
CREATE OR REPLACE FUNCTION public.generate_service_order_number()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seq_val BIGINT;
  year_month TEXT;
BEGIN
  seq_val := nextval('public.service_order_number_seq');
  year_month := to_char(NOW(), 'YYYYMM');
  RETURN 'OS-' || year_month || '-' || lpad(seq_val::TEXT, 6, '0');
END;
$$;

-- 3. Ensure trigger function assigns order_number and defaults
CREATE OR REPLACE FUNCTION public.set_service_order_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_salt TEXT;
BEGIN
  -- Auto-generate order_number if not supplied
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := public.generate_service_order_number();
  END IF;

  -- Auto-generate public short token if not supplied
  IF NEW.public_token IS NULL OR NEW.public_token = '' THEN
    NEW.public_token := public.generate_short_id(6);
  END IF;

  -- Setup approval code hash
  IF NEW.approval_code_hash IS NULL THEN
    v_code := lpad(floor(random() * 10000)::text, 4, '0');
    v_salt := md5(random()::text);
    NEW.approval_code_salt := v_salt;
    NEW.approval_code_hash := public.compute_approval_hash(v_salt, v_code);
    NEW.metadata := jsonb_set(COALESCE(NEW.metadata, '{}'::jsonb), '{plain_code}', to_jsonb(v_code));
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Re-attach BEFORE INSERT trigger on service_orders
DROP TRIGGER IF EXISTS trg_set_service_order_defaults ON public.service_orders;
CREATE TRIGGER trg_set_service_order_defaults
  BEFORE INSERT ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_service_order_defaults();

NOTIFY pgrst, 'reload schema';
