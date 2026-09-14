-- ============================================================================
-- Migration: Add accept_orders_when_closed to stores
-- Description: Controls whether a store accepts orders when outside business hours
-- Default: true (orders allowed when closed)
-- ============================================================================

BEGIN;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS accept_orders_when_closed BOOLEAN DEFAULT true;

COMMIT;
