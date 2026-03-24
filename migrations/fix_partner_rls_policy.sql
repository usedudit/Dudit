-- Fix RLS policy to allow authenticated users to insert partners
-- Drop the old restrictive policy
DROP POLICY IF EXISTS "partners_insert_own" ON public.partners;

-- Create new policy that allows authenticated users to insert partners
CREATE POLICY "partners_insert_own"
  ON public.partners FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Also ensure authenticated users can insert profiles
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = id);
