-- =============================================================================
-- Recurring refactor: explicit status, no materialized pending from cron,
-- execute helper for occurrence math from clients.
-- =============================================================================

-- Lifecycle: active = generating occurrences; paused = user paused; cancelled = ended by user.
ALTER TABLE public.recurring_transactions
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'recurring_transactions_status_check'
    ) THEN
        ALTER TABLE public.recurring_transactions
            ADD CONSTRAINT recurring_transactions_status_check
            CHECK (status IN ('active', 'paused', 'cancelled'));
    END IF;
END $$;

-- Backfill from legacy active flag (preserves explicit cancellations on re-run)
UPDATE public.recurring_transactions
SET status = CASE
    WHEN status = 'cancelled' THEN 'cancelled'
    WHEN active THEN 'active'
    ELSE 'paused'
END;

-- Cron job must NOT insert pending ledger rows; occurrences are derived in app from template.
CREATE OR REPLACE FUNCTION public.process_due_recurring_transactions(p_limit INTEGER DEFAULT 200)
RETURNS TABLE(processed_count INTEGER, created_count INTEGER, deactivated_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY SELECT 0::INTEGER, 0::INTEGER, 0::INTEGER;
END;
$$;

-- Allow authenticated partners to call next-run math (used by occurrence generator).
GRANT EXECUTE ON FUNCTION public.financial_next_run_date(
    TEXT, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER[], INTEGER, BOOLEAN, INTEGER, INTEGER
) TO authenticated, service_role;
