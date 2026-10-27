-- Blind index keeps exact CPF lookups working after user_profiles.cpf is encrypted.
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS cpf_lookup_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_user_profiles_cpf_lookup_hash
  ON public.user_profiles (cpf_lookup_hash)
  WHERE cpf_lookup_hash IS NOT NULL;

COMMENT ON COLUMN public.user_profiles.cpf_lookup_hash IS
  'HMAC blind index for exact CPF lookup; does not contain the plaintext CPF.';
