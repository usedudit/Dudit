-- Drop legacy address and encrypted columns from suppliers table
-- Address data now lives in the addresses table
-- CPF/CNPJ encryption uses the application-level encryption (lib/crypto.ts)

ALTER TABLE public.suppliers
  DROP COLUMN IF EXISTS country,
  DROP COLUMN IF EXISTS municipio_codigo_ibge,
  DROP COLUMN IF EXISTS cpf_encrypted,
  DROP COLUMN IF EXISTS cnpj_encrypted;
