-- WhatsApp Evolution API Support
-- Adds dedicated columns for Evolution provider metadata,
-- keeping them fully isolated from Meta Cloud API fields.

BEGIN;

-- ─── Evolution-specific columns ──────────────────────────────────────────────
-- These columns store Evolution API connection details separately from Meta fields.
-- Meta fields (phone_number_id, business_account_id, access_token_encrypted) remain
-- exclusively for Meta Cloud API usage.

ALTER TABLE public.partner_whatsapp_connections
  ADD COLUMN IF NOT EXISTS instance_name TEXT,
  ADD COLUMN IF NOT EXISTS api_url TEXT,
  ADD COLUMN IF NOT EXISTS api_key_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS evolution_webhook_secret TEXT,
  ADD COLUMN IF NOT EXISTS connection_source TEXT NOT NULL DEFAULT 'manual';

COMMENT ON COLUMN public.partner_whatsapp_connections.instance_name IS
  'Evolution API: instance name for this connection';
COMMENT ON COLUMN public.partner_whatsapp_connections.api_url IS
  'Evolution API: base URL of the Evolution server';
COMMENT ON COLUMN public.partner_whatsapp_connections.api_key_encrypted IS
  'Evolution API: encrypted API key (AES-256-GCM via cryptoService)';
COMMENT ON COLUMN public.partner_whatsapp_connections.evolution_webhook_secret IS
  'Evolution API: secret for webhook signature validation';

-- ─── Expand connection_source ─────────────────────────────────────────────────

ALTER TABLE public.partner_whatsapp_connections
  DROP CONSTRAINT IF EXISTS partner_whatsapp_connections_connection_source_check;

ALTER TABLE public.partner_whatsapp_connections
  ADD CONSTRAINT partner_whatsapp_connections_connection_source_check
  CHECK (connection_source IN ('manual', 'embedded_signup', 'evolution_manual'));

-- ─── Expand status to include Evolution states ─────────────────────────────────

ALTER TABLE public.partner_whatsapp_connections
  DROP CONSTRAINT IF EXISTS partner_whatsapp_connections_status_check;

ALTER TABLE public.partner_whatsapp_connections
  ADD CONSTRAINT partner_whatsapp_connections_status_check
  CHECK (status IN ('disconnected', 'pending', 'connected', 'error', 'qr_pending', 'connecting'));

-- ─── Index for Evolution instance lookup ──────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_partner_whatsapp_connections_instance
  ON public.partner_whatsapp_connections (instance_name)
  WHERE instance_name IS NOT NULL AND provider = 'evolution';

COMMIT;
