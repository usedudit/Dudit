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

-- 8. UPDATE RPC get_marketplace_products_public
DROP FUNCTION IF EXISTS public.get_marketplace_products_public(uuid[], uuid);

CREATE OR REPLACE FUNCTION public.get_marketplace_products_public(
  p_product_ids uuid[] DEFAULT NULL,
  p_store_id uuid DEFAULT NULL
)

RETURNS TABLE (
  id uuid,
  short_id text,
  partner_id uuid,
  store_id uuid,
  name text,
  description text,
  price numeric,
  promotional_price numeric,
  images jsonb,
  rating numeric,
  condition text,
  created_at timestamptz,
  updated_at timestamptz,
  category_id uuid,
  marketplace_category_id uuid,
  stock_available integer,
  availability_value integer,
  availability_unit text,
  show_price_in_store boolean,
  category_name text,
  store_name text,
  store_slug text,
  store_short_id text,
  store_logo_url text,
  store_banner_url text,
  store_city text,
  store_state text,
  variants jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p.id,
    p.short_id,
    p.partner_id,
    p.store_id,
    p.name,
    p.description,
    p.price,
    p.promotional_price,
    p.images,
    p.rating,
    p.condition,
    p.created_at,
    p.updated_at,
    p.category_id,
    p.marketplace_category_id,
    p.stock_available,
    p.availability_value,
    p.availability_unit,
    p.show_price_in_store,
    pc.name AS category_name,
    s.name AS store_name,
    s.slug AS store_slug,
    s.short_id AS store_short_id,
    s.logo_url AS store_logo_url,
    s.banner_url AS store_banner_url,
    address.city AS store_city,
    address.state AS store_state,
    variants.items AS variants
  FROM public.products AS p
  LEFT JOIN public.product_categories AS pc
    ON pc.id = p.category_id
  LEFT JOIN public.stores AS s
    ON s.id = p.store_id
  LEFT JOIN LATERAL (
    SELECT a.city, a.state
    FROM public.addresses AS a
    WHERE a.store_id = p.store_id
    ORDER BY a.is_default DESC NULLS LAST, a.created_at ASC
    LIMIT 1
  ) AS address ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'variant_options', pv.variant_options,
          'price_adjustment', pv.price_adjustment,
          'is_active', pv.is_active
        ) ORDER BY pv.id
      ),
      '[]'::jsonb
    ) AS items
    FROM public.product_variants AS pv
    WHERE pv.product_id = p.id
      AND pv.is_active = true
  ) AS variants ON true
  WHERE p.is_active = true
    AND p.status = 'ativo'
    AND p.moderation_status = 'approved'
    AND p.show_in_marketplace = true
    AND p.deleted_at IS NULL
    AND (p_product_ids IS NULL OR p.id = ANY (p_product_ids))
    AND (p_store_id IS NULL OR p.store_id = p_store_id);
$$;

COMMENT ON FUNCTION public.get_marketplace_products_public(uuid[], uuid) IS
  'Safe read-only marketplace projection with short_id support.';

REVOKE ALL ON FUNCTION public.get_marketplace_products_public(uuid[], uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_marketplace_products_public(uuid[], uuid) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

