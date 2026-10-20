-- Soft-delete for financial contacts so historical transactions keep their
-- display name (contact_id FK is ON DELETE SET NULL), while contacts no
-- longer appearing in selection lists are merely hidden.
-- Required by: Financial Cadastros > Contatos (exclusão/recuperação)

BEGIN;

-- 1. Add deleted_at column (nullable = active)
ALTER TABLE public.transaction_contacts
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- 2. Index to keep active-contact selection fast
CREATE INDEX IF NOT EXISTS idx_transaction_contacts_active
    ON public.transaction_contacts (partner_id, type, deleted_at)
    WHERE deleted_at IS NULL;

-- 3. Index for per-name lookups used in duplicate checks (active only)
CREATE INDEX IF NOT EXISTS idx_transaction_contacts_active_name
    ON public.transaction_contacts (partner_id, lower(name), type)
    WHERE deleted_at IS NULL;

COMMIT;
