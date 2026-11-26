-- ============================================================================
-- Rollback: 20261126_search_index_specifications_rollback.sql
--
-- Restaura `build_marketplace_tsvector`, `refresh_product_marketplace_fts`,
-- `refresh_service_marketplace_fts` e os triggers FTS para o estado anterior
-- (sem indexação de `technical_specs` / `technical_details`).
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.build_marketplace_tsvector(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.build_marketplace_tsvector(
  p_name TEXT,
  p_category TEXT,
  p_subcategory TEXT,
  p_tags TEXT,
  p_description TEXT,
  p_store TEXT,
  p_sku TEXT DEFAULT NULL
)
RETURNS tsvector
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = public, extensions, pg_temp
AS $function$
  SELECT
    setweight(to_tsvector('portuguese', unaccent(coalesce(p_name, ''))), 'A') ||
    setweight(to_tsvector('portuguese', unaccent(coalesce(p_category, ''))), 'A') ||
    setweight(to_tsvector('portuguese', unaccent(coalesce(p_subcategory, ''))), 'B') ||
    setweight(to_tsvector('portuguese', unaccent(coalesce(p_tags, ''))), 'B') ||
    setweight(to_tsvector('portuguese', unaccent(public.strip_html_tags(p_description))), 'C') ||
    setweight(to_tsvector('portuguese', unaccent(coalesce(p_store, ''))), 'D') ||
    CASE
      WHEN coalesce(p_sku, '') <> '' THEN setweight(to_tsvector('portuguese', unaccent(p_sku)), 'B')
      ELSE ''::tsvector
    END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_product_marketplace_fts(p_product_id UUID DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $function$
BEGIN
  UPDATE public.products p
  SET
    mp_store_name = data.store_name,
    mp_search_category_text = data.category_text,
    mp_search_subcategory_text = data.subcategory_text,
    fts = data.fts
  FROM (
    SELECT
      p2.id,
      COALESCE(st.name, '') AS store_name,
      CASE
        WHEN cat.parent_id IS NOT NULL THEN parent_cat.name
        ELSE cat.name
      END AS category_text,
      CASE
        WHEN cat.parent_id IS NOT NULL THEN cat.name
        ELSE NULL
      END AS subcategory_text,
      public.build_marketplace_tsvector(
        p2.name,
        CASE WHEN cat.parent_id IS NOT NULL THEN parent_cat.name ELSE cat.name END,
        CASE WHEN cat.parent_id IS NOT NULL THEN cat.name ELSE NULL END,
        array_to_string(coalesce(p2.tags, '{}'::text[]), ' '),
        p2.description,
        COALESCE(st.name, ''),
        p2.sku
      ) AS fts
    FROM public.products p2
    LEFT JOIN public.stores st ON st.id = COALESCE(
      p2.store_id,
      (SELECT s.id FROM public.stores s WHERE s.partner_id = p2.partner_id LIMIT 1)
    )
    LEFT JOIN public.marketplace_product_categories cat ON cat.id = p2.marketplace_category_id
    LEFT JOIN public.marketplace_product_categories parent_cat ON parent_cat.id = cat.parent_id
    WHERE (p_product_id IS NULL OR p2.id = p_product_id)
  ) data
  WHERE p.id = data.id;
END;
$function$;

DROP TRIGGER IF EXISTS trg_products_marketplace_fts ON public.products;
CREATE TRIGGER trg_products_marketplace_fts
  AFTER INSERT OR UPDATE OF
    name, description, sku, tags, marketplace_category_id, partner_id
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_products_marketplace_fts();

CREATE OR REPLACE FUNCTION public.refresh_service_marketplace_fts(p_service_id UUID DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $function$
BEGIN
  UPDATE public.services s
  SET
    mp_store_name = data.store_name,
    mp_search_category_text = data.category_text,
    mp_search_subcategory_text = data.subcategory_text,
    fts = data.fts
  FROM (
    SELECT
      s2.id,
      COALESCE(st.name, '') AS store_name,
      coalesce(
        CASE WHEN mcat.parent_id IS NOT NULL THEN mparent.name ELSE mcat.name END,
        sc.name
      ) AS category_text,
      CASE
        WHEN mcat.parent_id IS NOT NULL THEN mcat.name
        ELSE NULL
      END AS subcategory_text,
      public.build_marketplace_tsvector(
        s2.name,
        coalesce(
          CASE WHEN mcat.parent_id IS NOT NULL THEN mparent.name ELSE mcat.name END,
          sc.name
        ),
        CASE WHEN mcat.parent_id IS NOT NULL THEN mcat.name ELSE NULL END,
        coalesce((
          SELECT string_agg(elem, ' ')
          FROM jsonb_array_elements_text(coalesce(s2.tags, '[]'::jsonb)) AS elem
        ), ''),
        s2.description,
        COALESCE(st.name, ''),
        NULL
      ) AS fts
    FROM public.services s2
    LEFT JOIN public.stores st ON st.id = COALESCE(
      s2.store_id,
      (SELECT s.id FROM public.stores s WHERE s.partner_id = s2.partner_id LIMIT 1)
    )
    LEFT JOIN public.marketplace_service_categories mcat ON mcat.id = s2.marketplace_category_id
    LEFT JOIN public.marketplace_service_categories mparent ON mparent.id = mcat.parent_id
    LEFT JOIN public.service_categories sc ON sc.id = s2.category_id
    WHERE (p_service_id IS NULL OR s2.id = p_service_id)
  ) data
  WHERE s.id = data.id;
END;
$function$;

DROP TRIGGER IF EXISTS trg_services_marketplace_fts ON public.services;
CREATE TRIGGER trg_services_marketplace_fts
  AFTER INSERT OR UPDATE OF
    name, description, tags, marketplace_category_id, category_id, partner_id
  ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_services_marketplace_fts();

DROP FUNCTION IF EXISTS public.extract_marketplace_specs_text(JSONB);

NOTIFY pgrst, 'reload schema';

COMMIT;
