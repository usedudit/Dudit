-- WhatsApp Phase 1 Hardening
-- Focus: existing infrastructure correctness before Meta Embedded Signup.

BEGIN;

-- 1. Align message statuses with runtime behavior.
-- retry-failed-whatsapp writes failed_permanently; allow it explicitly.
ALTER TABLE public.whatsapp_messages
  DROP CONSTRAINT IF EXISTS whatsapp_messages_status_check;

ALTER TABLE public.whatsapp_messages
  ADD CONSTRAINT whatsapp_messages_status_check
  CHECK (status IN (
    'pending',
    'queued',
    'sent',
    'delivered',
    'read',
    'failed',
    'failed_permanently'
  ));

-- 2. Prevent tenant collisions: one active Meta phone number can belong to only one active connection.
-- If this fails, resolve duplicate active phone_number_id rows before rerunning the migration.
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_whatsapp_active_phone_number_id
  ON public.partner_whatsapp_connections (phone_number_id)
  WHERE is_active = true AND phone_number_id IS NOT NULL AND phone_number_id <> '';

-- 3. Ensure webhook idempotency storage exists for WhatsApp as well as billing webhooks.
CREATE TABLE IF NOT EXISTS public.processed_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  webhook_type text NOT NULL,
  resource_id text NOT NULL,
  action text,
  status_before text,
  status_after text,
  mp_verified_status text,
  partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  request_id text,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_processed_webhook_resource
  ON public.processed_webhook_events (resource_id, webhook_type);

CREATE INDEX IF NOT EXISTS idx_processed_webhook_whatsapp
  ON public.processed_webhook_events (webhook_type, partner_id, processed_at DESC)
  WHERE webhook_type = 'whatsapp';

COMMENT ON INDEX public.idx_partner_whatsapp_active_phone_number_id IS
  'Prevents two active tenants from claiming the same WhatsApp Cloud API phone_number_id.';

COMMENT ON INDEX public.idx_processed_webhook_whatsapp IS
  'Observability and cleanup index for WhatsApp webhook idempotency records.';

COMMIT;
