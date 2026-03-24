-- Add fiscal fields to products table
ALTER TABLE products
ADD COLUMN IF NOT EXISTS ncm TEXT,
ADD COLUMN IF NOT EXISTS cest TEXT,
ADD COLUMN IF NOT EXISTS origin INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS item_type TEXT DEFAULT '00',
ADD COLUMN IF NOT EXISTS cfop_internal TEXT DEFAULT '5102',
ADD COLUMN IF NOT EXISTS cfop_external TEXT DEFAULT '6102',
ADD COLUMN IF NOT EXISTS csosn TEXT DEFAULT '102',
ADD COLUMN IF NOT EXISTS tax_percentage NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS pis_cst TEXT DEFAULT '99',
ADD COLUMN IF NOT EXISTS pis_rate NUMERIC(5,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS cofins_cst TEXT DEFAULT '99',
ADD COLUMN IF NOT EXISTS cofins_rate NUMERIC(5,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS ipi_cst TEXT DEFAULT '99',
ADD COLUMN IF NOT EXISTS ipi_code TEXT,
ADD COLUMN IF NOT EXISTS product_situation TEXT DEFAULT 'revenda';

COMMENT ON COLUMN products.ncm IS 'Nomenclatura Comum do Mercosul - 8 dígitos';
COMMENT ON COLUMN products.cest IS 'Código Especificador da Substituição Tributária - 7 dígitos';
COMMENT ON COLUMN products.origin IS 'Origem da mercadoria: 0=Nacional, 1=Estrangeira, etc';
COMMENT ON COLUMN products.item_type IS 'Tipo do item: 00=Mercadoria para revenda';
COMMENT ON COLUMN products.cfop_internal IS 'CFOP para vendas dentro do estado';
COMMENT ON COLUMN products.cfop_external IS 'CFOP para vendas interestaduais';
COMMENT ON COLUMN products.csosn IS 'Código de Situação da Operação no Simples Nacional';
COMMENT ON COLUMN products.tax_percentage IS 'Carga tributária aproximada (IBPT)';
COMMENT ON COLUMN products.pis_cst IS 'Código de Situação Tributária do PIS';
COMMENT ON COLUMN products.pis_rate IS 'Alíquota do PIS';
COMMENT ON COLUMN products.cofins_cst IS 'Código de Situação Tributária do COFINS';
COMMENT ON COLUMN products.cofins_rate IS 'Alíquota do COFINS';
COMMENT ON COLUMN products.ipi_cst IS 'Código de Situação Tributária do IPI';
COMMENT ON COLUMN products.ipi_code IS 'Código de Enquadramento do IPI';
COMMENT ON COLUMN products.product_situation IS 'Situação do produto: revenda, producao_propria, st_retido';
