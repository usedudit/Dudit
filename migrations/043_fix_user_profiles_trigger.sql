-- Recreate the handle_new_user function with proper permissions
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  full_name_value TEXT;
  wants_partner_value BOOLEAN;
BEGIN
  -- Extract values from raw_user_meta_data
  full_name_value := COALESCE(new.raw_user_meta_data->>'full_name', '');
  wants_partner_value := COALESCE((new.raw_user_meta_data->>'wants_partner')::BOOLEAN, FALSE);
  
  -- Insert into profiles table
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, full_name_value)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

  -- Insert into user_profiles table
  INSERT INTO public.user_profiles (user_id, full_name, pending_partner_registration)
  VALUES (new.id, full_name_value, wants_partner_value)
  ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name;

  RETURN new;
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail the signup
  RAISE WARNING 'Error creating user profile: %', SQLERRM;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
