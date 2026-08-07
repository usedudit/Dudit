-- Fase 2: publicacao minima e explicita de produtos do marketplace.
-- A view e deliberadamente somente leitura e nao inclui campos operacionais.

BEGIN;

DROP VIEW IF EXISTS public.marketplace_products_public;

CREATE VIEW public.marketplace_products_public
WITH (security_barrier = true)
AS
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
  AND p.deleted_at IS NULL;

COMMENT ON VIEW public.marketplace_products_public IS
  'Safe read-only marketplace projection. Never add operational, cost, moderation, or reservation fields here.';

REVOKE ALL ON public.marketplace_products_public FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.marketplace_products_public TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
