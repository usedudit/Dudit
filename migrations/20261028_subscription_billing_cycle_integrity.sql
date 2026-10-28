-- ============================================================================
-- Subscription billing cycle integrity
-- ============================================================================
-- 1. One billing_purchases row per subscription per billing cycle.
-- 2. Billing cycles are anchored on a calendar day (America/Sao_Paulo), so
--    renewals never drift and a cycle is immutable once closed.
-- 3. A gateway payment id identifies exactly one payment (numeric ids only —
--    Mercado Pago payment ids; legacy preapproval ids are hex and ignored).
-- 4. Pending subscriptions are only auto-cancelled when they never got a
--    Mercado Pago preapproval (abandoned checkout). Anything with a preapproval
--    is owned by the reconciliation job, which checks the real MP status.
-- ============================================================================

BEGIN;

-- ─── 1. Billing anchor day ───────────────────────────────────────────────────

ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS billing_anchor_day smallint;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'subscriptions_billing_anchor_day_check'
    ) THEN
        ALTER TABLE public.subscriptions
            ADD CONSTRAINT subscriptions_billing_anchor_day_check
            CHECK (billing_anchor_day IS NULL OR (billing_anchor_day BETWEEN 1 AND 31));
    END IF;
END $$;

-- Existing subscriptions: keep NULL (the app derives the anchor from created_at).
-- Only new/updated subscriptions persist it explicitly.

-- ─── 2. Per-cycle identity on billing_purchases ─────────────────────────────

ALTER TABLE public.billing_purchases
    ADD COLUMN IF NOT EXISTS billing_cycle_start date;

-- Backfill the cycle date from the explicit cycle key, falling back to the
-- period start converted to the billing timezone.
UPDATE public.billing_purchases
SET billing_cycle_start = CASE
    WHEN metadata->>'cycle_key' ~ '^\d{4}-\d{2}-\d{2}$'
        THEN (metadata->>'cycle_key')::date
    WHEN billing_period_start IS NOT NULL
        THEN (billing_period_start AT TIME ZONE 'America/Sao_Paulo')::date
    ELSE NULL
END
WHERE purchase_type = 'subscription'
  AND billing_cycle_start IS NULL;

-- The old "one active purchase per partner + purchaseable" index makes a new
-- invoice per renewal impossible (the second cycle collides with the first).
-- Non-subscription purchases keep the original guarantee.
DROP INDEX IF EXISTS public.idx_billing_purchases_active_unique;

CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_purchases_non_subscription_active
    ON public.billing_purchases (partner_id, purchaseable_type, purchaseable_id, billing_period_start)
    WHERE purchase_type <> 'subscription'
      AND status IN ('pending', 'completed');

-- One purchase per subscription per cycle.
CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_purchases_subscription_cycle
    ON public.billing_purchases (subscription_id, billing_cycle_start)
    WHERE purchase_type = 'subscription'
      AND subscription_id IS NOT NULL
      AND billing_cycle_start IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_purchases_subscription_cycle
    ON public.billing_purchases (subscription_id, billing_cycle_start DESC)
    WHERE subscription_id IS NOT NULL;

-- ─── 3. One payment row per Mercado Pago payment id ────────────────────────

-- Mercado Pago payment ids are numeric. Legacy rows stored the (hexadecimal)
-- preapproval id in gateway_payment_id, so they are excluded from the index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_payments_gateway_payment
    ON public.billing_payments (gateway, gateway_payment_id)
    WHERE gateway_payment_id IS NOT NULL
      AND gateway_payment_id ~ '^[0-9]+$';

-- ─── 4. Safe stale-pending cleanup ──────────────────────────────────────────

DROP FUNCTION IF EXISTS public.cleanup_stale_pending_subscriptions();

CREATE OR REPLACE FUNCTION public.cleanup_stale_pending_subscriptions()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    cancelled_count int;
BEGIN
    -- ONLY abandoned checkouts: a pending subscription that never reached a
    -- Mercado Pago preapproval. Subscriptions with a preapproval are reconciled
    -- against the real gateway status (and grace period) by the app.
    WITH cancelled AS (
        UPDATE public.subscriptions
        SET status = 'cancelled',
            cancelled_at = now(),
            ended_at = now(),
            updated_at = now()
        WHERE status = 'pending'
          AND mercado_pago_subscription_id IS NULL
          AND created_at < now() - interval '24 hours'
        RETURNING id
    )
    SELECT count(*) INTO cancelled_count FROM cancelled;

    RETURN cancelled_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_stale_pending_subscriptions() FROM PUBLIC, anon, authenticated;

COMMIT;
