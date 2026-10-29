-- The production order-expiration workflow is owned by cron-job.org, which
-- calls /api/cron/expire-orders. That route also releases inventory, cancels
-- carrier labels, syncs related records, and writes audit/notification events.
-- The pg_cron SQL job only changed the order row and could leave those side
-- effects incomplete, so remove it and prevent application roles from invoking
-- its SECURITY DEFINER helper directly.

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    FOR v_job_id IN
      SELECT jobid
      FROM cron.job
      WHERE jobname = 'dudit-expire-orders-every-minute'
        AND lower(trim(command)) = 'select public.cron_expire_expired_orders();'
    LOOP
      PERFORM cron.unschedule(v_job_id);
    END LOOP;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.cron_expire_expired_orders()
  FROM PUBLIC, anon, authenticated, service_role;
