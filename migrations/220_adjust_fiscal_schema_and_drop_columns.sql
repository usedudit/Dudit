-- Script para ajustar a estrutura da tabela product_fiscal_profiles e remover colunas antigas da tabela products

-- 1. Remover a foreign key de products para product_fiscal_profiles
ALTER TABLE IF EXISTS products
DROP CONSTRAINT IF EXISTS products_fiscal_profile_id_fkey;

-- 2. Recriar a tabela product_fiscal_profiles com a nova estrutura (usando product_id como PK)
-- Como a tabela acabou de ser criada, podemos dropá-la e recriá-la, ou alterá-la.
-- Vamos alterar para preservar dados caso existam.

-- Dropar as políticas RLS primeiro
DROP POLICY IF EXISTS "Partner owners can view fiscal profiles" ON product_fiscal_profiles;
DROP POLICY IF EXISTS "Partner owners can insert fiscal profiles" ON product_fiscal_profiles;
DROP POLICY IF EXISTS "Partner owners can update fiscal profiles" ON product_fiscal_profiles;

-- Limpar dados da tabela product_fiscal_profiles pois o UUID antigo não bate com os da tabela products
-- e como é nova, não devemos ter dados órfãos valiosos. Se quisermos migrar, teríamos que fazer
-- um update baseado na products.fiscal_profile_id. Vamos fazer isso para ser seguro.
-- Criar a nova coluna product_id
ALTER TABLE product_fiscal_profiles ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE CASCADE;

-- Mover os dados (se houver) baseando na tabela products
UPDATE product_fiscal_profiles pfp
SET product_id = p.id
FROM products p
WHERE p.fiscal_profile_id = pfp.id;

-- Deletar registros órfãos que não têm product_id
DELETE FROM product_fiscal_profiles WHERE product_id IS NULL;

-- Tornar a coluna product_id NOT NULL e PRIMARY KEY
ALTER TABLE product_fiscal_profiles ALTER COLUMN product_id SET NOT NULL;

-- Remover a PK antiga (id)
ALTER TABLE product_fiscal_profiles DROP CONSTRAINT IF EXISTS product_fiscal_profiles_pkey;
ALTER TABLE product_fiscal_profiles DROP COLUMN IF EXISTS id;

-- Configurar a nova PK
ALTER TABLE product_fiscal_profiles ADD PRIMARY KEY (product_id);

-- 3. Remover a coluna fiscal_profile_id de products
DROP INDEX IF EXISTS idx_products_fiscal_profile_id;
ALTER TABLE products DROP COLUMN IF EXISTS fiscal_profile_id;

-- 4. Recriar RLS Policies para product_fiscal_profiles com a nova estrutura
ALTER TABLE product_fiscal_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partner owners can view fiscal profiles" ON product_fiscal_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = product_fiscal_profiles.product_id
      AND p.partner_id = auth.uid()
    )
  );

CREATE POLICY "Partner owners can insert fiscal profiles"
  ON product_fiscal_profiles
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM partners
      WHERE partners.user_id = auth.uid()
    )
  );

CREATE POLICY "Partner owners can update fiscal profiles"
  ON product_fiscal_profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = product_fiscal_profiles.product_id
      AND p.partner_id = auth.uid()
    )
  );


-- 5. Remover TODAS as velhas colunas de fiscal e logística da tabela products
ALTER TABLE IF EXISTS products
  DROP COLUMN IF EXISTS ncm,
  DROP COLUMN IF EXISTS cest,
  DROP COLUMN IF EXISTS origin,
  DROP COLUMN IF EXISTS item_type,
  DROP COLUMN IF EXISTS cfop_internal,
  DROP COLUMN IF EXISTS cfop_external,
  DROP COLUMN IF EXISTS csosn,
  DROP COLUMN IF EXISTS tax_percentage,
  DROP COLUMN IF EXISTS pis_cst,
  DROP COLUMN IF EXISTS pis_rate,
  DROP COLUMN IF EXISTS cofins_cst,
  DROP COLUMN IF EXISTS cofins_rate,
  DROP COLUMN IF EXISTS ipi_cst,
  DROP COLUMN IF EXISTS ipi_code,
  DROP COLUMN IF EXISTS product_situation,
  DROP COLUMN IF EXISTS fci_code,
  DROP COLUMN IF EXISTS c_benef,
  DROP COLUMN IF EXISTS inf_ad_prod,
  DROP COLUMN IF EXISTS weight_gross,
  DROP COLUMN IF EXISTS weight_net,
  DROP COLUMN IF EXISTS width,
  DROP COLUMN IF EXISTS height,
  DROP COLUMN IF EXISTS length,
  DROP COLUMN IF EXISTS packaging_type,
  DROP COLUMN IF EXISTS preparation_days;

