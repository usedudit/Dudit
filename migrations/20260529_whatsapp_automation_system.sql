-- WhatsApp Automation System (multi-tenant, provider-abstracted)
-- Tables: partner_whatsapp_connections, whatsapp_templates, whatsapp_messages,
--         whatsapp_automation_logs, whatsapp_scheduled_jobs

BEGIN;

-- ─── Connections ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.partner_whatsapp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'meta' CHECK (provider IN ('meta', 'evolution', 'twilio')),
  phone_number TEXT,
  phone_number_id TEXT,
  business_account_id TEXT,
  access_token_encrypted TEXT,
  webhook_verify_token TEXT,
  webhook_secret TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'pending', 'connected', 'error')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_whatsapp_active_provider
  ON public.partner_whatsapp_connections (partner_id, provider)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_partner_whatsapp_connections_partner
  ON public.partner_whatsapp_connections (partner_id, updated_at DESC);

-- ─── Templates ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'meta',
  template_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'utility',
  language TEXT NOT NULL DEFAULT 'pt_BR',
  content TEXT NOT NULL DEFAULT '',
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (partner_id, provider, template_name, language)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_partner
  ON public.whatsapp_templates (partner_id, is_active);

-- ─── Messages (outbox + history) ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  delivery_id UUID,
  provider TEXT NOT NULL DEFAULT 'meta',
  provider_message_id TEXT,
  phone_number TEXT NOT NULL,
  template_name TEXT,
  message_type TEXT NOT NULL DEFAULT 'template',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'sent', 'delivered', 'read', 'failed')),
  error_message TEXT,
  idempotency_key TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_idempotency
  ON public.whatsapp_messages (partner_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_partner_status
  ON public.whatsapp_messages (partner_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_pending_queue
  ON public.whatsapp_messages (status, scheduled_at, next_retry_at)
  WHERE status IN ('pending', 'queued');

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_provider_id
  ON public.whatsapp_messages (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_appointment
  ON public.whatsapp_messages (appointment_id)
  WHERE appointment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_order
  ON public.whatsapp_messages (order_id)
  WHERE order_id IS NOT NULL;

-- ─── Automation logs ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.whatsapp_automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  execution_status TEXT NOT NULL DEFAULT 'success' CHECK (execution_status IN ('success', 'skipped', 'failed')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_automation_logs_partner
  ON public.whatsapp_automation_logs (partner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_automation_logs_entity
  ON public.whatsapp_automation_logs (entity_type, entity_id);

-- ─── Scheduled jobs (reminders, delayed sends) ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.whatsapp_scheduled_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  run_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled', 'failed')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_scheduled_jobs_idempotency
  ON public.whatsapp_scheduled_jobs (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_whatsapp_scheduled_jobs_due
  ON public.whatsapp_scheduled_jobs (status, run_at)
  WHERE status = 'pending';

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.partner_whatsapp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_scheduled_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_whatsapp_connections_partner ON public.partner_whatsapp_connections;
CREATE POLICY partner_whatsapp_connections_partner ON public.partner_whatsapp_connections
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.partner_users pu
      WHERE pu.partner_id = partner_whatsapp_connections.partner_id
        AND pu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS whatsapp_templates_partner ON public.whatsapp_templates;
CREATE POLICY whatsapp_templates_partner ON public.whatsapp_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.partner_users pu
      WHERE pu.partner_id = whatsapp_templates.partner_id
        AND pu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS whatsapp_messages_partner ON public.whatsapp_messages;
CREATE POLICY whatsapp_messages_partner ON public.whatsapp_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.partner_users pu
      WHERE pu.partner_id = whatsapp_messages.partner_id
        AND pu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS whatsapp_automation_logs_partner ON public.whatsapp_automation_logs;
CREATE POLICY whatsapp_automation_logs_partner ON public.whatsapp_automation_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.partner_users pu
      WHERE pu.partner_id = whatsapp_automation_logs.partner_id
        AND pu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS whatsapp_scheduled_jobs_partner ON public.whatsapp_scheduled_jobs;
CREATE POLICY whatsapp_scheduled_jobs_partner ON public.whatsapp_scheduled_jobs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.partner_users pu
      WHERE pu.partner_id = whatsapp_scheduled_jobs.partner_id
        AND pu.user_id = auth.uid()
    )
  );

-- ─── RPC: claim pending WhatsApp messages for processing ────────────────────

CREATE OR REPLACE FUNCTION public.claim_whatsapp_messages(p_limit INT DEFAULT 10)
RETURNS SETOF public.whatsapp_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT m.id
    FROM public.whatsapp_messages m
    WHERE m.status IN ('pending', 'queued')
      AND (m.scheduled_at IS NULL OR m.scheduled_at <= now())
      AND (m.next_retry_at IS NULL OR m.next_retry_at <= now())
    ORDER BY m.created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.whatsapp_messages wm
  SET status = 'queued', payload = wm.payload || jsonb_build_object('claimed_at', now())
  FROM picked
  WHERE wm.id = picked.id
  RETURNING wm.*;
END;
$$;

-- ─── RPC: claim scheduled jobs ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.claim_whatsapp_scheduled_jobs(p_limit INT DEFAULT 20)
RETURNS SETOF public.whatsapp_scheduled_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT j.id
    FROM public.whatsapp_scheduled_jobs j
    WHERE j.status = 'pending'
      AND j.run_at <= now()
    ORDER BY j.run_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.whatsapp_scheduled_jobs wj
  SET status = 'processing', attempts = wj.attempts + 1
  FROM picked
  WHERE wj.id = picked.id
  RETURNING wj.*;
END;
$$;

COMMIT;
