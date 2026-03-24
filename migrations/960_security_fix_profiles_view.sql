-- ============================================================================
-- Migration: 960_security_fix_profiles_view.sql
-- Security audit remediation: MED-01 - Replace USING(true) policy with Secure View
-- ============================================================================

-- Drop the permissive policy on the profiles table
DROP POLICY IF EXISTS "profiles_select_public_info" ON public.profiles;

-- Create a secure view with security_barrier to prevent optimization leaks
CREATE VIEW public.public_profiles 
WITH (security_barrier = true)
AS
SELECT 
  id,
  user_id,
  full_name,
  profile_image_url
FROM public.profiles;

-- Grant access to the view
GRANT SELECT ON public.public_profiles TO authenticated;
GRANT SELECT ON public.public_profiles TO anon;

-- Note: We also need to fix user_profiles if that's what's actually being used
-- in Dudit. The codebase sometimes uses profiles and sometimes user_profiles.
-- Let's secure user_profiles too just in case.

DROP POLICY IF EXISTS "user_profiles_select_public_info" ON public.user_profiles;

CREATE VIEW public.public_user_profiles
WITH (security_barrier = true)
AS
SELECT
  id,
  user_id,
  full_name,
  profile_image_url
FROM public.user_profiles;

GRANT SELECT ON public.public_user_profiles TO authenticated;
GRANT SELECT ON public.public_user_profiles TO anon;
