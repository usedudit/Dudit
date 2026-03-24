-- ============================================================================
-- Migration: Fix partner_users infinite recursion policy
-- Avoids querying partner_users inside its own RLS policy to prevent loops
-- ============================================================================

BEGIN;

-- 1. Create a SECURITY DEFINER function to fetch a user's associated partner IDs
-- This bypasses RLS and prevents the infinite recursion loop in policy evaluation.
CREATE OR REPLACE FUNCTION public.get_user_partner_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT partner_id FROM public.partner_users WHERE user_id = auth.uid()
  UNION
  SELECT id FROM public.partners WHERE user_id = auth.uid();
$$;

-- 2. Drop the recursive policy from partner_users
DROP POLICY IF EXISTS "partner_users_select" ON public.partner_users;

-- 3. Create the new policy using the SECURITY DEFINER function
CREATE POLICY "partner_users_select" ON public.partner_users
  FOR SELECT USING (
    -- User can see themselves, or anyone inside partners they have access to
    user_id = auth.uid()
    OR partner_id IN (SELECT public.get_user_partner_ids())
  );

COMMIT;
