-- Restricted register required for documenting personal data security incidents.
-- Store incident facts and minimization decisions, not raw exposed records.

CREATE TABLE IF NOT EXISTS public.security_incident_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_code TEXT UNIQUE,
  discovered_at TIMESTAMPTZ NOT NULL,
  occurred_at TIMESTAMPTZ,
  circumstances TEXT NOT NULL,
  data_categories TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  affected_data_subjects_count INTEGER CHECK (affected_data_subjects_count IS NULL OR affected_data_subjects_count >= 0),
  risk_assessment TEXT NOT NULL,
  mitigation_actions TEXT,
  notified_anpd BOOLEAN,
  anpd_notified_at TIMESTAMPTZ,
  notified_data_subjects BOOLEAN,
  data_subjects_notified_at TIMESTAMPTZ,
  notification_content JSONB,
  no_notification_reason TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assessed', 'mitigating', 'closed')) ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (notified_anpd IS DISTINCT FROM FALSE OR no_notification_reason IS NOT NULL),
  CHECK (notified_data_subjects IS DISTINCT FROM FALSE OR no_notification_reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_security_incident_records_created_at
  ON public.security_incident_records (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_incident_records_status
  ON public.security_incident_records (status, discovered_at DESC);

ALTER TABLE public.security_incident_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_incident_records FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_incident_records TO service_role;

CREATE OR REPLACE FUNCTION public.purge_expired_security_incident_records()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE deleted_count BIGINT;
BEGIN
  DELETE FROM public.security_incident_records
  WHERE created_at < now() - interval '5 years';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_security_incident_records() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-expired-security-incident-records') THEN
      PERFORM cron.unschedule('purge-expired-security-incident-records');
    END IF;
    PERFORM cron.schedule(
      'purge-expired-security-incident-records',
      '0 5 * * 0',
      $cmd$SELECT public.purge_expired_security_incident_records()$cmd$
    );
  END IF;
END;
$$;
