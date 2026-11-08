-- ============================================================================
-- Migration: 20261108_fix_user_profiles_missing_columns.sql
-- Fix missing columns in user_profiles table and correct public_user_profiles view
-- ============================================================================

-- Add missing columns to user_profiles that are expected by the application
-- CPF column (encrypted) for marketplace user CPF storage
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS cpf TEXT;

-- Birth date column for marketplace user profile
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS birth_date DATE;

-- The 960 migration created a view with profile_image_url but user_profiles has avatar_url
-- Fix the public_user_profiles view to use the correct column name
DROP VIEW IF EXISTS public.public_user_profiles;

CREATE VIEW public.public_user_profiles
WITH (security_barrier = true)
AS
SELECT
  id,
  user_id,
  full_name,
  avatar_url as profile_image_url
FROM public.user_profiles;

GRANT SELECT ON public.public_user_profiles TO authenticated;
GRANT SELECT ON public.public_user_profiles TO anon;

-- Note: The 'profiles' table was deprecated in migration 046_consolidate_profiles_tables.sql
-- in favor of 'user_profiles'. The public_profiles view on 'profiles' table is not recreated here.
-- If the profiles table still exists, you may want to run migration 046 to clean it up.

-- Create a simple blind index for CPF lookup (using built-in hash functions)
-- This avoids requiring pgcrypto extension for HMAC
CREATE OR REPLACE FUNCTION public.compute_cpf_lookup_hash(cpf_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE 
    WHEN $1 IS NULL OR $1 = '' THEN NULL
    ELSE encode(sha256($1::bytea), 'hex')
  END;
$$;

-- Create trigger function to maintain cpf_lookup_hash when cpf changes
CREATE OR REPLACE FUNCTION public.update_user_profiles_cpf_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.cpf IS DISTINCT FROM OLD.cpf THEN
    NEW.cpf_lookup_hash := public.compute_cpf_lookup_hash(NEW.cpf);
  END IF;
  RETURN NEW;
END;
$$;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS user_profiles_cpf_hash_trigger ON public.user_profiles;

-- Create trigger to maintain blind index
CREATE TRIGGER user_profiles_cpf_hash_trigger
  BEFORE INSERT OR UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_profiles_cpf_hash();

-- Backfill cpf_lookup_hash for existing rows with cpf
UPDATE public.user_profiles
SET cpf_lookup_hash = public.compute_cpf_lookup_hash(cpf)
WHERE cpf IS NOT NULL AND cpf_lookup_hash IS NULL;

-- Comment on new columns
COMMENT ON COLUMN public.user_profiles.cpf IS 'Encrypted CPF for marketplace users (PII, encrypted at application layer)';
COMMENT ON COLUMN public.user_profiles.birth_date IS 'Birth date for marketplace users';
COMMENT ON COLUMN public.user_profiles.cpf_lookup_hash IS 'SHA256 blind index for exact CPF lookup; does not contain the plaintext CPF.';