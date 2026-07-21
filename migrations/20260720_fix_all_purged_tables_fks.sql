-- Drop conflicting constraints
ALTER TABLE public.checkout_fulfillments DROP CONSTRAINT IF EXISTS checkout_fulfillments_store_id_fkey;
ALTER TABLE public.subscription_item_credit_ledger DROP CONSTRAINT IF EXISTS subscription_item_credit_ledger_service_id_fkey;
ALTER TABLE public.subscription_item_credit_ledger DROP CONSTRAINT IF EXISTS subscription_item_credit_ledger_product_id_fkey;
ALTER TABLE public.subscription_item_credits DROP CONSTRAINT IF EXISTS subscription_item_credits_service_id_fkey;
ALTER TABLE public.subscription_item_credits DROP CONSTRAINT IF EXISTS subscription_item_credits_product_id_fkey;

-- Recreate constraints with appropriate delete actions
ALTER TABLE public.checkout_fulfillments 
  ADD CONSTRAINT checkout_fulfillments_store_id_fkey 
  FOREIGN KEY (store_id) 
  REFERENCES public.stores(id) 
  ON DELETE SET NULL;

ALTER TABLE public.subscription_item_credit_ledger 
  ADD CONSTRAINT subscription_item_credit_ledger_service_id_fkey 
  FOREIGN KEY (service_id) 
  REFERENCES public.services(id) 
  ON DELETE CASCADE;

ALTER TABLE public.subscription_item_credit_ledger 
  ADD CONSTRAINT subscription_item_credit_ledger_product_id_fkey 
  FOREIGN KEY (product_id) 
  REFERENCES public.products(id) 
  ON DELETE CASCADE;

ALTER TABLE public.subscription_item_credits 
  ADD CONSTRAINT subscription_item_credits_service_id_fkey 
  FOREIGN KEY (service_id) 
  REFERENCES public.services(id) 
  ON DELETE CASCADE;

ALTER TABLE public.subscription_item_credits 
  ADD CONSTRAINT subscription_item_credits_product_id_fkey 
  FOREIGN KEY (product_id) 
  REFERENCES public.products(id) 
  ON DELETE CASCADE;
