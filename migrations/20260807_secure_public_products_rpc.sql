-- Fase 2: substituir a view publica por uma RPC com search_path fixo.
-- A RPC retorna somente a projecao publica e nao depende de RLS em products.

BEGIN;

DROP VIEW IF EXISTS public.marketplace_products_public;

CREATE OR REPLACE FUNCTION public.get_marketplace_products_public(
  p_product_ids uuid[] DEFAULT NULL,
  p_store_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
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
  'Safe read-only marketplace projection. Never add operational, cost, moderation, or reservation fields.';

REVOKE ALL ON FUNCTION public.get_marketplace_products_public(uuid[], uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_marketplace_products_public(uuid[], uuid) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
