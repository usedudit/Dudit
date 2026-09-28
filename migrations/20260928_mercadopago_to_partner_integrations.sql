-- ============================================================================
-- Mercado Pago credentials: partners.mp_* -> partner_integrations
--
-- Follow-up to 20260926_integration_tables.sql (SuperFrete was the first
-- consumer of the integrations model). This is the "payment" category.
--
--   partners.mp_access_token_encrypted  -> access_token_encrypted
--   partners.mp_refresh_token_encrypted -> credentials.refresh_token_encrypted
--   partners.mp_token_expires_at        -> metadata.token_expires_at
--   partners.mp_user_id                 -> account_id + status
--   partners.mp_public_key
--   partners.mp_live_mode
--   partners.mp_accepted_payment_methods -> config
--   partners.mp_connected_at             -> connected_at
--
-- Encryption context is unchanged (cryptoService context "mercadopago" ==
-- provider slug), so encrypted values are copied verbatim: no re-encryption.
--
-- partners.mp_* columns are KEPT: they remain the read path for status fields
-- until the follow-up migration switches reads, and they are the rollback
-- window. Only partners with a real connection signal are backfilled.
--
-- SAFE TO RE-RUN (e.g. right after a deploy, to pick up tokens written by the
-- old code during the deploy window): statement 1 never overwrites an existing
-- integration row, and statement 2 only copies secrets forward when partners
-- holds a NEWER token (compared by expiry). Once the new code is live, partners
-- stops being written and statement 2 becomes a no-op.
-- ============================================================================

INSERT INTO public.integration_providers (slug, category, name)
VALUES ('mercadopago', 'payment', 'Mercado Pago')
ON CONFLICT (slug) DO NOTHING;

-- ─── 1. Initial backfill (never overwrites an existing connection) ──────────

INSERT INTO public.partner_integrations (
  partner_id,
  provider_slug,
  status,
  account_id,
  access_token_encrypted,
  credentials,
  config,
  metadata,
  connected_at
)
SELECT
  p.id,
  'mercadopago',
  'connected',
  p.mp_user_id,
  p.mp_access_token_encrypted,
  CASE
    WHEN p.mp_refresh_token_encrypted IS NOT NULL
      THEN jsonb_build_object('refresh_token_encrypted', p.mp_refresh_token_encrypted)
    ELSE '{}'::jsonb
  END,
  jsonb_strip_nulls(jsonb_build_object(
    'public_key',                p.mp_public_key,
    'live_mode',                 p.mp_live_mode,
    'accepted_payment_methods',  p.mp_accepted_payment_methods
  )),
  jsonb_strip_nulls(jsonb_build_object(
    'token_expires_at',
      to_char(p.mp_token_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )),
  p.mp_connected_at
FROM public.partners p
WHERE p.mp_user_id IS NOT NULL
   OR p.mp_access_token_encrypted IS NOT NULL
   OR p.mp_refresh_token_encrypted IS NOT NULL
   OR p.mp_connected_at IS NOT NULL
ON CONFLICT (partner_id, provider_slug) DO NOTHING;

-- ─── 2. Forward-only secret re-sync (deploy window safety) ──────────────────

UPDATE public.partner_integrations pi
SET
  access_token_encrypted = p.mp_access_token_encrypted,
  credentials = CASE
    WHEN p.mp_refresh_token_encrypted IS NOT NULL
      THEN jsonb_build_object('refresh_token_encrypted', p.mp_refresh_token_encrypted)
    ELSE '{}'::jsonb
  END,
  metadata = COALESCE(pi.metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'token_expires_at',
      to_char(p.mp_token_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )),
  updated_at = now()
FROM public.partners p
WHERE p.id = pi.partner_id
  AND pi.provider_slug = 'mercadopago'
  AND p.mp_access_token_encrypted IS NOT NULL
  AND p.mp_token_expires_at IS NOT NULL
  AND (
    pi.metadata->>'token_expires_at' IS NULL
    OR p.mp_token_expires_at > (pi.metadata->>'token_expires_at')::timestamptz
  );
