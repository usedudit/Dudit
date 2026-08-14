-- MVP launch blockers: effective-database security hardening.
-- This migration is intentionally catalog-driven because the repository has
-- historical migrations that are not a reliable representation of production.

BEGIN;

-- Prevent future functions from becoming public RPCs by default.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Remove anonymous RPC exposure from every SECURITY DEFINER function. Preserve
-- authenticated/service_role access explicitly where it existed so existing
-- authenticated ERP flows are not changed by the global revoke.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      p.oid::regprocedure AS signature,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_was_granted,
      has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_was_granted
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    IF r.authenticated_was_granted THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.signature);
    END IF;
    IF r.service_was_granted THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.signature);
    END IF;

    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.signature);
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', r.signature);
  END LOOP;
END $$;

-- Public marketplace surface: keep only intentionally public projections,
-- approval links and low-value counters. No tenant/financial mutation is in
-- this allowlist.
GRANT EXECUTE ON FUNCTION public.get_marketplace_products_public(uuid[], uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_public_quote(uuid, text, text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_public_quote(uuid, text, text, text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sign_public_service_order(uuid, text, text, text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_ad_impression(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_ad_click(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_collection_views(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_community_video_views(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_community_video_clicks(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_marketplace_view(text, uuid) TO anon, authenticated, service_role;

-- Server-only mutation helpers. Application callers already authenticate and
-- authorize before using the service-role client; exposing these as REST RPCs
-- would bypass that boundary.
REVOKE EXECUTE ON FUNCTION public.create_batch_stock_movement(uuid, text, text, text, uuid, jsonb, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrement_stock_atomic(uuid, integer, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_order_inventory(uuid, uuid, text, boolean, uuid, text, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_order_inventory(uuid, uuid, uuid, text, jsonb, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_order_inventory(uuid, uuid, uuid, text, text, jsonb, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_order_inventory(uuid, uuid, uuid, text, text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_pos_sale(uuid, uuid, uuid, jsonb, jsonb, numeric, uuid, uuid, text, uuid, uuid, numeric) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_pos_sale(uuid, uuid, uuid, uuid, numeric, text, jsonb, uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.execute_account_deletion_db(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_subscription_to_billing(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_order_paid_values(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_usage_counter(uuid, text, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrement_usage_counter(uuid, text, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_partner_risk_score(uuid, integer, text, uuid, jsonb, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_partner_sales(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_user_risk_score(uuid, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.report_return_to_dudit(uuid, uuid, text, text, boolean, text, text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_order_payment_stock(uuid, uuid, boolean, uuid, text, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_order_payment_stock(uuid, uuid, uuid, text, jsonb, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_marketplace_order_metrics(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_appointment_booking_metrics(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_subscription_signup_metrics(uuid) FROM anon, authenticated;

-- These overloads were the effective unsafe implementations. The authenticated
-- wrappers call the private __mvp_unsafe_* implementations after context checks.
DROP FUNCTION IF EXISTS public.create_return_request(uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, text, timestamptz, text, uuid, text, uuid, uuid);
DROP FUNCTION IF EXISTS public.process_return_request(uuid, uuid, text, text, numeric, text, text, boolean, numeric, jsonb, text, text, text);

-- Audit and metrics are append-only server events, never public client writes.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.audit_logs FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.marketplace_metrics_events FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS audit_logs_insert_service ON public.audit_logs;
CREATE POLICY audit_logs_insert_service ON public.audit_logs
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir insercao de metricas por anon e authenticated"
  ON public.marketplace_metrics_events;
CREATE POLICY marketplace_metrics_events_insert_service
  ON public.marketplace_metrics_events
  FOR INSERT TO service_role WITH CHECK (true);

COMMIT;
