-- Keep internal SECURITY DEFINER mutation and maintenance RPCs out of the
-- authenticated PostgREST surface. Server code calls these with service_role;
-- scheduled jobs continue to run as their database owner.

REVOKE ALL ON FUNCTION public.duplicate_quote_with_items(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_quote_with_items(uuid, uuid, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.consume_credits_fifo(uuid, uuid, uuid, integer, uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_credits_fifo(uuid, uuid, uuid, integer, uuid, uuid, text, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.decrement_store_product_stock(uuid, integer, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_store_product_stock(uuid, integer, boolean)
  TO service_role;

REVOKE ALL ON FUNCTION public.increment_store_product_stock(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_store_product_stock(uuid, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.claim_due_recurring_executions(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_recurring_executions(integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.complete_recurring_execution(uuid, uuid, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_recurring_execution(uuid, uuid, uuid[])
  TO service_role;

REVOKE ALL ON FUNCTION public.fail_recurring_execution(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_recurring_execution(uuid, text)
  TO service_role;

-- Retention routines accept caller-controlled retention windows, and several
-- purge audit, billing, moderation, webhook, and operational records globally.
REVOKE ALL ON FUNCTION public.purge_billing_events(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_marketplace_metrics_events(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_notification_delivery_log(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_old_admin_audit_logs() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_old_audit_logs() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_old_reports(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_partner_moderation_actions(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_partner_risk_events(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_processed_webhook_events(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_promotion_audit_logs(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_purchase_cost_history(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_return_audit_logs(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_stale_address_coordinates_cache(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_stale_push_subscriptions(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_terminal_admin_actions(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_terminal_notification_jobs(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_terminal_whatsapp_jobs(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_terminal_whatsapp_messages(integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.purge_billing_events(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_marketplace_metrics_events(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_notification_delivery_log(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_old_admin_audit_logs() TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_old_audit_logs() TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_old_reports(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_partner_moderation_actions(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_partner_risk_events(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_processed_webhook_events(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_promotion_audit_logs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_purchase_cost_history(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_return_audit_logs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_stale_address_coordinates_cache(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_stale_push_subscriptions(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_terminal_admin_actions(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_terminal_notification_jobs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_terminal_whatsapp_jobs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_terminal_whatsapp_messages(integer) TO service_role;
