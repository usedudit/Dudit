-- Restore the 23 non-R2 active cron jobs from the Supabase CSV export dated
-- 2026-11-04. Run after restoring the public schema/functions and enabling
-- pg_cron. Existing jobs with the same name are left unchanged.
--
-- The two R2 jobs are intentionally excluded. Apply
-- migrations/20261103190000_r2_object_deletion_outbox.sql after enabling
-- pg_net and configuring Vault so it can use the target project's pg_net
-- schema and the correct R2 worker secrets.

DO $restore_cron_jobs$
DECLARE
  v_job RECORD;
BEGIN
  FOR v_job IN
    SELECT * FROM (VALUES
      ('cleanup-admin-actions', '30 4 * * 0', 'SELECT purge_terminal_admin_actions(30)'),
      ('cleanup-admin-audit-logs', '0 7 1 * *', 'SELECT purge_old_admin_audit_logs()'),
      ('cleanup-audit-logs', '15 7 1 * *', 'SELECT purge_old_audit_logs()'),
      ('cleanup-billing-events', '45 5 1 * *', 'SELECT purge_billing_events(730)'),
      ('cleanup-marketplace-metrics', '15 3 * * 0', 'SELECT purge_marketplace_metrics_events(90)'),
      ('cleanup-notification-delivery-log', '0 3 * * 0', 'SELECT purge_notification_delivery_log(90)'),
      ('cleanup-notification-jobs', '0 4 * * 0', 'SELECT purge_terminal_notification_jobs(30)'),
      ('cleanup-old-reports', '30 6 1 * *', 'SELECT purge_old_reports(730)'),
      ('cleanup-old-webhook-events', '0 3 * * 0', 'SELECT purge_processed_webhook_events(90)'),
      ('cleanup-partner-moderation', '0 5 1 * *', 'SELECT purge_partner_moderation_actions(365)'),
      ('cleanup-partner-risk', '15 5 1 * *', 'SELECT purge_partner_risk_events(365)'),
      ('cleanup-promotion-audit', '30 5 1 * *', 'SELECT purge_promotion_audit_logs(365)'),
      ('cleanup-purchase-cost', '15 6 1 * *', 'SELECT purge_purchase_cost_history(730)'),
      ('cleanup-push-subscriptions', '45 3 * * 0', 'SELECT purge_stale_push_subscriptions(60)'),
      ('cleanup-return-audit-logs', '0 6 1 * *', 'SELECT purge_return_audit_logs(365)'),
      ('cleanup-stale-address-coordinates', '0 4 * * 0', 'SELECT purge_stale_address_coordinates_cache(90)'),
      ('cleanup-stale-subscriptions', '0 3 * * *', 'SELECT cleanup_stale_pending_subscriptions()'),
      ('cleanup-whatsapp-jobs', '15 4 * * 0', 'SELECT purge_terminal_whatsapp_jobs(30)'),
      ('cleanup-whatsapp-messages', '30 3 * * 0', 'SELECT purge_terminal_whatsapp_messages(60)'),
      ('purge-application-access-logs', '30 4 * * 0', 'SELECT public.purge_old_application_access_logs()'),
      ('purge-expired-deletion-evidence', '0 5 * * 0', 'SELECT public.purge_expired_deletion_evidence()'),
      ('purge-expired-security-incident-records', '0 5 * * 0', 'SELECT public.purge_expired_security_incident_records()'),
      ('reset-monthly-counters', '5 0 * * *', 'select public.reset_monthly_counters();'),
      ('dudit_dispatch_tick', '15 seconds', 'SELECT public.dispatch_tick();')
    ) AS jobs(jobname, schedule, command)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM cron.job j
      WHERE j.jobname = v_job.jobname
        AND j.database = current_database()
    ) THEN
      PERFORM cron.schedule(v_job.jobname, v_job.schedule, v_job.command);
    END IF;
  END LOOP;
END;
$restore_cron_jobs$;
