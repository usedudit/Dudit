-- Migration: Add short_id column to marketplace entities (products, services, stores, collections, recurring_plans)
-- Purpose: Enable clean, short URLs (e.g. /cidade-uf/produto/p/k7x9pa) instead of full 36-char UUIDs.

-- 1. Helper function to generate random lowercase alphanumeric string (36^6 = ~2.17 billion combinations)
CREATE OR REPLACE FUNCTION generate_short_id(size INT DEFAULT 6)
RETURNS TEXT AS $$
DECLARE
  characters TEXT := 'abcdefghijklmnopqrstuvwxyz0123456789';
  result TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..size LOOP
    result := result || substr(characters, floor(random() * length(characters) + 1)::INT, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 2. Trigger function to ensure short_id is never null on insert
CREATE OR REPLACE FUNCTION set_short_id_if_null()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.short_id IS NULL OR NEW.short_id = '' THEN
    NEW.short_id := generate_short_id(6);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. PRODUCTS
ALTER TABLE products ADD COLUMN IF NOT EXISTS short_id TEXT DEFAULT generate_short_id(6);
UPDATE products SET short_id = generate_short_id(6) WHERE short_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_short_id ON products(short_id);

DROP TRIGGER IF EXISTS trg_set_short_id_products ON products;
CREATE TRIGGER trg_set_short_id_products
  BEFORE INSERT ON products
  FOR EACH ROW
  EXECUTE FUNCTION set_short_id_if_null();

-- 4. SERVICES
ALTER TABLE services ADD COLUMN IF NOT EXISTS short_id TEXT DEFAULT generate_short_id(6);
UPDATE services SET short_id = generate_short_id(6) WHERE short_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_services_short_id ON services(short_id);

DROP TRIGGER IF EXISTS trg_set_short_id_services ON services;
CREATE TRIGGER trg_set_short_id_services
  BEFORE INSERT ON services
  FOR EACH ROW
  EXECUTE FUNCTION set_short_id_if_null();

-- 5. STORES
ALTER TABLE stores ADD COLUMN IF NOT EXISTS short_id TEXT DEFAULT generate_short_id(6);
UPDATE stores SET short_id = generate_short_id(6) WHERE short_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_short_id ON stores(short_id);

DROP TRIGGER IF EXISTS trg_set_short_id_stores ON stores;
CREATE TRIGGER trg_set_short_id_stores
  BEFORE INSERT ON stores
  FOR EACH ROW
  EXECUTE FUNCTION set_short_id_if_null();

-- 6. COLLECTIONS
ALTER TABLE collections ADD COLUMN IF NOT EXISTS short_id TEXT DEFAULT generate_short_id(6);
UPDATE collections SET short_id = generate_short_id(6) WHERE short_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_short_id ON collections(short_id);

DROP TRIGGER IF EXISTS trg_set_short_id_collections ON collections;
CREATE TRIGGER trg_set_short_id_collections
  BEFORE INSERT ON collections
  FOR EACH ROW
  EXECUTE FUNCTION set_short_id_if_null();

-- 7. RECURRING PLANS
ALTER TABLE recurring_plans ADD COLUMN IF NOT EXISTS short_id TEXT DEFAULT generate_short_id(6);
UPDATE recurring_plans SET short_id = generate_short_id(6) WHERE short_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_recurring_plans_short_id ON recurring_plans(short_id);

DROP TRIGGER IF EXISTS trg_set_short_id_recurring_plans ON recurring_plans;
CREATE TRIGGER trg_set_short_id_recurring_plans
  BEFORE INSERT ON recurring_plans
  FOR EACH ROW
  EXECUTE FUNCTION set_short_id_if_null();
