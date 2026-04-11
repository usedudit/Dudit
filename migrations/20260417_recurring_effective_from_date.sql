-- =============================================================================
-- Add effective_from_date to recurring_transactions
-- Ensures edits to recurring only apply from a given date forward.
-- =============================================================================

ALTER TABLE public.recurring_transactions
    ADD COLUMN IF NOT EXISTS effective_from_date TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.recurring_transactions.effective_from_date
    IS 'When set, changes to this template only apply to occurrences on or after this date.';

-- Harden the unique index: prevent duplicate recurring payments for the same date.
-- The existing index uses (recurring_id, transaction_date). We also need (recurring_id, due_date).
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_recurring_due_date_unique
    ON public.transactions(recurring_id, due_date)
    WHERE recurring_id IS NOT NULL AND due_date IS NOT NULL;
