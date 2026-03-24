-- Add encrypted CPF field to partners table
ALTER TABLE partners ADD COLUMN IF NOT EXISTS cpf_encrypted TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_partners_cpf_encrypted ON partners(cpf_encrypted);

-- Add comment explaining encryption
COMMENT ON COLUMN partners.cpf_encrypted IS 'CPF criptografado usando pgcrypto. Use pgp_sym_encrypt/pgp_sym_decrypt para criptografar/descriptografar';
