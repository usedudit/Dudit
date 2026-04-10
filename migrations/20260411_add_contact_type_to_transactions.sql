-- =============================================================================
-- Add contact_type to transactions + expand transaction_contacts.type options
-- Safe/idempotent migration for MVP.
-- =============================================================================

-- 1) New column on transactions to persist contact type directly.
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS contact_type TEXT;

-- 2) Backfill from linked transaction_contacts when available.
UPDATE public.transactions t
SET contact_type = tc.type
FROM public.transaction_contacts tc
WHERE t.contact_id = tc.id
  AND (t.contact_type IS NULL OR t.contact_type = '');

-- 3) Default for sales income when not informed.
UPDATE public.transactions
SET contact_type = 'customer'
WHERE (contact_type IS NULL OR contact_type = '')
  AND category = 'Vendas';

-- 4) CHECK on transactions.contact_type (nullable for backward compatibility).
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
          AND pg_get_constraintdef(c.oid) LIKE '%contact_type%'
    ) LOOP
        EXECUTE format('ALTER TABLE public.transactions DROP CONSTRAINT %I', r.conname);
    END LOOP;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'transactions_contact_type_check'
    ) THEN
        ALTER TABLE public.transactions
            ADD CONSTRAINT transactions_contact_type_check
            CHECK (
                contact_type IS NULL OR
                contact_type IN ('customer', 'supplier', 'service', 'employee', 'partner', 'other')
            );
    END IF;
END $$;

-- 5) Expand transaction_contacts.type for manual transactions future use.
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
                    'customer', 'supplier', 'service', 'employee', 'partner', 'other'
                )
            );
    END IF;
END $$;

-- 6) Query helper index.
CREATE INDEX IF NOT EXISTS idx_transactions_contact_type
    ON public.transactions (contact_type);

