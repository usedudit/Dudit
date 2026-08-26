-- ============================================================================
-- Migration: Periodic Cleanup + Audit Log Optimization
-- Created: 2026-08-26
-- Description:
--   1. Creates 17 cleanup functions with pg_cron scheduling
--   2. Modifies immutability triggers to allow cleanup functions
--   3. Optimizes audit_logs to skip routine CRUD events
--   Idempotent: safe to run multiple times.
-- ============================================================================


-- ============================================================================
-- SECTION 1: MODIFY IMMUTABILITY TRIGGERS TO ALLOW CLEANUP
-- ============================================================================

-- 1.1 Modify admin_audit_logs trigger to allow postgres (pg_cron runs as postgres)
CREATE OR REPLACE FUNCTION public.prevent_audit_log_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF session_user = 'supabase_auth_admin' OR current_user = 'supabase_auth_admin' THEN
    IF TG_OP = 'UPDATE' THEN
      RETURN NEW;
    ELSE
      RETURN OLD;
    END IF;
  END IF;

  -- Allow periodic cleanup functions (pg_cron runs as postgres)
  IF current_user = 'postgres' THEN
    IF TG_OP = 'UPDATE' THEN
      RETURN NEW;
    ELSE
      RETURN OLD;
    END IF;
  END IF;

  RAISE EXCEPTION 'admin_audit_logs is immutable. UPDATE and DELETE are forbidden.';
  RETURN NULL;
END;
$$;

-- 1.2 Modify audit_logs trigger to allow postgres (pg_cron runs as postgres)
CREATE OR REPLACE FUNCTION public.prevent_audit_log_user_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF session_user = 'supabase_auth_admin' OR current_user = 'supabase_auth_admin' THEN
    IF TG_OP = 'UPDATE' THEN
      RETURN NEW;
    ELSE
      RETURN OLD;
    END IF;
  END IF;

  -- Allow periodic cleanup functions (pg_cron runs as postgres)
  IF current_user = 'postgres' THEN
    IF TG_OP = 'UPDATE' THEN
      RETURN NEW;
    ELSE
      RETURN OLD;
    END IF;
  END IF;

  RAISE EXCEPTION 'audit_logs is immutable. UPDATE and DELETE are forbidden.';
  RETURN NULL;
END;
$$;


-- ============================================================================
-- SECTION 2: CLEANUP FUNCTIONS (17 total)
-- ============================================================================

-- ─── 2.1 notification_delivery_log (90 days) ───────────────────────────────

CREATE OR REPLACE FUNCTION public.purge_notification_delivery_log(p_retention_days int DEFAULT 90)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE deleted_count int;
BEGIN
  DELETE FROM public.notification_delivery_log
  WHERE created_at < now() - make_interval(days => p_retention_days);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ─── 2.2 marketplace_metrics_events (90 days) ──────────────────────────────

CREATE OR REPLACE FUNCTION public.purge_marketplace_metrics_events(p_retention_days int DEFAULT 90)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE deleted_count int;
BEGIN
  DELETE FROM public.marketplace_metrics_events
  WHERE created_at < now() - make_interval(days => p_retention_days);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ─── 2.3 whatsapp_messages - terminal status (60 days) ─────────────────────

CREATE OR REPLACE FUNCTION public.purge_terminal_whatsapp_messages(p_retention_days int DEFAULT 60)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE deleted_count int;
BEGIN
  DELETE FROM public.whatsapp_messages
  WHERE status IN ('sent', 'delivered', 'read', 'failed_permanently')
    AND created_at < now() - make_interval(days => p_retention_days);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ─── 2.4 push_subscriptions - stale tokens (60 days) ──────────────────────

CREATE OR REPLACE FUNCTION public.purge_stale_push_subscriptions(p_retention_days int DEFAULT 60)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE deleted_count int;
BEGIN
  DELETE FROM public.push_subscriptions
  WHERE last_seen_at < now() - make_interval(days => p_retention_days);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ─── 2.5 notification_scheduled_jobs - terminal status (30 days) ───────────

CREATE OR REPLACE FUNCTION public.purge_terminal_notification_jobs(p_retention_days int DEFAULT 30)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE deleted_count int;
BEGIN
  DELETE FROM public.notification_scheduled_jobs
  WHERE status IN ('completed', 'failed', 'cancelled')
    AND created_at < now() - make_interval(days => p_retention_days);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ─── 2.6 whatsapp_scheduled_jobs - terminal status (30 days) ───────────────

CREATE OR REPLACE FUNCTION public.purge_terminal_whatsapp_jobs(p_retention_days int DEFAULT 30)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE deleted_count int;
BEGIN
  DELETE FROM public.whatsapp_scheduled_jobs
  WHERE status IN ('completed', 'failed', 'cancelled')
    AND created_at < now() - make_interval(days => p_retention_days);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ─── 2.7 admin_actions - terminal status (30 days) ────────────────────────

CREATE OR REPLACE FUNCTION public.purge_terminal_admin_actions(p_retention_days int DEFAULT 30)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE deleted_count int;
BEGIN
  DELETE FROM public.admin_actions
  WHERE status IN ('completed', 'failed', 'cancelled')
    AND created_at < now() - make_interval(days => p_retention_days);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ─── 2.8 partner_moderation_actions (1 year) ──────────────────────────────

CREATE OR REPLACE FUNCTION public.purge_partner_moderation_actions(p_retention_days int DEFAULT 365)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE deleted_count int;
BEGIN
  DELETE FROM public.partner_moderation_actions
  WHERE created_at < now() - make_interval(days => p_retention_days);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ─── 2.9 partner_risk_events (1 year) ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.purge_partner_risk_events(p_retention_days int DEFAULT 365)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE deleted_count int;
BEGIN
  DELETE FROM public.partner_risk_events
  WHERE created_at < now() - make_interval(days => p_retention_days);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ─── 2.10 promotion_audit_logs (1 year) ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.purge_promotion_audit_logs(p_retention_days int DEFAULT 365)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE deleted_count int;
BEGIN
  DELETE FROM public.promotion_audit_logs
  WHERE created_at < now() - make_interval(days => p_retention_days);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ─── 2.11 billing_events (2 years) ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.purge_billing_events(p_retention_days int DEFAULT 730)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE deleted_count int;
BEGIN
  DELETE FROM public.billing_events
  WHERE created_at < now() - make_interval(days => p_retention_days);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ─── 2.12 return_events (1 year) ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.purge_return_events(p_retention_days int DEFAULT 365)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE deleted_count int;
BEGIN
  DELETE FROM public.return_events
  WHERE created_at < now() - make_interval(days => p_retention_days);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ─── 2.13 purchase_cost_history (2 years) ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.purge_purchase_cost_history(p_retention_days int DEFAULT 730)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE deleted_count int;
BEGIN
  DELETE FROM public.purchase_cost_history
  WHERE created_at < now() - make_interval(days => p_retention_days);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ─── 2.14 reports (2 years) ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.purge_old_reports(p_retention_days int DEFAULT 730)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE deleted_count int;
BEGIN
  DELETE FROM public.reports
  WHERE created_at < now() - make_interval(days => p_retention_days);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ─── 2.15 subscriptions - stale pending (24 hours) ────────────────────────

-- Drop existing function first (different return type)
DROP FUNCTION IF EXISTS public.cleanup_stale_pending_subscriptions();

CREATE OR REPLACE FUNCTION public.cleanup_stale_pending_subscriptions()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE deleted_count int;
BEGIN
  WITH cancelled AS (
    UPDATE public.subscriptions
    SET status = 'cancelled',
        cancelled_at = now(),
        ended_at = now()
    WHERE status = 'pending'
      AND created_at < now() - interval '24 hours'
    RETURNING id
  )
  SELECT count(*) INTO deleted_count FROM cancelled;
  RETURN deleted_count;
END;
$$;

-- ─── 2.16 admin_audit_logs (6 months routine, 3 years important) ──────────

CREATE OR REPLACE FUNCTION public.purge_old_admin_audit_logs()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE deleted_count int;
BEGIN
  -- Delete routine actions older than 6 months
  DELETE FROM public.admin_audit_logs
  WHERE created_at < now() - make_interval(days => 180)
    AND action_type IN (
      'admin.step_up',
      'admin.login_failed',
      'advertising.create',
      'advertising.update',
      'advertising.delete',
      'advertising.status_change',
      'marketplace.synonym_change',
      'delivery_driver.invite_create',
      'delivery_driver.update',
      'driver.deactivate',
      'moderation.reprocess'
    );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ─── 2.17 audit_logs (6 months routine, 2 years important) ────────────────

CREATE OR REPLACE FUNCTION public.purge_old_audit_logs()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE deleted_count int;
BEGIN
  -- Delete routine CRUD events older than 6 months
  -- Keep: financial, security, billing, recurring, subscription events
  DELETE FROM public.audit_logs
  WHERE created_at < now() - make_interval(days => 180)
    AND (
      -- Routine CRUD events to delete
      action_type IN (
        'created', 'deleted', 'restored', 'duplicated',
        'attachment_created', 'attachment_deleted',
        'services_added', 'products_added', 'assigned',
        'notification_sent', 'whatsapp_message_sent',
        'whatsapp_appointment_confirmed', 'whatsapp_appointment_cancelled'
      )
      -- For 'updated', only delete routine entity updates (keep orders, quotes, etc.)
      OR (
        action_type = 'updated'
        AND entity_type IN ('product', 'service', 'customer', 'appointment')
      )
      -- Status changes that are not financial
      OR (
        action_type = 'status_changed'
        AND entity_type NOT IN ('order', 'quote', 'transaction', 'service_order', 'return_request')
      )
    )
    -- Never delete financial/security/billing events
    AND action_type NOT IN (
      'paid', 'received', 'cancelled', 'refunded',
      'cash_opened', 'cash_closed', 'cash_movement', 'movement_reversed',
      'installment_paid', 'settled',
      'recurring_created', 'recurring_updated', 'recurring_cancelled', 'recurring_executed',
      'payment_failed', 'stock_shortage',
      'converted_to_order', 'quote_conversion',
      'sale_created', 'withdrawal_created', 'deposit_created'
    )
    -- Never delete security events (from auditLog())
    AND entity_type != 'security'
    -- Never delete billing events (from logBillingAudit())
    AND entity_type != 'billing'
    -- Never delete subscription events
    AND action_type NOT LIKE 'subscription_%'
    -- Never delete invite/auth/role events
    AND action_type NOT LIKE 'invite_%'
    AND action_type NOT LIKE 'auth_%'
    AND action_type NOT LIKE 'role_%'
    AND action_type NOT LIKE 'member_%'
    AND action_type NOT LIKE 'partner_%'
    AND action_type NOT LIKE 'document_%'
    AND action_type NOT LIKE 'account_%';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


-- ============================================================================
-- SECTION 3: pg_cron JOBS
-- ============================================================================

DO $$
BEGIN
  -- Check if pg_cron is available
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not available - skip scheduling all cleanup jobs';
    RETURN;
  END IF;

  -- ─── 3.1 notification_delivery_log (weekly Sun 3:00) ───────────────────
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-notification-delivery-log') THEN
    PERFORM cron.unschedule('cleanup-notification-delivery-log');
  END IF;
  PERFORM cron.schedule(
    'cleanup-notification-delivery-log',
    '0 3 * * 0',
    $cmd$SELECT purge_notification_delivery_log(90)$cmd$
  );

  -- ─── 3.2 marketplace_metrics_events (weekly Sun 3:15) ──────────────────
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-marketplace-metrics') THEN
    PERFORM cron.unschedule('cleanup-marketplace-metrics');
  END IF;
  PERFORM cron.schedule(
    'cleanup-marketplace-metrics',
    '15 3 * * 0',
    $cmd$SELECT purge_marketplace_metrics_events(90)$cmd$
  );

  -- ─── 3.3 terminal_whatsapp_messages (weekly Sun 3:30) ──────────────────
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-whatsapp-messages') THEN
    PERFORM cron.unschedule('cleanup-whatsapp-messages');
  END IF;
  PERFORM cron.schedule(
    'cleanup-whatsapp-messages',
    '30 3 * * 0',
    $cmd$SELECT purge_terminal_whatsapp_messages(60)$cmd$
  );

  -- ─── 3.4 stale_push_subscriptions (weekly Sun 3:45) ────────────────────
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-push-subscriptions') THEN
    PERFORM cron.unschedule('cleanup-push-subscriptions');
  END IF;
  PERFORM cron.schedule(
    'cleanup-push-subscriptions',
    '45 3 * * 0',
    $cmd$SELECT purge_stale_push_subscriptions(60)$cmd$
  );

  -- ─── 3.5 terminal_notification_jobs (weekly Sun 4:00) ──────────────────
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-notification-jobs') THEN
    PERFORM cron.unschedule('cleanup-notification-jobs');
  END IF;
  PERFORM cron.schedule(
    'cleanup-notification-jobs',
    '0 4 * * 0',
    $cmd$SELECT purge_terminal_notification_jobs(30)$cmd$
  );

  -- ─── 3.6 terminal_whatsapp_jobs (weekly Sun 4:15) ─────────────────────
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-whatsapp-jobs') THEN
    PERFORM cron.unschedule('cleanup-whatsapp-jobs');
  END IF;
  PERFORM cron.schedule(
    'cleanup-whatsapp-jobs',
    '15 4 * * 0',
    $cmd$SELECT purge_terminal_whatsapp_jobs(30)$cmd$
  );

  -- ─── 3.7 terminal_admin_actions (weekly Sun 4:30) ─────────────────────
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-admin-actions') THEN
    PERFORM cron.unschedule('cleanup-admin-actions');
  END IF;
  PERFORM cron.schedule(
    'cleanup-admin-actions',
    '30 4 * * 0',
    $cmd$SELECT purge_terminal_admin_actions(30)$cmd$
  );

  -- ─── 3.8 stale_pending_subscriptions (daily 3:00) ─────────────────────
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-stale-subscriptions') THEN
    PERFORM cron.unschedule('cleanup-stale-subscriptions');
  END IF;
  PERFORM cron.schedule(
    'cleanup-stale-subscriptions',
    '0 3 * * *',
    $cmd$SELECT cleanup_stale_pending_subscriptions()$cmd$
  );

  -- ─── 3.9 partner_moderation_actions (monthly Sun 5:00) ────────────────
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-partner-moderation') THEN
    PERFORM cron.unschedule('cleanup-partner-moderation');
  END IF;
  PERFORM cron.schedule(
    'cleanup-partner-moderation',
    '0 5 1 * *',
    $cmd$SELECT purge_partner_moderation_actions(365)$cmd$
  );

  -- ─── 3.10 partner_risk_events (monthly Sun 5:15) ──────────────────────
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-partner-risk') THEN
    PERFORM cron.unschedule('cleanup-partner-risk');
  END IF;
  PERFORM cron.schedule(
    'cleanup-partner-risk',
    '15 5 1 * *',
    $cmd$SELECT purge_partner_risk_events(365)$cmd$
  );

  -- ─── 3.11 promotion_audit_logs (monthly Sun 5:30) ─────────────────────
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-promotion-audit') THEN
    PERFORM cron.unschedule('cleanup-promotion-audit');
  END IF;
  PERFORM cron.schedule(
    'cleanup-promotion-audit',
    '30 5 1 * *',
    $cmd$SELECT purge_promotion_audit_logs(365)$cmd$
  );

  -- ─── 3.12 billing_events (monthly Sun 5:45) ───────────────────────────
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-billing-events') THEN
    PERFORM cron.unschedule('cleanup-billing-events');
  END IF;
  PERFORM cron.schedule(
    'cleanup-billing-events',
    '45 5 1 * *',
    $cmd$SELECT purge_billing_events(730)$cmd$
  );

  -- ─── 3.13 return_events (monthly Sun 6:00) ────────────────────────────
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-return-events') THEN
    PERFORM cron.unschedule('cleanup-return-events');
  END IF;
  PERFORM cron.schedule(
    'cleanup-return-events',
    '0 6 1 * *',
    $cmd$SELECT purge_return_events(365)$cmd$
  );

  -- ─── 3.14 purchase_cost_history (monthly Sun 6:15) ────────────────────
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-purchase-cost') THEN
    PERFORM cron.unschedule('cleanup-purchase-cost');
  END IF;
  PERFORM cron.schedule(
    'cleanup-purchase-cost',
    '15 6 1 * *',
    $cmd$SELECT purge_purchase_cost_history(730)$cmd$
  );

  -- ─── 3.15 old_reports (monthly Sun 6:30) ──────────────────────────────
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-old-reports') THEN
    PERFORM cron.unschedule('cleanup-old-reports');
  END IF;
  PERFORM cron.schedule(
    'cleanup-old-reports',
    '30 6 1 * *',
    $cmd$SELECT purge_old_reports(730)$cmd$
  );

  -- ─── 3.16 old_admin_audit_logs (monthly Sun 7:00) ─────────────────────
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-admin-audit-logs') THEN
    PERFORM cron.unschedule('cleanup-admin-audit-logs');
  END IF;
  PERFORM cron.schedule(
    'cleanup-admin-audit-logs',
    '0 7 1 * *',
    $cmd$SELECT purge_old_admin_audit_logs()$cmd$
  );

  -- ─── 3.17 old_audit_logs (monthly Sun 7:15) ───────────────────────────
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-audit-logs') THEN
    PERFORM cron.unschedule('cleanup-audit-logs');
  END IF;
  PERFORM cron.schedule(
    'cleanup-audit-logs',
    '15 7 1 * *',
    $cmd$SELECT purge_old_audit_logs()$cmd$
  );

END;
$$;


-- ============================================================================
-- SECTION 4: COMMENTS
-- ============================================================================

COMMENT ON FUNCTION public.purge_notification_delivery_log(int) IS
  'Deletes notification delivery log entries older than p_retention_days. Weekly pg_cron job.';

COMMENT ON FUNCTION public.purge_marketplace_metrics_events(int) IS
  'Deletes marketplace metrics idempotency events older than p_retention_days. Weekly pg_cron job.';

COMMENT ON FUNCTION public.purge_terminal_whatsapp_messages(int) IS
  'Deletes WhatsApp messages with terminal status older than p_retention_days. Weekly pg_cron job.';

COMMENT ON FUNCTION public.purge_stale_push_subscriptions(int) IS
  'Deletes stale push subscription tokens not seen for p_retention_days. Weekly pg_cron job.';

COMMENT ON FUNCTION public.purge_terminal_notification_jobs(int) IS
  'Deletes completed/failed/cancelled notification jobs older than p_retention_days. Weekly pg_cron job.';

COMMENT ON FUNCTION public.purge_terminal_whatsapp_jobs(int) IS
  'Deletes completed/failed/cancelled WhatsApp jobs older than p_retention_days. Weekly pg_cron job.';

COMMENT ON FUNCTION public.purge_terminal_admin_actions(int) IS
  'Deletes completed/failed/cancelled admin actions older than p_retention_days. Weekly pg_cron job.';

COMMENT ON FUNCTION public.purge_partner_moderation_actions(int) IS
  'Deletes partner moderation actions older than p_retention_days. Monthly pg_cron job.';

COMMENT ON FUNCTION public.purge_partner_risk_events(int) IS
  'Deletes partner risk events older than p_retention_days. Monthly pg_cron job.';

COMMENT ON FUNCTION public.purge_promotion_audit_logs(int) IS
  'Deletes promotion audit logs older than p_retention_days. Monthly pg_cron job.';

COMMENT ON FUNCTION public.purge_billing_events(int) IS
  'Deletes billing events older than p_retention_days. Monthly pg_cron job.';

COMMENT ON FUNCTION public.purge_return_events(int) IS
  'Deletes return request events older than p_retention_days. Monthly pg_cron job.';

COMMENT ON FUNCTION public.purge_purchase_cost_history(int) IS
  'Deletes purchase cost history older than p_retention_days. Monthly pg_cron job.';

COMMENT ON FUNCTION public.purge_old_reports(int) IS
  'Deletes old reports older than p_retention_days. Monthly pg_cron job.';

COMMENT ON FUNCTION public.cleanup_stale_pending_subscriptions() IS
  'Cancels pending subscriptions older than 24 hours. Daily pg_cron job.';

COMMENT ON FUNCTION public.purge_old_admin_audit_logs() IS
  'Deletes routine admin audit log actions older than 6 months. Monthly pg_cron job.';

COMMENT ON FUNCTION public.purge_old_audit_logs() IS
  'Deletes routine CRUD audit log events older than 6 months. Monthly pg_cron job.';


-- ============================================================================
-- SECTION 5: MONITORING VIEW
-- ============================================================================

CREATE OR REPLACE VIEW public.cleanup_monitoring AS
SELECT
  'notification_delivery_log' AS table_name,
  (SELECT count(*) FROM public.notification_delivery_log) AS total_rows,
  (SELECT count(*) FROM public.notification_delivery_log WHERE created_at < now() - interval '90 days') AS rows_to_delete
UNION ALL
SELECT
  'marketplace_metrics_events',
  (SELECT count(*) FROM public.marketplace_metrics_events),
  (SELECT count(*) FROM public.marketplace_metrics_events WHERE created_at < now() - interval '90 days')
UNION ALL
SELECT
  'whatsapp_messages',
  (SELECT count(*) FROM public.whatsapp_messages),
  (SELECT count(*) FROM public.whatsapp_messages WHERE status IN ('sent', 'delivered', 'read', 'failed_permanently') AND created_at < now() - interval '60 days')
UNION ALL
SELECT
  'push_subscriptions',
  (SELECT count(*) FROM public.push_subscriptions),
  (SELECT count(*) FROM public.push_subscriptions WHERE last_seen_at < now() - interval '60 days')
UNION ALL
SELECT
  'notification_scheduled_jobs',
  (SELECT count(*) FROM public.notification_scheduled_jobs),
  (SELECT count(*) FROM public.notification_scheduled_jobs WHERE status IN ('completed', 'failed', 'cancelled') AND created_at < now() - interval '30 days')
UNION ALL
SELECT
  'whatsapp_scheduled_jobs',
  (SELECT count(*) FROM public.whatsapp_scheduled_jobs),
  (SELECT count(*) FROM public.whatsapp_scheduled_jobs WHERE status IN ('completed', 'failed', 'cancelled') AND created_at < now() - interval '30 days')
UNION ALL
SELECT
  'admin_actions',
  (SELECT count(*) FROM public.admin_actions),
  (SELECT count(*) FROM public.admin_actions WHERE status IN ('completed', 'failed', 'cancelled') AND created_at < now() - interval '30 days')
UNION ALL
SELECT
  'admin_audit_logs',
  (SELECT count(*) FROM public.admin_audit_logs),
  (SELECT count(*) FROM public.admin_audit_logs WHERE created_at < now() - interval '180 days')
UNION ALL
SELECT
  'audit_logs',
  (SELECT count(*) FROM public.audit_logs),
  (SELECT count(*) FROM public.audit_logs WHERE created_at < now() - interval '180 days');


COMMENT ON VIEW public.cleanup_monitoring IS
  'Monitoring view showing row counts and rows eligible for cleanup across all managed tables.';
