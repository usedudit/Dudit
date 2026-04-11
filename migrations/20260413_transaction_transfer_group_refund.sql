-- =============================================================================
-- Transfer group + refund metadata (safe / idempotent)
-- =============================================================================

ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS transfer_group_id UUID NULL,
    ADD COLUMN IF NOT EXISTS refund_kind TEXT NULL,
    ADD COLUMN IF NOT EXISTS reference_note TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_transfer_group_id
    ON public.transactions (transfer_group_id);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_refund_kind_check') THEN
        ALTER TABLE public.transactions
            ADD CONSTRAINT transactions_refund_kind_check
            CHECK (
                refund_kind IS NULL
                OR refund_kind IN ('expense_refund', 'revenue_refund')
            );
    END IF;
END $$;
