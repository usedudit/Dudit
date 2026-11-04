BEGIN;

-- Repair the R2 worker schedule using the namespace of pg_net's actual
-- extension-owned http_post API function, not pg_extension.extnamespace.
DO $$
DECLARE
  v_net_schema TEXT;
  v_worker_command TEXT;
  v_job_id BIGINT;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'pg_cron is unavailable; R2 cleanup worker remains unscheduled.';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
     OR to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE NOTICE 'pg_net or Supabase Vault is unavailable; enable both before scheduling the R2 worker.';
    RETURN;
  END IF;

  SELECT n.nspname INTO v_net_schema
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_depend d
    ON d.classid = 'pg_proc'::regclass
   AND d.objid = p.oid
   AND d.refclassid = 'pg_extension'::regclass
   AND d.refobjid = (SELECT oid FROM pg_extension WHERE extname = 'pg_net')
   AND d.deptype = 'e'
  WHERE p.proname = 'http_post'
    AND p.pronargs = 5
    AND p.prorettype = 'bigint'::regtype
    AND p.proargnames[1:5] = ARRAY['url', 'body', 'params', 'headers', 'timeout_milliseconds']::TEXT[]
  ORDER BY n.nspname
  LIMIT 1;

  IF v_net_schema IS NULL THEN
    RAISE NOTICE 'Could not locate pg_net http_post API function; worker job was not changed.';
    RETURN;
  END IF;

  FOR v_job_id IN
    SELECT jobid FROM cron.job WHERE jobname = 'process-r2-object-cleanup'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;

  v_worker_command := format($worker$
      SELECT %I.http_post(
        url := rtrim((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'dudit_app_url'), '/')
          || '/api/internal/jobs/process-r2-cleanup',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'dudit_r2_cleanup_cron_secret'),
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object('source', 'pg_cron'),
        timeout_milliseconds := 60000
      )
      WHERE EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'dudit_app_url' AND decrypted_secret <> '')
        AND EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'dudit_r2_cleanup_cron_secret' AND decrypted_secret <> '')
    $worker$, v_net_schema);

  PERFORM cron.schedule(
    'process-r2-object-cleanup',
    '* * * * *',
    v_worker_command
  );
END;
$$;

COMMIT;
