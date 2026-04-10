-- ============================================================================
-- MVP: transactions ↔ finance_accounts, transfer columns, transaction_type
-- Safe / idempotent on existing databases. Does not drop columns or data.
-- Accounts table in this project: public.finance_accounts (not financial_accounts).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) finance_accounts: index on partner_id (if missing; may already exist)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_finance_accounts_partner
    ON public.finance_accounts (partner_id);

-- ----------------------------------------------------------------------------
-- 2) transactions: account + transfer columns + FKs to finance_accounts
-- ----------------------------------------------------------------------------
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS account_id UUID,
    ADD COLUMN IF NOT EXISTS from_account_id UUID,
    ADD COLUMN IF NOT EXISTS to_account_id UUID;

-- FKs (named, idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'transactions_account_id_fkey'
    ) THEN
        ALTER TABLE public.transactions
            ADD CONSTRAINT transactions_account_id_fkey
            FOREIGN KEY (account_id) REFERENCES public.finance_accounts (id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'transactions_from_account_id_fkey'
    ) THEN
        ALTER TABLE public.transactions
            ADD CONSTRAINT transactions_from_account_id_fkey
            FOREIGN KEY (from_account_id) REFERENCES public.finance_accounts (id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'transactions_to_account_id_fkey'
    ) THEN
        ALTER TABLE public.transactions
            ADD CONSTRAINT transactions_to_account_id_fkey
            FOREIGN KEY (to_account_id) REFERENCES public.finance_accounts (id) ON DELETE SET NULL;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2c) transaction_type: allow 'income', 'expense', 'transfer'
--     Drop existing CHECK(s) that reference transaction_type, then re-add one.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_namespace n ON t.relnamespace = n.oid
        WHERE n.nspname = 'public'
          AND t.relname = 'transactions'
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) LIKE '%transaction_type%'
    ) LOOP
        EXECUTE format('ALTER TABLE public.transactions DROP CONSTRAINT %I', r.conname);
    END LOOP;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'transactions_transaction_type_check'
    ) THEN
        ALTER TABLE public.transactions
            ADD CONSTRAINT transactions_transaction_type_check
            CHECK (transaction_type IN ('income', 'expense', 'transfer'));
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2d) Indexes for new UUID columns
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_transactions_account_id
    ON public.transactions (account_id);

CREATE INDEX IF NOT EXISTS idx_transactions_from_account_id
    ON public.transactions (from_account_id);

CREATE INDEX IF NOT EXISTS idx_transactions_to_account_id
    ON public.transactions (to_account_id);

-- ----------------------------------------------------------------------------
-- Notes (application layer; not enforced here to keep legacy rows valid):
--   • income / expense → prefer account_id; from_account_id / to_account_id NULL
--   • transfer → account_id NULL; from_account_id = source, to_account_id = dest
-- ============================================================================
