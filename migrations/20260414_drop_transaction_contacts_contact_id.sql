-- Remove legacy contact_id from transaction_contacts (FK lives on transactions.contact_id only).
ALTER TABLE public.transaction_contacts
    DROP COLUMN IF EXISTS contact_id;
