-- ============================================
-- SCRIPT 404: Fix profile trigger - remove non-existent email column
-- ============================================
-- The trigger from script 403 tries to insert into a 'email' column
-- that does not exist in user_profiles, causing ALL signups to fail with:
-- "Database error saving new user"
--
-- This script fixes the trigger to only use columns that actually exist.

-- Drop the broken trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Recreate the function WITHOUT the email column and WITH an error handler
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  final_name TEXT;
BEGIN
  -- Extract full_name from metadata, fallback to generating from email
  final_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    public.generate_name_from_email(NEW.email)
  );

  -- Insert into user_profiles using ONLY columns that exist in the table
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
  -- Log error but NEVER fail the auth process
  RAISE WARNING 'Error creating user profile for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Verify the trigger was created
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';
