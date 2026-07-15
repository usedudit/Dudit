-- Cleanup: remove unused tables and migrate numbering to global sequence

-- ============================================================
-- 1. DROP UNUSED TABLES
-- ============================================================

DROP TABLE IF EXISTS public.email_change_otps CASCADE;
DROP TABLE IF EXISTS public.email_send_log CASCADE;
DROP TABLE IF EXISTS public.moderation_jobs CASCADE;
DROP TABLE IF EXISTS public.rate_limit_logs CASCADE;
DROP TABLE IF EXISTS public.service_order_sequences CASCADE;
DROP TABLE IF EXISTS public.suspicious_activities CASCADE;
DROP TABLE IF EXISTS public.transactions_history CASCADE;
DROP TABLE IF EXISTS public.quotes_history CASCADE;
DROP TABLE IF EXISTS public.service_order_history CASCADE;

-- ============================================================
-- 2. DROP UNUSED FUNCTIONS
-- ============================================================

DROP FUNCTION IF EXISTS public.clean_expired_otps CASCADE;
DROP FUNCTION IF EXISTS public.claim_moderation_jobs CASCADE;
DROP FUNCTION IF EXISTS public.next_service_order_number CASCADE;

-- ============================================================
-- 3. GLOBAL SEQUENCE FOR SERVICE ORDERS (like quotes)
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS service_order_number_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION public.generate_service_order_number()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  seq_val BIGINT;
  year_month TEXT;
BEGIN
  seq_val := nextval('service_order_number_seq');
  year_month := to_char(NOW(), 'YYYYMM');
  RETURN 'OS-' || year_month || '-' || lpad(seq_val::TEXT, 6, '0');
END;
$$;

-- ============================================================
-- 4. BEFORE INSERT TRIGGER for auto-numbering service_orders
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_service_order_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := generate_service_order_number();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_service_order_defaults ON public.service_orders;
CREATE TRIGGER trg_set_service_order_defaults
  BEFORE INSERT ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION set_service_order_defaults();

-- ============================================================
-- 5. DROP INDEXES referencing removed tables
-- ============================================================

DROP INDEX IF EXISTS idx_moderation_jobs_product_status;
DROP INDEX IF EXISTS idx_service_order_sequences_partner_year;

