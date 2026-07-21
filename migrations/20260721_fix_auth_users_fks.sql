-- Drop existing constraints
ALTER TABLE public.partner_invitations DROP CONSTRAINT IF EXISTS partner_invitations_created_by_user_id_fkey;
ALTER TABLE public.partner_invitations DROP CONSTRAINT IF EXISTS partner_invitations_revoked_by_fkey;
ALTER TABLE public.partner_invitations DROP CONSTRAINT IF EXISTS partner_invitations_used_by_fkey;
ALTER TABLE public.partners DROP CONSTRAINT IF EXISTS partners_erp_disabled_by_fkey;
ALTER TABLE public.partners DROP CONSTRAINT IF EXISTS partners_suspended_by_fkey;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_deleted_by_fkey;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_moderation_reviewed_by_fkey;
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_reporter_user_id_fkey;
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_resolved_by_fkey;
ALTER TABLE public.services DROP CONSTRAINT IF EXISTS services_deleted_by_fkey;
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_created_by_fkey;
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_banned_by_fkey;

-- Recreate with ON DELETE SET NULL
ALTER TABLE public.partner_invitations 
  ADD CONSTRAINT partner_invitations_created_by_user_id_fkey 
  FOREIGN KEY (created_by_user_id) 
  REFERENCES auth.users(id) 
  ON DELETE SET NULL;

ALTER TABLE public.partner_invitations 
  ADD CONSTRAINT partner_invitations_revoked_by_fkey 
  FOREIGN KEY (revoked_by) 
  REFERENCES auth.users(id) 
  ON DELETE SET NULL;

ALTER TABLE public.partner_invitations 
  ADD CONSTRAINT partner_invitations_used_by_fkey 
  FOREIGN KEY (used_by) 
  REFERENCES auth.users(id) 
  ON DELETE SET NULL;

ALTER TABLE public.partners 
  ADD CONSTRAINT partners_erp_disabled_by_fkey 
  FOREIGN KEY (erp_disabled_by) 
  REFERENCES auth.users(id) 
  ON DELETE SET NULL;

ALTER TABLE public.partners 
  ADD CONSTRAINT partners_suspended_by_fkey 
  FOREIGN KEY (suspended_by) 
  REFERENCES auth.users(id) 
  ON DELETE SET NULL;

ALTER TABLE public.products 
  ADD CONSTRAINT products_deleted_by_fkey 
  FOREIGN KEY (deleted_by) 
  REFERENCES auth.users(id) 
  ON DELETE SET NULL;

ALTER TABLE public.products 
  ADD CONSTRAINT products_moderation_reviewed_by_fkey 
  FOREIGN KEY (moderation_reviewed_by) 
  REFERENCES auth.users(id) 
  ON DELETE SET NULL;

ALTER TABLE public.reports 
  ADD CONSTRAINT reports_reporter_user_id_fkey 
  FOREIGN KEY (reporter_user_id) 
  REFERENCES auth.users(id) 
  ON DELETE SET NULL;

ALTER TABLE public.reports 
  ADD CONSTRAINT reports_resolved_by_fkey 
  FOREIGN KEY (resolved_by) 
  REFERENCES auth.users(id) 
  ON DELETE SET NULL;

ALTER TABLE public.services 
  ADD CONSTRAINT services_deleted_by_fkey 
  FOREIGN KEY (deleted_by) 
  REFERENCES auth.users(id) 
  ON DELETE SET NULL;

ALTER TABLE public.stock_movements 
  ADD CONSTRAINT stock_movements_created_by_fkey 
  FOREIGN KEY (created_by) 
  REFERENCES auth.users(id) 
  ON DELETE SET NULL;

ALTER TABLE public.user_profiles 
  ADD CONSTRAINT user_profiles_banned_by_fkey 
  FOREIGN KEY (banned_by) 
  REFERENCES auth.users(id) 
  ON DELETE SET NULL;
