-- ============================================================================
-- Migration: Subscription System Hardening
-- Created: 2026-04-21
-- Description: 
--   1. Adds `past_due_at` column to subscriptions for deterministic grace period
--   2. Creates `processed_webhook_events` table for DB-level idempotency
-- ============================================================================

-- ─── 1. Add past_due_at to subscriptions ────────────────────────────────────
-- 
-- This column records the EXACT moment a subscription transitions to past_due.
-- Used as the deterministic anchor for the grace period calculation.
-- Unlike updated_at (changes on any update) or current_period_end (may not be 
-- synced), this field is set ONLY when payment failure is confirmed via webhook.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS past_due_at timestamptz;

-- Index for grace period queries (only matters when status = past_due)
CREATE INDEX IF NOT EXISTS idx_subscriptions_past_due_at
  ON public.subscriptions (partner_id, past_due_at)
  WHERE status = 'past_due';

COMMENT ON COLUMN public.subscriptions.past_due_at IS 
  'Timestamp when subscription entered past_due status. Set by webhook only. Used as anchor for grace period calculation.';

-- ─── 2. Processed Webhook Events (DB-level idempotency) ─────────────────────
-- 
-- Guarantees that duplicate webhook events are physically impossible to process.
-- Uses a UNIQUE constraint on idempotency_key — if a duplicate INSERT is 
-- attempted, the DB rejects it via ON CONFLICT, and the webhook handler skips.

CREATE TABLE IF NOT EXISTS public.processed_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Unique key derived from webhook data: e.g. "sub_{mp_id}_{action}_{request_id}"
  -- The UNIQUE constraint is the actual enforcement mechanism.
  idempotency_key text NOT NULL UNIQUE,
  
  -- Context for debugging / auditing
  webhook_type text NOT NULL,          -- 'payment' or 'subscription'
  resource_id text NOT NULL,           -- MP payment ID or subscription ID
  action text,                         -- MP action (authorized, cancelled, etc.)
  status_before text,                  -- Local status before processing
  status_after text,                   -- Local status after processing
  mp_verified_status text,             -- Status confirmed by MP API
  partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  
  -- Metadata
  request_id text,                     -- x-request-id header from MP
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;

-- No RLS policies = service role only (webhooks use admin client)

-- Index for lookups by resource
CREATE INDEX IF NOT EXISTS idx_processed_webhook_resource
  ON public.processed_webhook_events (resource_id, webhook_type);

-- TTL cleanup: events older than 90 days can be safely purged
-- Run periodically via pg_cron if table grows large:
--
--   SELECT cron.schedule(
--     'cleanup-old-webhook-events',
--     '0 3 * * 0',  -- Weekly at 3am Sunday
--     $$DELETE FROM public.processed_webhook_events WHERE processed_at < now() - interval '90 days'$$
--   );

COMMENT ON TABLE public.processed_webhook_events IS 
  'Database-level idempotency for webhook processing. UNIQUE constraint on idempotency_key prevents duplicate event processing.';
