-- ============================================================================
-- Mercado Pago STATUS fields: partners.mp_* -> partner_integrations
--
-- Follow-up to 20260928_mercadopago_to_partner_integrations.sql, which moved
-- the credentials. This one moves the status/display fields:
--
--   partners.mp_user_id                -> account_id + status
--   partners.mp_connected_at           -> connected_at
--   partners.mp_public_key             -> config.public_key
--   partners.mp_live_mode              -> config.live_mode
--   partners.mp_accepted_payment_methods -> config.accepted_payment_methods
--
-- RUN THIS IMMEDIATELY BEFORE deploying the build that switches status reads
-- to partner_integrations: until that deploy, partners is the authoritative
-- source (the app dual-writes status to both places, so re-running this while
-- the old/new builds are in place is harmless).
--
-- Never touches secrets: access_token_encrypted, credentials and metadata are
-- owned by the integration row since 20260928 and are left untouched here.
--
-- MUST RUN BEFORE the build that removed the dual-write goes live: after it,
-- partners.mp_* is frozen, so this file can no longer tell an old disconnect
-- apart from a new connect and is unsafe to run (it would revert one of them).
-- 20260930_drop_mercadopago_legacy_columns.sql drops the columns afterwards.
-- ============================================================================

-- ─── Connected: mirror the connection state onto the integration row ────────

UPDATE public.partner_integrations pi
SET
  status       = 'connected',
  account_id   = p.mp_user_id,
  connected_at = p.mp_connected_at,
  config = COALESCE(pi.config, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'public_key',               p.mp_public_key,
    'live_mode',                p.mp_live_mode,
    'accepted_payment_methods', p.mp_accepted_payment_methods
  )),
  disconnected_at = NULL,
  updated_at = now()
FROM public.partners p
WHERE p.id = pi.partner_id
  AND pi.provider_slug = 'mercadopago'
  AND p.mp_user_id IS NOT NULL;

-- ─── Disconnected: mirror a disconnect that happened before this deploy ─────
-- Secrets are deliberately kept: they are inert while status is not
-- 'connected', and dropping data here could not be undone.

UPDATE public.partner_integrations pi
SET
  status           = 'disconnected',
  account_id       = NULL,
  connected_at     = NULL,
  disconnected_at  = COALESCE(pi.disconnected_at, now()),
  config = (
    (COALESCE(pi.config, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'accepted_payment_methods', p.mp_accepted_payment_methods
    ))) - 'public_key' - 'live_mode'
  ),
  updated_at = now()
FROM public.partners p
WHERE p.id = pi.partner_id
  AND pi.provider_slug = 'mercadopago'
  AND p.mp_user_id IS NULL
  AND pi.status = 'connected';
