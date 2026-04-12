-- Add payment_method_id to recurring_transactions
ALTER TABLE public.recurring_transactions
ADD COLUMN IF NOT EXISTS payment_method_id UUID REFERENCES public.payment_methods(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recurring_transactions_payment_method_id 
ON public.recurring_transactions(payment_method_id);

-- Add payment_method_id to transactions
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS payment_method_id UUID REFERENCES public.payment_methods(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_payment_method_id 
ON public.transactions(payment_method_id);
