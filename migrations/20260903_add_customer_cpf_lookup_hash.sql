-- Migration: Add cpf_lookup_hash to customers for instant O(1) uniqueness lookup
-- Description: Adiciona coluna para blind index (HMAC-SHA256) e índice parcial de unicidade por parceiro

ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS cpf_lookup_hash TEXT;

COMMENT ON COLUMN public.customers.cpf_lookup_hash IS 'Blind index HMAC-SHA256 do CPF normalizado para busca de unicidade O(1) sem descriptografia sequencial';

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_partner_cpf_hash
  ON public.customers (partner_id, cpf_lookup_hash)
  WHERE cpf_lookup_hash IS NOT NULL AND deleted_at IS NULL;
