-- ============================================
-- SCRIPT: Update profile trigger to use display_name
-- ============================================
-- This script updates the trigger that creates user profiles
-- to properly extract full_name from auth.users.display_name

-- Drop existing trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Create updated function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Extract full_name from display_name, fallback to email
  INSERT INTO public.user_profiles (
    user_id,
    email,
    full_name,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NOW(),
    NOW()
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail the trigger
  RAISE WARNING 'Error creating user profile: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Update existing profiles that have no full_name from display_name
UPDATE public.user_profiles up
SET full_name = COALESCE(
  (SELECT au.raw_user_meta_data->>'full_name' FROM auth.users au WHERE au.id = up.user_id),
  (SELECT au.email FROM auth.users au WHERE au.id = up.user_id)
)
WHERE (up.full_name IS NULL OR up.full_name = '')
AND EXISTS (SELECT 1 FROM auth.users au WHERE au.id = up.user_id);
