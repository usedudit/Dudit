-- ============================================================================
-- Migration: 965_reapply_profile_trigger.sql
-- Re-apply the user profile auto-creation trigger and backfill missing profiles
-- ============================================================================

-- 1. Drop existing trigger to avoid conflicts
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- 2. Create helper function to generate name from email
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
  name_part := split_part(email, '@', 1);
  words := regexp_split_to_array(name_part, '[._-]+');
  
  FOR i IN 1..array_length(words, 1) LOOP
    IF words[i] != '' THEN
      IF result = '' THEN
        result := initcap(words[i]);
      ELSE
        result := result || ' ' || initcap(words[i]);
      END IF;
    END IF;
  END LOOP;
  
  RETURN COALESCE(NULLIF(result, ''), 'Usuário');
END;
$$;

-- 3. Create the profile handler function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  final_name TEXT;
BEGIN
  -- Priority: full_name > name (OAuth) > generated from email
  final_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    public.generate_name_from_email(NEW.email)
  );

  INSERT INTO public.user_profiles (
    user_id,
    full_name,
    pending_partner_registration,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    final_name,
    COALESCE((NEW.raw_user_meta_data->>'wants_partner')::boolean, false),
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    full_name = EXCLUDED.full_name,
    updated_at = NOW()
  WHERE user_profiles.full_name IS NULL OR user_profiles.full_name = '';

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Error in handle_new_user for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- 4. Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 5. Ensure RLS allows service_role to insert (trigger runs as SECURITY DEFINER)
DROP POLICY IF EXISTS "service_role_all_access" ON public.user_profiles;
CREATE POLICY "service_role_all_access" ON public.user_profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 6. Backfill missing profiles for existing users
INSERT INTO public.user_profiles (user_id, full_name, pending_partner_registration, created_at, updated_at)
SELECT 
  au.id,
  COALESCE(
    au.raw_user_meta_data->>'full_name',
    au.raw_user_meta_data->>'name',
    public.generate_name_from_email(au.email)
  ),
  COALESCE((au.raw_user_meta_data->>'wants_partner')::boolean, false),
  NOW(),
  NOW()
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_profiles up WHERE up.user_id = au.id
)
ON CONFLICT (user_id) DO NOTHING;
