-- ============================================================================
-- Migration: split the "one live subscription per partner" unique index
-- Created: 2026-11-01
--
-- Why:
--   The plan-change flow keeps the PAID contract running while a new checkout
--   waits for payment (`status = 'pending'`). The old index
--   `idx_subscriptions_active_partner` covered
--   ('active','trialing','past_due','pending') at once, so inserting the pending
--   attempt next to the active row failed with:
--       duplicate key value violates unique constraint "idx_subscriptions_active_partner"
--
--   Splitting it keeps both guarantees we actually need:
--     - at most ONE effective contract per partner (active/trialing/past_due)
--     - at most ONE pending checkout attempt per partner
--   while allowing the two to coexist.
--
-- Safety:
--   The old index was strictly stronger, so any data that satisfied it also
--   satisfies both new indexes. No cleanup/backfill is required.
-- ============================================================================

DROP INDEX IF EXISTS public.idx_subscriptions_active_partner;

-- One effective contract per partner.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_one_effective_per_partner
    ON public.subscriptions (partner_id)
    WHERE status IN ('active', 'trialing', 'past_due');

-- One unfinished checkout attempt per partner.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_one_pending_per_partner
    ON public.subscriptions (partner_id)
    WHERE status = 'pending';

COMMENT ON INDEX public.idx_subscriptions_one_effective_per_partner IS
    'At most one active/trialing/past_due subscription per partner.';
COMMENT ON INDEX public.idx_subscriptions_one_pending_per_partner IS
    'At most one pending (unpaid plan-change) subscription per partner.';
