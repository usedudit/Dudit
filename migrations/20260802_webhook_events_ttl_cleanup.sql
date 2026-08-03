-- ============================================================================
-- Migration: Webhook Events TTL Cleanup
-- Created: 2026-08-02
-- Description:
--   Activates the pg_cron TTL cleanup for `processed_webhook_events`.
--   That table only exists for DB-level webhook idempotency (UNIQUE constraint
--   on idempotency_key). Rows are only needed to dedup re-deliveries, which
--   happens within days, so a 90-day retention is safe.
--   Idempotent: safe to run multiple times.
-- ============================================================================

-- ─── Cleanup function ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION purge_processed_webhook_events(p_retention_days int DEFAULT 90)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  deleted_count int;
BEGIN
  DELETE FROM public.processed_webhook_events
  WHERE processed_at < now() - make_interval(days => p_retention_days);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ─── pg_cron job (only if pg_cron is available) ────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not available - skip scheduling purge_processed_webhook_events';
    RETURN;
  END IF;

  -- Idempotent: drop any previous job with the same name before scheduling.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-old-webhook-events') THEN
    PERFORM cron.unschedule('cleanup-old-webhook-events');
  END IF;

  PERFORM cron.schedule(
    'cleanup-old-webhook-events',
    '0 3 * * 0',  -- Weekly at 3am Sunday
    $cmd$SELECT purge_processed_webhook_events(90)$cmd$
  );
END;
$$;

COMMENT ON FUNCTION public.purge_processed_webhook_events(int) IS
  'Deletes webhook idempotency records older than p_retention_days. Called by the cleanup-old-webhook-events cron job.';
