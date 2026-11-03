-- These SECURITY DEFINER projections bypass table RLS. The app validates the
-- caller's partner/product/OS before invoking them from server code.
REVOKE ALL ON FUNCTION public.approve_public_service_order(uuid, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_public_service_order(uuid, text, text, text, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.get_sales_goals_summary(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_goals_summary(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_partner_video_monthly_count(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_partner_video_monthly_count(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_partner_video_weekly_count(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_partner_video_weekly_count(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_product_pending_orders_count(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_pending_orders_count(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.generate_recurring_occurrences_bulk(uuid, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_recurring_occurrences_bulk(uuid, date)
  TO service_role;

-- No application callsite uses these unscoped stock readers directly.
REVOKE ALL ON FUNCTION public.get_store_product_stock(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_product_stock(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_store_product_stock(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_product_stock(uuid, uuid, uuid) TO service_role;

-- Keep temporary schemas last in privileged function resolution. These jobs
-- are server-only already; this closes search_path shadowing as a second guard.
ALTER FUNCTION public.cleanup_stale_pending_subscriptions()
  SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.purge_expired_deletion_evidence()
  SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.purge_expired_security_incident_records()
  SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.purge_old_application_access_logs()
  SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.erp_close_cash_session_atomic(uuid, uuid, uuid, jsonb, text)
  SET search_path = pg_catalog, public, extensions, pg_temp;

NOTIFY pgrst, 'reload schema';
