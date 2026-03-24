-- TAREFA 1: Criar tabela product_fiscal_profiles
CREATE TABLE IF NOT EXISTS product_fiscal_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ncm TEXT,
  cest TEXT,
  origin INTEGER,
  item_type TEXT,
  cfop_internal TEXT,
  cfop_external TEXT,
  csosn TEXT,
  tax_percentage NUMERIC,
  pis_cst TEXT,
  pis_rate NUMERIC,
  cofins_cst TEXT,
  cofins_rate NUMERIC,
  ipi_cst TEXT,
  ipi_code TEXT,
  product_situation TEXT,
  fci_code CHARACTER VARYING,
  c_benef TEXT,
  inf_ad_prod TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- TAREFA 2: Criar tabela product_logistics
CREATE TABLE IF NOT EXISTS product_logistics (
  product_id UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  weight_gross NUMERIC,
  weight_net NUMERIC,
  width NUMERIC,
  height NUMERIC,
  length NUMERIC,
  packaging_type TEXT,
  preparation_days INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- TAREFA 3: Adicionar coluna fiscal_profile_id na tabela products
ALTER TABLE products ADD COLUMN IF NOT EXISTS fiscal_profile_id UUID REFERENCES product_fiscal_profiles(id) ON DELETE SET NULL;

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_products_fiscal_profile_id ON products(fiscal_profile_id);
CREATE INDEX IF NOT EXISTS idx_product_logistics_product_id ON product_logistics(product_id);

-- Criar triggers de updated_at para as novas tabelas
CREATE OR REPLACE FUNCTION update_product_fiscal_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_product_fiscal_profiles_updated_at ON product_fiscal_profiles;
CREATE TRIGGER trigger_update_product_fiscal_profiles_updated_at
  BEFORE UPDATE ON product_fiscal_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_product_fiscal_profiles_updated_at();

CREATE OR REPLACE FUNCTION update_product_logistics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_product_logistics_updated_at ON product_logistics;
CREATE TRIGGER trigger_update_product_logistics_updated_at
  BEFORE UPDATE ON product_logistics
  FOR EACH ROW
  EXECUTE FUNCTION update_product_logistics_updated_at();

-- RLS Policies para product_fiscal_profiles
ALTER TABLE product_fiscal_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Partner owners can view fiscal profiles" ON product_fiscal_profiles;
CREATE POLICY "Partner owners can view fiscal profiles" ON product_fiscal_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.fiscal_profile_id = product_fiscal_profiles.id
      AND p.partner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Partner owners can insert fiscal profiles" ON product_fiscal_profiles;
CREATE POLICY "Partner owners can insert fiscal profiles"
  ON product_fiscal_profiles
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM partners
      WHERE partners.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Partner owners can update fiscal profiles" ON product_fiscal_profiles;
CREATE POLICY "Partner owners can update fiscal profiles"
  ON product_fiscal_profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.fiscal_profile_id = product_fiscal_profiles.id
      AND p.partner_id = auth.uid()
    )
  );

-- RLS Policies para product_logistics
ALTER TABLE product_logistics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Partner owners can view logistics" ON product_logistics;
CREATE POLICY "Partner owners can view logistics" ON product_logistics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = product_logistics.product_id
      AND p.partner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Partner owners can insert logistics" ON product_logistics;
CREATE POLICY "Partner owners can insert logistics"
  ON product_logistics
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM partners
      WHERE partners.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Partner owners can update logistics" ON product_logistics;
CREATE POLICY "Partner owners can update logistics"
  ON product_logistics
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = product_logistics.product_id
      AND p.partner_id = auth.uid()
    )
  );
