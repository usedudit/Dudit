-- Migration: Drop customers_cpf_format check constraint
-- Description: Remove a check constraint 'customers_cpf_format' da tabela customers.
--
-- Motivo:
-- Na Dudit, por requisitos de segurança e LGPD, o CPF do cliente é criptografado com AES-256-GCM
-- na camada de aplicação (função encryptCPF em lib/cryptoService.ts).
-- O valor gravado na coluna customers.cpf possui o formato versionado com Base64 (ex: "v2:..."),
-- e para buscas e unicidade utiliza-se a coluna blind index 'cpf_lookup_hash' (HMAC-SHA256).
-- Como o valor gravado é um ciphertext criptografado, ele nunca satisfaz a regex '^\d{11}$',
-- fazendo com que qualquer inserção/atualização de CPF falhasse com erro de check constraint.

ALTER TABLE public.customers 
  DROP CONSTRAINT IF EXISTS customers_cpf_format;
