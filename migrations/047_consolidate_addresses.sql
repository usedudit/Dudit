-- Consolidar todos os endereços em uma única tabela "addresses"
-- Esta migration cria a tabela centralizada e migra dados das tabelas existentes

BEGIN;

-- 0. Dropar views dependentes PRIMEIRO (para evitar erro de CASCADE)
DROP VIEW IF EXISTS partners_checkout_secure CASCADE;
DROP VIEW IF EXISTS partners_public_secure CASCADE;

-- 1. Criar tabela centralizada de endereços
CREATE TABLE IF NOT EXISTS addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Referências polimórficas (um dos seguintes será preenchido)
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_id UUID REFERENCES partners(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  
  -- Dados de endereço
  zip_code TEXT,
  street TEXT,
  number TEXT,
  complement TEXT,
  neighborhood TEXT,
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'BR',
  
  -- Para customers (dados fiscais)
  municipio_codigo_ibge TEXT,
  
  -- Flags
  is_default BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraint: Pelo menos um ID deve ser preenchido
  CONSTRAINT check_address_type CHECK (
    (user_id IS NOT NULL)::int +
    (partner_id IS NOT NULL)::int +
    (supplier_id IS NOT NULL)::int +
    (customer_id IS NOT NULL)::int +
    (store_id IS NOT NULL)::int = 1
  )
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_addresses_partner_id ON addresses(partner_id);
CREATE INDEX IF NOT EXISTS idx_addresses_supplier_id ON addresses(supplier_id);
CREATE INDEX IF NOT EXISTS idx_addresses_customer_id ON addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_addresses_store_id ON addresses(store_id);

-- RLS para addresses
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "Users can view their own addresses"
  ON addresses FOR SELECT
  USING (
    auth.uid() = user_id OR
    auth.uid() = (SELECT user_id FROM partners WHERE id = partner_id) OR
    auth.uid() = (SELECT user_id FROM suppliers WHERE id = supplier_id) OR
    auth.uid() = (SELECT user_id FROM customers WHERE id = customer_id) OR
    auth.uid() = (SELECT partner_id FROM stores WHERE id = store_id)
  );

CREATE POLICY "Users can create their own addresses"
  ON addresses FOR INSERT
  WITH CHECK (
    auth.uid() = user_id OR
    auth.uid() = (SELECT user_id FROM partners WHERE id = partner_id) OR
    auth.uid() = (SELECT user_id FROM suppliers WHERE id = supplier_id) OR
    auth.uid() = (SELECT user_id FROM customers WHERE id = customer_id) OR
    auth.uid() = (SELECT partner_id FROM stores WHERE id = store_id)
  );

CREATE POLICY "Users can update their own addresses"
  ON addresses FOR UPDATE
  USING (
    auth.uid() = user_id OR
    auth.uid() = (SELECT user_id FROM partners WHERE id = partner_id) OR
    auth.uid() = (SELECT user_id FROM suppliers WHERE id = supplier_id) OR
    auth.uid() = (SELECT user_id FROM customers WHERE id = customer_id) OR
    auth.uid() = (SELECT partner_id FROM stores WHERE id = store_id)
  );

CREATE POLICY "Users can delete their own addresses"
  ON addresses FOR DELETE
  USING (
    auth.uid() = user_id OR
    auth.uid() = (SELECT user_id FROM partners WHERE id = partner_id) OR
    auth.uid() = (SELECT user_id FROM suppliers WHERE id = supplier_id) OR
    auth.uid() = (SELECT user_id FROM customers WHERE id = customer_id) OR
    auth.uid() = (SELECT partner_id FROM stores WHERE id = store_id)
  );

-- 2. Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_addresses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS addresses_updated_at ON addresses;
CREATE TRIGGER addresses_updated_at
  BEFORE UPDATE ON addresses
  FOR EACH ROW
  EXECUTE FUNCTION update_addresses_updated_at();

-- 3. Migrar dados de user_profiles (se existirem colunas de endereço)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' 
    AND column_name IN ('zip_code', 'city')
  ) THEN
    INSERT INTO addresses (user_id, zip_code, street, neighborhood, city, state, country)
    SELECT user_id, zip_code, NULL as street, neighborhood, city, state, 'BR'
    FROM user_profiles
    WHERE city IS NOT NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Ignora se columns não existir
END $$;

-- 4. Migrar dados de partners
DO $$
BEGIN
  INSERT INTO addresses (partner_id, zip_code, street, number, complement, neighborhood, city, state, country)
  SELECT id, zip_code, street, number, complement, neighborhood, city, state, 'BR'
  FROM partners
  WHERE street IS NOT NULL OR city IS NOT NULL;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Ignora se columns não existirem
END $$;

-- 5. Migrar dados de suppliers
DO $$
BEGIN
  INSERT INTO addresses (supplier_id, zip_code, street, number, complement, neighborhood, city, state, country)
  SELECT id, zip_code, street, number, complement, neighborhood, city, state, 'BR'
  FROM suppliers
  WHERE street IS NOT NULL OR city IS NOT NULL;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Ignora se columns não existirem
END $$;

-- 6. Migrar dados de customers
DO $$
BEGIN
  INSERT INTO addresses (customer_id, zip_code, street, number, complement, neighborhood, city, state, country, municipio_codigo_ibge)
  SELECT id, zip_code, street, number, complement, neighborhood, city, state, country, municipio_codigo_ibge
  FROM customers
  WHERE street IS NOT NULL OR city IS NOT NULL;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Ignora se columns não existirem
END $$;

-- 7. Remover colunas de endereço das tabelas originais
ALTER TABLE user_profiles 
DROP COLUMN IF EXISTS address,
DROP COLUMN IF EXISTS street,
DROP COLUMN IF EXISTS number,
DROP COLUMN IF EXISTS complement,
DROP COLUMN IF EXISTS neighborhood,
DROP COLUMN IF EXISTS city,
DROP COLUMN IF EXISTS state,
DROP COLUMN IF EXISTS zip_code;

ALTER TABLE partners
DROP COLUMN IF EXISTS street,
DROP COLUMN IF EXISTS number,
DROP COLUMN IF EXISTS complement,
DROP COLUMN IF EXISTS neighborhood,
DROP COLUMN IF EXISTS city,
DROP COLUMN IF EXISTS state,
DROP COLUMN IF EXISTS zip_code;

ALTER TABLE suppliers
DROP COLUMN IF EXISTS street,
DROP COLUMN IF EXISTS number,
DROP COLUMN IF EXISTS complement,
DROP COLUMN IF EXISTS neighborhood,
DROP COLUMN IF EXISTS city,
DROP COLUMN IF EXISTS state,
DROP COLUMN IF EXISTS zip_code;

ALTER TABLE customers
DROP COLUMN IF EXISTS street,
DROP COLUMN IF EXISTS number,
DROP COLUMN IF EXISTS complement,
DROP COLUMN IF EXISTS neighborhood,
DROP COLUMN IF EXISTS city,
DROP COLUMN IF EXISTS state,
DROP COLUMN IF EXISTS zip_code,
DROP COLUMN IF EXISTS country,
DROP COLUMN IF EXISTS municipio_codigo_ibge;

-- 8. Recriar views necessárias DEPOIS de remover as colunas
-- (agora elas puxam endereço da tabela addresses via JOIN)

CREATE OR REPLACE VIEW partners_public_secure AS
SELECT 
  p.id,
  p.user_id,
  p.store_name,
  p.store_description,
  p.store_image_url,
  p.rating,
  p.is_active,
  p.offering_type,
  p.sells_products,
  p.provides_services,
  p.opening_hours,
  COALESCE(a.zip_code, '') as zip_code,
  COALESCE(a.street, '') as street,
  COALESCE(a.number, '') as number,
  COALESCE(a.complement, '') as complement,
  COALESCE(a.neighborhood, '') as neighborhood,
  COALESCE(a.city, '') as city,
  COALESCE(a.state, '') as state,
  p.created_at
FROM partners p
LEFT JOIN addresses a ON a.partner_id = p.id AND a.is_default = true
WHERE p.is_active = true;

CREATE OR REPLACE VIEW partners_checkout_secure AS
SELECT 
  p.id,
  p.user_id,
  p.store_name,
  p.max_installments,
  p.installments_without_interest,
  p.interest_rate_percent,
  p.mp_public_key,
  CONCAT(
    COALESCE(a.street, ''), ', ', COALESCE(a.number, ''),
    CASE WHEN a.complement IS NOT NULL AND a.complement != '' 
         THEN CONCAT(', ', a.complement) ELSE '' END,
    ' - ', COALESCE(a.neighborhood, ''), ', ', COALESCE(a.city, ''), 
    ' - ', COALESCE(a.state, ''), ', ', COALESCE(a.zip_code, '')
  ) as full_address
FROM partners p
LEFT JOIN addresses a ON a.partner_id = p.id AND a.is_default = true
WHERE p.is_active = true;

COMMIT;
