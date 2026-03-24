-- Script 049: Fix user_profiles creation - ensure trigger works and RLS allows inserts
-- This script removes all old triggers and creates ONE SINGLE trigger that works correctly

-- Step 1: Remove all old conflicting triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users CASCADE;
DROP TRIGGER IF EXISTS user_profile_sync_trigger ON auth.users CASCADE;
DROP TRIGGER IF EXISTS create_user_profile_trigger ON auth.users CASCADE;

-- Step 2: Remove all old functions
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.generate_name_from_email(text) CASCADE;
DROP FUNCTION IF EXISTS public.sync_user_profile() CASCADE;
DROP FUNCTION IF EXISTS public.create_user_profile_on_signup() CASCADE;

-- Step 3: Create SINGLE clean function to generate name from email
CREATE OR REPLACE FUNCTION public.generate_name_from_email(email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  name_part TEXT;
  words TEXT[];
  i INTEGER;
  result TEXT := '';
BEGIN
  -- Extract the part before @
  name_part := split_part(email, '@', 1);
  
  -- Split by dots, dashes, or underscores and capitalize each word
  words := regexp_split_to_array(name_part, '[._-]+');
  
  -- Build the name by capitalizing each word
  FOR i IN 1..array_length(words, 1) LOOP
    IF words[i] != '' THEN
      IF result = '' THEN
        result := initcap(words[i]);
      ELSE
        result := result || ' ' || initcap(words[i]);
      END IF;
    END IF;
  END LOOP;
  
  RETURN COALESCE(NULLIF(result, ''), 'User');
END;
$$;

-- Step 4: Create SINGLE trigger function that creates user_profiles
-- This function uses security definer to ensure it has proper permissions
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  final_name TEXT;
BEGIN
  -- Determine the final name: use provided name or generate from email
  final_name := COALESCE(
    new.raw_user_meta_data ->> 'full_name',
    public.generate_name_from_email(new.email)
  );

  -- Log what we're doing (comentado)
  -- RAISE NOTICE '[USER_PROFILES] Creating profile for user: %, name: %', new.id, final_name;

  -- Insert into user_profiles table with SECURITY DEFINER privileges
  INSERT INTO public.user_profiles (user_id, full_name, pending_partner_registration, created_at, updated_at)
  VALUES (
    new.id,
    final_name,
    COALESCE((new.raw_user_meta_data ->> 'wants_partner')::boolean, false),
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE 
  SET 
    full_name = EXCLUDED.full_name,
    updated_at = NOW()
  WHERE user_profiles.full_name IS NULL OR user_profiles.full_name = '';

  RETURN new;
END;
$$;

-- Step 5: Create SINGLE trigger that fires after user is created in auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Step 6: Ensure RLS policies allow the trigger to insert
-- The trigger runs with security definer, so we need a policy that allows service_role to insert
-- First, make sure RLS is enabled
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop old conflicting policies
DROP POLICY IF EXISTS users_insert_own_profile ON public.user_profiles;
DROP POLICY IF EXISTS "service_role_manage_all_profiles" ON public.user_profiles;
DROP POLICY IF EXISTS service_role_insert_profiles ON public.user_profiles;
DROP POLICY IF EXISTS users_view_own_profile ON public.user_profiles;
DROP POLICY IF EXISTS admins_view_all_profiles ON public.user_profiles;
DROP POLICY IF EXISTS users_update_own_profile ON public.user_profiles;

-- Policy para service_role (trigger/backend) pode fazer qualquer coisa
CREATE POLICY service_role_all_access ON public.user_profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy para usuários verem seu próprio profile
CREATE POLICY users_view_own_profile ON public.user_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy para admins verem todos os profiles
CREATE POLICY admins_view_all_profiles ON public.user_profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- Policy para usuários atualizarem seu próprio profile
CREATE POLICY users_update_own_profile ON public.user_profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy para usuários inserirem seu próprio profile
CREATE POLICY users_insert_own_profile ON public.user_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Step 7: Manually create profiles for existing users who don't have one
INSERT INTO public.user_profiles (user_id, full_name, pending_partner_registration, created_at, updated_at)
SELECT 
  au.id,
  COALESCE(
    au.raw_user_meta_data ->> 'full_name',
    public.generate_name_from_email(au.email)
  ),
  COALESCE((au.raw_user_meta_data ->> 'wants_partner')::boolean, false),
  NOW(),
  NOW()
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_profiles up WHERE up.user_id = au.id
)
ON CONFLICT (user_id) DO NOTHING;

-- Log completion (comentado pois RAISE pode causar problemas em algumas versões)
-- RAISE NOTICE '[USER_PROFILES] User profiles creation fixed. Trigger ready.';
