-- ============================================================================
-- Rollback: 20261123_1400_dispatch_tick_and_cron_rollback.sql
-- ============================================================================

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'dudit_dispatch_tick'
      AND database = current_database();
  END IF;
END
$cron$;

DROP FUNCTION IF EXISTS public.dispatch_tick();
DROP FUNCTION IF EXISTS public.dispatch_score(numeric, numeric, numeric, integer, integer, integer, numeric, jsonb);
