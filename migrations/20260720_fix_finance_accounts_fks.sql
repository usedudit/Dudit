-- Drop existing restrict constraints
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_finance_account_id_fkey;
ALTER TABLE public.payment_methods DROP CONSTRAINT IF EXISTS payment_methods_default_finance_account_id_fkey;

-- Recreate constraints with ON DELETE SET NULL to allow partners/finance accounts to be deleted
ALTER TABLE public.orders 
  ADD CONSTRAINT orders_finance_account_id_fkey 
  FOREIGN KEY (finance_account_id) 
  REFERENCES public.finance_accounts(id) 
  ON DELETE SET NULL;

ALTER TABLE public.payment_methods 
  ADD CONSTRAINT payment_methods_default_finance_account_id_fkey 
  FOREIGN KEY (default_finance_account_id) 
  REFERENCES public.finance_accounts(id) 
  ON DELETE SET NULL;
