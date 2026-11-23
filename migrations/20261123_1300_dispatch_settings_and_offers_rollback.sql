-- ============================================================================
-- Rollback: 20261123_1300_dispatch_settings_and_offers_rollback.sql
-- ============================================================================

ALTER TABLE public.delivery_assignments
  DROP CONSTRAINT IF EXISTS delivery_assignments_bonus_amount_check,
  DROP COLUMN IF EXISTS dispatch_started_at,
  DROP COLUMN IF EXISTS dispatch_tier,
  DROP COLUMN IF EXISTS dispatch_exhausted_at,
  DROP COLUMN IF EXISTS dispatch_exhausted_reason,
  DROP COLUMN IF EXISTS bonus_amount,
  DROP COLUMN IF EXISTS bonus_authorized_by,
  DROP COLUMN IF EXISTS bonus_authorized_at,
  DROP COLUMN IF EXISTS bonus_reason;

DROP TABLE IF EXISTS public.delivery_dispatch_events;
DROP TABLE IF EXISTS public.delivery_offers;
DROP TABLE IF EXISTS public.dispatch_settings;
