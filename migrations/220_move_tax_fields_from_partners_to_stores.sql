-- Migration: Move tax/business fields from partners table to stores table
-- Description: business_type, cnpj, cpf, crt, contribuinte, inscricao_estadual,
--   ie_isento, inscricao_municipal agora são configurados por store (loja),
--   não mais por partner (parceiro).

BEGIN;

-- ============================================================
-- 1. Add columns to stores (if not already present)
-- ============================================================
-- Note: crt, contribuinte, inscricao_estadual, ie_isento, inscricao_municipal
--   já foram adicionados em 210_add_fiscal_fields_to_stores.sql

ALTER TABLE stores
ADD COLUMN IF NOT EXISTS business_type TEXT DEFAULT 'pf',
ADD COLUMN IF NOT EXISTS cnpj TEXT,
ADD COLUMN IF NOT EXISTS cpf TEXT;

-- ============================================================
-- 2. Copy existing data from partners to the headquarters store
-- ============================================================
UPDATE stores s
SET
  business_type = p.business_type,
  cnpj = p.cnpj,
  cpf = p.cpf,
  crt = COALESCE(s.crt, p.crt),
  contribuinte = COALESCE(s.contribuinte, p.contribuinte),
  inscricao_estadual = COALESCE(s.inscricao_estadual, p.inscricao_estadual),
  ie_isento = COALESCE(s.ie_isento, p.ie_isento, false),
  inscricao_municipal = COALESCE(s.inscricao_municipal, p.inscricao_municipal)
FROM partners p
WHERE s.partner_id = p.id
  AND s.is_headquarters = true;

-- ============================================================
-- 3. Add constraints and indexes
-- ============================================================
ALTER TABLE stores
ADD CONSTRAINT stores_business_type_check
CHECK (business_type IN ('pf', 'pj'));

CREATE INDEX IF NOT EXISTS idx_stores_cnpj ON stores(cnpj) WHERE cnpj IS NOT NULL;

-- ============================================================
-- 4. Comments
-- ============================================================
COMMENT ON COLUMN stores.business_type IS 'Tipo de pessoa: pf (Pessoa Física) ou pj (Pessoa Jurídica)';
COMMENT ON COLUMN stores.cnpj IS 'CNPJ da loja (apenas para PJ)';
COMMENT ON COLUMN stores.cpf IS 'CPF da loja (criptografado)';

-- ============================================================
-- 5. Drop columns from partners (moved to stores)
-- ============================================================
ALTER TABLE partners
  DROP CONSTRAINT IF EXISTS partners_cnpj_format,
  DROP COLUMN IF EXISTS business_type,
  DROP COLUMN IF EXISTS cnpj,
  DROP COLUMN IF EXISTS cpf,
  DROP COLUMN IF EXISTS cpf_encrypted,
  DROP COLUMN IF EXISTS crt,
  DROP COLUMN IF EXISTS contribuinte,
  DROP COLUMN IF EXISTS inscricao_estadual,
  DROP COLUMN IF EXISTS ie_isento,
  DROP COLUMN IF EXISTS inscricao_municipal;

-- ============================================================
-- 6. Add CNPJ constraint on stores (replacing partners constraint)
-- ============================================================
ALTER TABLE stores
  DROP CONSTRAINT IF EXISTS stores_cnpj_format,
  ADD CONSTRAINT stores_cnpj_format
  CHECK (cnpj IS NULL OR cnpj ~ '^[0-9A-Z]{14}$');

COMMIT;
