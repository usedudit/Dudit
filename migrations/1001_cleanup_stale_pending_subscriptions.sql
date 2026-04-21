-- ============================================================================
-- Migration: Stale Pending Subscription Cleanup
-- Created: 2026-04-21
-- Description: Creates a function to cancel stale pending subscriptions
--              that were never activated (user abandoned checkout).
--              Should be run via pg_cron every hour.
-- ============================================================================

-- ─── Cleanup Function ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cleanup_stale_pending_subscriptions()
RETURNS void AS $$
DECLARE
  affected_count int;
BEGIN
  -- Cancel subscriptions that have been "pending" for more than 24 hours.
  -- These are checkout sessions that were never completed.
  -- 
  -- SAFETY:
  -- - Only targets "pending" status (never touches active, trialing, etc.)
  -- - Uses created_at to determine staleness (not updated_at, which could be misleading)
  -- - Sets proper cancelled_at and ended_at timestamps
  -- - logs the count for monitoring

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
    
    -- Log billing events for each cancelled subscription
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

-- ============================================================================
-- CRON SETUP (requires pg_cron extension)
-- 
-- Run this manually in Supabase SQL Editor after enabling pg_cron:
--
--   SELECT cron.schedule(
--     'cleanup-stale-pending-subscriptions',
--     '0 * * * *',  -- Every hour at minute 0
--     $$SELECT cleanup_stale_pending_subscriptions()$$
--   );
--
-- To verify:
--   SELECT * FROM cron.job WHERE jobname = 'cleanup-stale-pending-subscriptions';
--
-- To remove:
--   SELECT cron.unschedule('cleanup-stale-pending-subscriptions');
-- ============================================================================
