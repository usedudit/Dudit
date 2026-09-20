-- ============================================================================
-- Migration: Add idempotency key to billing_events
-- ============================================================================
-- Adds a unique idempotency_key column to prevent duplicate billing events.
-- The key format is: {event_type}:{partner_id}:{resource_id}:{minute_bucket}
-- ============================================================================

-- Add idempotency_key column
ALTER TABLE public.billing_events
  ADD COLUMN IF NOT EXISTS idempotency_key text;

-- Create unique index (partial: only enforces uniqueness when key is not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_events_idempotency_key
  ON public.billing_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.billing_events.idempotency_key IS 'Idempotency key to prevent duplicate events. Format: {event_type}:{partner_id}:{resource_id}:{minute_bucket}';
