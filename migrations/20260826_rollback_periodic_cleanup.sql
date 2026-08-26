-- ============================================================================
-- Rollback: Periodic Cleanup + Audit Log Optimization
-- Created: 2026-08-26
-- Description: Reverts all changes from 20260826_periodic_cleanup_and_audit_optimization.sql
--   1. Removes all pg_cron jobs
--   2. Drops all cleanup functions
--   3. Restores original immutability triggers
--   4. Drops monitoring view
--   Idempotent: safe to run multiple times.
-- ============================================================================


-- ============================================================================
-- SECTION 1: REMOVE ALL pg_cron JOBS
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not available - skip unscheduling cleanup jobs';
    RETURN;
  END IF;

  -- Weekly jobs
  PERFORM cron.unschedule('cleanup-notification-delivery-log');
  PERFORM cron.unschedule('cleanup-marketplace-metrics');
  PERFORM cron.unschedule('cleanup-whatsapp-messages');
  PERFORM cron.unschedule('cleanup-push-subscriptions');
  PERFORM cron.unschedule('cleanup-notification-jobs');
  PERFORM cron.unschedule('cleanup-whatsapp-jobs');
  PERFORM cron.unschedule('cleanup-admin-actions');

  -- Daily jobs
  PERFORM cron.unschedule('cleanup-stale-subscriptions');

  -- Monthly jobs
  PERFORM cron.unschedule('cleanup-partner-moderation');
  PERFORM cron.unschedule('cleanup-partner-risk');
  PERFORM cron.unschedule('cleanup-promotion-audit');
  PERFORM cron.unschedule('cleanup-billing-events');
  PERFORM cron.unschedule('cleanup-return-events');
  PERFORM cron.unschedule('cleanup-purchase-cost');
  PERFORM cron.unschedule('cleanup-old-reports');
  PERFORM cron.unschedule('cleanup-admin-audit-logs');
  PERFORM cron.unschedule('cleanup-audit-logs');

  RAISE NOTICE 'All cleanup pg_cron jobs unscheduled';
END;
$$;


-- ============================================================================
-- SECTION 2: DROP ALL CLEANUP FUNCTIONS
-- ============================================================================

DROP FUNCTION IF EXISTS public.purge_notification_delivery_log(int);
DROP FUNCTION IF EXISTS public.purge_marketplace_metrics_events(int);
DROP FUNCTION IF EXISTS public.purge_terminal_whatsapp_messages(int);
DROP FUNCTION IF EXISTS public.purge_stale_push_subscriptions(int);
DROP FUNCTION IF EXISTS public.purge_terminal_notification_jobs(int);
DROP FUNCTION IF EXISTS public.purge_terminal_whatsapp_jobs(int);
DROP FUNCTION IF EXISTS public.purge_terminal_admin_actions(int);
DROP FUNCTION IF EXISTS public.purge_partner_moderation_actions(int);
DROP FUNCTION IF EXISTS public.purge_partner_risk_events(int);
DROP FUNCTION IF EXISTS public.purge_promotion_audit_logs(int);
DROP FUNCTION IF EXISTS public.purge_billing_events(int);
DROP FUNCTION IF EXISTS public.purge_return_events(int);
DROP FUNCTION IF EXISTS public.purge_purchase_cost_history(int);
DROP FUNCTION IF EXISTS public.purge_old_reports(int);
DROP FUNCTION IF EXISTS public.cleanup_stale_pending_subscriptions(int);

-- Recreate original function (returns void, as defined in migration 1001)
CREATE OR REPLACE FUNCTION public.cleanup_stale_pending_subscriptions()
RETURNS void AS $$
DECLARE
  affected_count int;
BEGIN
  WITH cancelled AS (
    UPDATE public.subscriptions
    SET status = 'cancelled',
        cancelled_at = now(),
        ended_at = now()
    WHERE status = 'pending'
      AND created_at < now() - interval '24 hours'
    RETURNING id, partner_id
  )
  SELECT count(*) INTO affected_count FROM cancelled;

  IF affected_count > 0 THEN
    RAISE NOTICE '[CLEANUP] Cancelled % stale pending subscriptions', affected_count;
    
    INSERT INTO public.billing_events (partner_id, event_type, metadata)
    SELECT 
      s.partner_id,
      'stale_pending_cancelled',
      jsonb_build_object(
        'subscription_id', s.id,
        'reason', 'Checkout not completed within 24 hours',
        'original_created_at', s.created_at
      )
    FROM public.subscriptions s
    WHERE s.status = 'cancelled'
      AND s.ended_at >= now() - interval '1 minute'
      AND s.cancelled_at >= now() - interval '1 minute'
      AND EXISTS (
        SELECT 1 FROM public.billing_events be 
        WHERE be.partner_id = s.partner_id 
          AND be.event_type = 'subscription_created'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.billing_events be 
        WHERE be.partner_id = s.partner_id 
          AND be.event_type = 'stale_pending_cancelled'
          AND (be.metadata->>'subscription_id')::text = s.id::text
      );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP FUNCTION IF EXISTS public.purge_old_admin_audit_logs();
DROP FUNCTION IF EXISTS public.purge_old_audit_logs();


-- ============================================================================
-- SECTION 3: RESTORE ORIGINAL IMMUTABILITY TRIGGERS
-- ============================================================================

-- 3.1 Restore admin_audit_logs trigger (remove postgres bypass)
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

  RAISE EXCEPTION 'admin_audit_logs is immutable. UPDATE and DELETE are forbidden.';
  RETURN NULL;
END;
$$;

-- 3.2 Restore audit_logs trigger (remove postgres bypass)
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

  RAISE EXCEPTION 'audit_logs is immutable. UPDATE and DELETE are forbidden.';
  RETURN NULL;
END;
$$;


-- ============================================================================
-- SECTION 4: DROP MONITORING VIEW
-- ============================================================================

DROP VIEW IF EXISTS public.cleanup_monitoring;


-- ============================================================================
-- SECTION 5: VERIFY ROLLBACK
-- ============================================================================

DO $$
BEGIN
  -- Verify all functions are dropped
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'purge_notification_delivery_log') THEN
    RAISE WARNING 'Function purge_notification_delivery_log still exists after rollback';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'purge_old_audit_logs') THEN
    RAISE WARNING 'Function purge_old_audit_logs still exists after rollback';
  END IF;

  -- Verify all cron jobs are removed
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname LIKE 'cleanup-%') THEN
    RAISE WARNING 'Some cleanup cron jobs still exist after rollback';
  END IF;

  RAISE NOTICE 'Rollback completed successfully';
END;
$$;
