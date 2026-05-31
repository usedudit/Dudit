-- WhatsApp Embedded Signup: minimal connection metadata

BEGIN;

ALTER TABLE public.partner_whatsapp_connections
  ADD COLUMN IF NOT EXISTS connection_source TEXT NOT NULL DEFAULT 'manual'
    CHECK (connection_source IN ('manual', 'embedded_signup')),
  ADD COLUMN IF NOT EXISTS waba_name TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN public.partner_whatsapp_connections.connection_source IS
  'manual = legacy pasted credentials; embedded_signup = Meta Embedded Signup';

COMMIT;
