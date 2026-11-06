-- Reduce the R2 cleanup outbox worker cadence from every minute to hourly.
--
-- The queue (public.r2_object_deletion_jobs) is durable and drained with
-- claim/lease/SKIP LOCKED, so a lower cadence only increases deletion latency;
-- nothing is lost. Hourly keeps up to 2,400 objects/day of throughput while
-- removing ~98% of the idle worker invocations and structured log volume
-- produced by the previous `* * * * *` schedule.
BEGIN;

DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'pg_cron is unavailable; nothing to reschedule.';
    RETURN;
  END IF;

  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'process-r2-object-cleanup';

  IF v_job_id IS NULL THEN
    RAISE NOTICE 'process-r2-object-cleanup is not scheduled; nothing to change.';
    RETURN;
  END IF;

  PERFORM cron.alter_job(v_job_id, schedule => '0 * * * *');
END;
$$;

COMMIT;
