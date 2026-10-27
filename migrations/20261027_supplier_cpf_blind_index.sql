-- Keep CPF lookup efficient after encrypting suppliers.cpf at application level.
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS cpf_lookup_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_suppliers_partner_cpf_lookup_hash
  ON public.suppliers (partner_id, cpf_lookup_hash)
  WHERE cpf_lookup_hash IS NOT NULL;

COMMENT ON COLUMN public.suppliers.cpf_lookup_hash IS
  'Blind index HMAC-SHA256 do CPF normalizado; permite localizar fornecedores sem armazenar CPF em texto puro.';
