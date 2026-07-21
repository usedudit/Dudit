-- Drop existing restrict/no-action constraints pointing to partner_users
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_seller_partner_user_id_fkey;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_seller_partner_user_id_fkey;

-- Recreate constraints with ON DELETE SET NULL to allow partner_users to be deleted
ALTER TABLE public.orders 
  ADD CONSTRAINT orders_seller_partner_user_id_fkey 
  FOREIGN KEY (seller_partner_user_id) 
  REFERENCES public.partner_users(id) 
  ON DELETE SET NULL;

ALTER TABLE public.transactions 
  ADD CONSTRAINT transactions_seller_partner_user_id_fkey 
  FOREIGN KEY (seller_partner_user_id) 
  REFERENCES public.partner_users(id) 
  ON DELETE SET NULL;
