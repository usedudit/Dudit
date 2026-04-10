-- =============================================================================
-- Expand transaction/contact types for financial ledger MVP
-- Safe, non-destructive and idempotent.
-- =============================================================================

-- 1) transactions.transaction_type: include adjustment + refund (and keep existing)
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
            CHECK (transaction_type IN ('income', 'expense', 'transfer', 'adjustment', 'refund'));
    END IF;
END $$;

-- 2) transaction_contacts.type: include english aliases used by integration
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
          AND t.relname = 'transaction_contacts'
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) LIKE '%type IN%'
    ) LOOP
        EXECUTE format('ALTER TABLE public.transaction_contacts DROP CONSTRAINT %I', r.conname);
    END LOOP;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'transaction_contacts_type_check'
    ) THEN
        ALTER TABLE public.transaction_contacts
            ADD CONSTRAINT transaction_contacts_type_check
            CHECK (
                type IN (
                    'cliente', 'fornecedor', 'funcionario', 'outro',
                    'customer', 'supplier', 'employee', 'other'
                )
            );
    END IF;
END $$;

