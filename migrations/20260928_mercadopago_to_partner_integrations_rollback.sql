-- ============================================================================
-- ROLLBACK for 20260928_mercadopago_to_partner_integrations.sql
--
-- *** OBSOLETE after 20260930_drop_mercadopago_legacy_columns.sql ***
-- The partners.mp_* columns this script writes no longer exist, so it fails
-- by design. Rolling back is only possible before that drop: re-deploy the
-- previous build and re-run 20260928 + 20260929 to put partner_integrations
-- back in sync. After the drop, restoring a connection means reconnecting
-- Mercado Pago.
--
-- Restores the pre-migration state of the Mercado Pago columns on partners so
-- that an older application build (which reads partners.mp_*) keeps working.
-- Secrets are copied verbatim: encryption context is identical
-- (cryptoService "mercadopago" == provider slug), no re-encryption needed.
--
-- Run this ONLY when rolling the application back to a build that predates the
-- partner_integrations read path AND before 20260930 has been applied.
-- ============================================================================

-- Connections: restore every mp_* field from the integration row.
UPDATE public.partners p
SET
  mp_user_id                = pi.account_id,
  mp_access_token_encrypted = pi.access_token_encrypted,
  mp_refresh_token_encrypted = pi.credentials->>'refresh_token_encrypted',
  mp_public_key             = pi.config->>'public_key',
  mp_live_mode              = NULLIF(pi.config->>'live_mode', '')::boolean,
  mp_token_expires_at       = NULLIF(pi.metadata->>'token_expires_at', '')::timestamptz,
  mp_connected_at           = pi.connected_at,
  mp_accepted_payment_methods = COALESCE(
    pi.config->'accepted_payment_methods',
    p.mp_accepted_payment_methods
  )
FROM public.partner_integrations pi
WHERE pi.partner_id = p.id
  AND pi.provider_slug = 'mercadopago'
  AND pi.status = 'connected';

-- Disconnected after the migration: mirror the disconnect behaviour on partners.
UPDATE public.partners p
SET
  mp_user_id                 = NULL,
  mp_access_token_encrypted  = NULL,
  mp_refresh_token_encrypted = NULL,
  mp_public_key              = NULL,
  mp_live_mode               = NULL,
  mp_token_expires_at        = NULL,
  mp_connected_at            = NULL
FROM public.partner_integrations pi
WHERE pi.partner_id = p.id
  AND pi.provider_slug = 'mercadopago'
  AND pi.status <> 'connected'
  AND (
    p.mp_user_id IS NOT NULL
    OR p.mp_access_token_encrypted IS NOT NULL
    OR p.mp_connected_at IS NOT NULL
  );
