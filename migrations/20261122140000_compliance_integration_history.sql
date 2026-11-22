-- Compliance & Anti-Fraud Retention:
-- 1. Immutable history of external integration accounts linked to a partner
--    (preserves external account IDs even if the user disconnects before deleting their account).
-- 2. Expanded compliance_logs columns for encrypted PII + integration/store snapshots
--    with GIN indexes for fast anti-fraud / KYC investigation.

BEGIN;

-- 1. Partner Integration History (service-role only, never stores OAuth tokens or secrets)
CREATE TABLE IF NOT EXISTS public.partner_integration_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL,
  provider_slug TEXT NOT NULL,
  external_account_id TEXT,
  external_account_email_hash TEXT,
  external_account_email_encrypted TEXT,
  external_account_email_masked TEXT,
  external_account_label TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disconnected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_integration_history_partner_provider
  ON public.partner_integration_history (partner_id, provider_slug, connected_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_integration_history_ext_account_id
  ON public.partner_integration_history (provider_slug, external_account_id)
  WHERE external_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_partner_integration_history_email_hash
  ON public.partner_integration_history (external_account_email_hash)
  WHERE external_account_email_hash IS NOT NULL;

ALTER TABLE public.partner_integration_history ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated: strictly service-role access (matching compliance_logs).

-- Backfill currently connected integrations that have an external account ID
INSERT INTO public.partner_integration_history (
  partner_id,
  provider_slug,
  external_account_id,
  connected_at
)
SELECT
  pi.partner_id,
  pi.provider_slug,
  pi.account_id,
  COALESCE(pi.connected_at, pi.created_at, NOW())
FROM public.partner_integrations pi
WHERE pi.status = 'connected'
  AND pi.account_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.partner_integration_history h
    WHERE h.partner_id = pi.partner_id
      AND h.provider_slug = pi.provider_slug
      AND h.external_account_id = pi.account_id
      AND h.disconnected_at IS NULL
  );

-- 2. Expand compliance_logs with encrypted PII & integration/store snapshots
ALTER TABLE public.compliance_logs
  ADD COLUMN IF NOT EXISTS email_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS email_masked TEXT,
  ADD COLUMN IF NOT EXISTS user_full_name_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS integrations_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS partner_stores_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS integration_account_ids TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS integration_email_hashes TEXT[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_compliance_logs_deleted_at
  ON public.compliance_logs (deleted_at DESC);

CREATE INDEX IF NOT EXISTS idx_compliance_logs_partner_id
  ON public.compliance_logs (partner_id)
  WHERE partner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_compliance_logs_integration_account_ids
  ON public.compliance_logs USING GIN (integration_account_ids);

CREATE INDEX IF NOT EXISTS idx_compliance_logs_integration_email_hashes
  ON public.compliance_logs USING GIN (integration_email_hashes);

-- 3. Include expired disconnected integration history in the 5-year compliance purge job
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

  DELETE FROM public.partner_integration_history
  WHERE disconnected_at IS NOT NULL
    AND disconnected_at < now() - interval '5 years';
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

COMMIT;
