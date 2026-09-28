-- ============================================================================
-- DROP: Mercado Pago legacy columns on partners
--
-- End of the move started by 20260928 (credentials) and 20260929 (status):
-- partner_integrations is now the only source of truth for Mercado Pago and
-- partners no longer carries mp_* columns.
--
-- RUN ORDER (mandatory):
--   1. 20260928_mercadopago_to_partner_integrations.sql
--   2. 20260929_mercadopago_status_to_partner_integrations.sql
--   3. deploy the build that removed the dual-write (commits "Move Mercado
--      Pago status fields..." and "Source cart Mercado Pago fields...")
--   4. this file
--
-- Running this before the new build is live breaks the running app:
-- PostgREST rejects writes to unknown columns, so disconnect, the OAuth
-- callback and token refresh would start failing. Running it without steps
-- 1+2 loses whatever the legacy columns still hold.
--
-- The statements below are a safety net for rows that never reached
-- partner_integrations (steps 1+2 not run, or an OAuth event during the
-- deploy window while the old build was still live). They are forward-only:
-- INSERT ... DO NOTHING never touches an existing integration row, and the
-- token sync only copies secrets when partners holds a NEWER token. Status
-- is deliberately NOT synced here: after step 3 partners.mp_* is frozen, so
-- any legacy -> partner_integrations status write could revert a
-- disconnect/connect that already happened. That is what step 2 is for, and
-- it must run BEFORE step 3.
--
-- After this migration the previous build can no longer be deployed (it
-- selects partners.mp_*), and 20260928 / 20260929 / the rollback script are
-- obsolete. Never re-run 036/037 afterwards: they would re-add the columns.
-- ============================================================================

INSERT INTO public.integration_providers (slug, category, name)
VALUES ('mercadopago', 'payment', 'Mercado Pago')
ON CONFLICT (slug) DO NOTHING;

-- ─── Safety net 1: integration rows that do not exist yet ───────────────────
-- status is 'connected' only when there is a real connection signal; a legacy
-- row with secrets but no mp_user_id was never usable as connected (the app
-- gates on account_id), so it is restored as 'disconnected' with its secrets.

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
  CASE WHEN p.mp_user_id IS NOT NULL THEN 'connected' ELSE 'disconnected' END,
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

-- ─── Safety net 2: forward-only secret sync (deploy window) ─────────────────
-- Only fires when partners holds a token that is newer than the one stored in
-- partner_integrations, i.e. a refresh written by the old build between the
-- last sync and the deploy. After step 3 partners stops being written and
-- this becomes a no-op.

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

-- ─── Dependents (only exist if the database never reached migration 156) ────
-- partners_checkout_secure and partners_public_secure were dropped as unused
-- by 156_remove_unused_views.sql; partners_checkout was dropped by
-- 150. They select p.mp_public_key, and dropping a column a view depends on
-- fails without CASCADE -- drop them explicitly instead of relying on CASCADE,
-- which would take unrelated objects with them.

DROP VIEW IF EXISTS public.partners_checkout_secure CASCADE;
DROP VIEW IF EXISTS public.partners_public_secure CASCADE;
DROP VIEW IF EXISTS public.partners_checkout CASCADE;

-- Secret helper created outside the migrations; revoked from anon/authenticated
-- by 20260801 and never referenced by the app. It reads mp_access_token_encrypted.

DROP FUNCTION IF EXISTS public.get_partner_mp_token(uuid);

-- ─── The drop ───────────────────────────────────────────────────────────────

ALTER TABLE public.partners
  DROP COLUMN IF EXISTS mp_user_id,
  DROP COLUMN IF EXISTS mp_access_token_encrypted,
  DROP COLUMN IF EXISTS mp_refresh_token_encrypted,
  DROP COLUMN IF EXISTS mp_public_key,
  DROP COLUMN IF EXISTS mp_token_expires_at,
  DROP COLUMN IF EXISTS mp_connected_at,
  DROP COLUMN IF EXISTS mp_live_mode,
  DROP COLUMN IF EXISTS mp_accepted_payment_methods;

DROP INDEX IF EXISTS idx_partners_mp_user_id;

-- ─── Verification: must return zero rows ────────────────────────────────────

SELECT table_name, column_name
FROM information_schema.columns
WHERE table_name = 'partners' AND column_name LIKE 'mp\_%'
ORDER BY column_name;
