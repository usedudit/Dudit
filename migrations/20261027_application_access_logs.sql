-- Minimal, private request log for incident response and access investigations.
-- Do not store query strings, cookies, authorization headers, or request bodies.

CREATE TABLE IF NOT EXISTS public.application_access_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address TEXT NOT NULL DEFAULT 'unknown',
  country CHAR(2),
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code SMALLINT NOT NULL CHECK (status_code BETWEEN 100 AND 599),
  user_agent TEXT,
  cloudflare_ray_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_application_access_logs_requested_at
  ON public.application_access_logs (requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_application_access_logs_ip_requested_at
  ON public.application_access_logs (ip_address, requested_at DESC);

ALTER TABLE public.application_access_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.application_access_logs FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.application_access_logs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.application_access_logs_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.purge_old_application_access_logs()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE deleted_count BIGINT;
BEGIN
  DELETE FROM public.application_access_logs
  WHERE requested_at < now() - interval '6 months';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_application_access_logs() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-application-access-logs') THEN
      PERFORM cron.unschedule('purge-application-access-logs');
    END IF;
    PERFORM cron.schedule(
      'purge-application-access-logs',
      '30 4 * * 0',
      $cmd$SELECT public.purge_old_application_access_logs()$cmd$
    );
  END IF;
END;
$$;
