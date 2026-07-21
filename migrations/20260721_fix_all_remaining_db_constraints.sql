-- Fix all remaining constraint conflicts in the entire database schema

-- 1. Make reporter_user_id nullable in reports
ALTER TABLE public.reports ALTER COLUMN reporter_user_id DROP NOT NULL;

-- 2. Make admin_user_id nullable in admin_actions
ALTER TABLE public.admin_actions ALTER COLUMN admin_user_id DROP NOT NULL;

-- 3. Fix cancelled_by foreign key in admin_actions to ON DELETE SET NULL
ALTER TABLE public.admin_actions DROP CONSTRAINT IF EXISTS admin_actions_cancelled_by_fkey;
ALTER TABLE public.admin_actions 
  ADD CONSTRAINT admin_actions_cancelled_by_fkey 
  FOREIGN KEY (cancelled_by) 
  REFERENCES auth.users(id) 
  ON DELETE SET NULL;

-- 4. Make created_by_user_id nullable in partner_invitations
ALTER TABLE public.partner_invitations ALTER COLUMN created_by_user_id DROP NOT NULL;

-- 5. Make store_id nullable in product_kits, products, services, suppliers
ALTER TABLE public.product_kits ALTER COLUMN store_id DROP NOT NULL;
ALTER TABLE public.products ALTER COLUMN store_id DROP NOT NULL;
ALTER TABLE public.services ALTER COLUMN store_id DROP NOT NULL;
ALTER TABLE public.suppliers ALTER COLUMN store_id DROP NOT NULL;
