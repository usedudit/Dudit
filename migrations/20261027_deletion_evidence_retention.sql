-- Keep minimized evidence of legal acceptance and completed account deletion
-- after auth.users is removed. Retention duration is deliberately bounded.

ALTER TABLE public.user_legal_consents
  ADD COLUMN IF NOT EXISTS user_id_hash TEXT;

ALTER TABLE public.user_legal_consents
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.user_legal_consents
  DROP CONSTRAINT IF EXISTS user_legal_consents_user_id_fkey;

ALTER TABLE public.user_legal_consents
  ADD CONSTRAINT user_legal_consents_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.account_deletions
  ADD COLUMN IF NOT EXISTS user_id_hash TEXT;

ALTER TABLE public.account_deletions
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.account_deletions
  DROP CONSTRAINT IF EXISTS account_deletions_user_id_fkey;

ALTER TABLE public.account_deletions
  ADD CONSTRAINT account_deletions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.compliance_logs
  ADD COLUMN IF NOT EXISTS user_id_hash TEXT;

ALTER TABLE public.compliance_logs
  ALTER COLUMN user_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.purge_expired_deletion_evidence()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE deleted_count BIGINT := 0;
DECLARE affected BIGINT := 0;
BEGIN
  DELETE FROM public.user_legal_consents
  WHERE aceito_em < now() - interval '5 years';
  GET DIAGNOSTICS affected = ROW_COUNT;
  deleted_count := deleted_count + affected;

  DELETE FROM public.compliance_logs
  WHERE deleted_at < now() - interval '5 years';
  GET DIAGNOSTICS affected = ROW_COUNT;
  deleted_count := deleted_count + affected;

  DELETE FROM public.account_deletions
  WHERE status IN ('completed', 'failed')
    AND requested_at < now() - interval '180 days';
  GET DIAGNOSTICS affected = ROW_COUNT;
  deleted_count := deleted_count + affected;

  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_deletion_evidence() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-expired-deletion-evidence') THEN
      PERFORM cron.unschedule('purge-expired-deletion-evidence');
    END IF;
    PERFORM cron.schedule(
      'purge-expired-deletion-evidence',
      '0 5 * * 0',
      $cmd$SELECT public.purge_expired_deletion_evidence()$cmd$
    );
  END IF;
END;
$$;
