-- Drop constraint transactions_status_check and recreate it allowing 'cancelled'
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_status_check CHECK (status IN ('pending', 'paid', 'overdue', 'active', 'cancelled'));
