-- Migration: Secure public services RPC for marketplace
-- Creates a safe read-only projection for services in marketplace, similar to get_marketplace_products_public

CREATE OR REPLACE FUNCTION public.get_marketplace_services_public(
  p_service_ids uuid[] DEFAULT NULL,
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
  duration_minutes integer,
  category_id uuid,
  subcategory_id uuid,
  images jsonb,
  rating numeric,
  created_at timestamptz,
  updated_at timestamptz,
  show_in_marketplace boolean,
  price_type text,
  billing_unit text,
  service_type text,
  category_name text,
  store_name text,
  store_slug text,
  store_short_id text,
  store_logo_url text,
  store_banner_url text,
  store_city text,
  store_state text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    sv.id,
    sv.short_id,
    sv.partner_id,
    sv.store_id,
    sv.name,
    sv.description,
    sv.price,
    sv.promotional_price,
    sv.duration_minutes,
    sv.category_id,
    sv.subcategory_id,
    sv.images,
    sv.rating,
    sv.created_at,
    sv.updated_at,
    sv.show_in_marketplace,
    sv.price_type,
    sv.billing_unit,
    sv.service_type,
    sc.name AS category_name,
    s.name AS store_name,
    s.slug AS store_slug,
    s.short_id AS store_short_id,
    s.logo_url AS store_logo_url,
    s.banner_url AS store_banner_url,
    address.city AS store_city,
    address.state AS store_state
  FROM public.services AS sv
  LEFT JOIN public.service_categories AS sc
    ON sc.id = sv.category_id
  LEFT JOIN public.stores AS s
    ON s.id = sv.store_id
  LEFT JOIN LATERAL (
    SELECT a.city, a.state
    FROM public.addresses AS a
    WHERE a.store_id = sv.store_id
    ORDER BY a.is_default DESC NULLS LAST, a.created_at ASC
    LIMIT 1
  ) AS address ON true
  WHERE sv.is_active = true
    AND sv.show_in_marketplace = true
    AND sv.deleted_at IS NULL
    AND (p_service_ids IS NULL OR sv.id = ANY (p_service_ids))
    AND (p_store_id IS NULL OR sv.store_id = p_store_id);
$$;

COMMENT ON FUNCTION public.get_marketplace_services_public(uuid[], uuid) IS
  'Safe read-only marketplace projection for services with short_id support.';

REVOKE ALL ON FUNCTION public.get_marketplace_services_public(uuid[], uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_marketplace_services_public(uuid[], uuid) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';