-- Marketplace Search Relevance Upgrade
-- Extends existing PostgreSQL FTS (products.fts) for marketplace-grade relevance ranking.

CREATE EXTENSION IF NOT EXISTS unaccent;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.strip_html_tags(input TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT regexp_replace(coalesce(input, ''), '<[^>]+>', ' ', 'g');
$$;

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
AS $$
  SELECT
    setweight(to_tsvector('portuguese', unaccent(coalesce(p_name, ''))), 'A') ||
    setweight(to_tsvector('portuguese', unaccent(coalesce(p_category, ''))), 'A') ||
    setweight(to_tsvector('portuguese', unaccent(coalesce(p_subcategory, ''))), 'B') ||
    setweight(to_tsvector('portuguese', unaccent(coalesce(p_tags, ''))), 'B') ||
    setweight(to_tsvector('portuguese', unaccent(strip_html_tags(p_description))), 'C') ||
    setweight(to_tsvector('portuguese', unaccent(coalesce(p_store, ''))), 'D') ||
    CASE
      WHEN coalesce(p_sku, '') <> '' THEN setweight(to_tsvector('portuguese', unaccent(p_sku)), 'B')
      ELSE ''::tsvector
    END;
$$;

-- ---------------------------------------------------------------------------
-- Products: denormalized search context + trigger-maintained fts
-- ---------------------------------------------------------------------------

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS mp_search_category_text TEXT,
  ADD COLUMN IF NOT EXISTS mp_search_subcategory_text TEXT,
  ADD COLUMN IF NOT EXISTS mp_store_name TEXT;

ALTER TABLE public.products DROP COLUMN IF EXISTS fts;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS fts tsvector;

CREATE OR REPLACE FUNCTION public.refresh_product_marketplace_fts(p_product_id UUID DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
AS $$
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
      ptr.store_name,
      CASE
        WHEN cat.parent_id IS NOT NULL THEN parent_cat.name
        ELSE cat.name
      END as category_text,
      CASE
        WHEN cat.parent_id IS NOT NULL THEN cat.name
        ELSE NULL
      END as subcategory_text,
      public.build_marketplace_tsvector(
        p2.name,
        CASE WHEN cat.parent_id IS NOT NULL THEN parent_cat.name ELSE cat.name END,
        CASE WHEN cat.parent_id IS NOT NULL THEN cat.name ELSE NULL END,
        array_to_string(coalesce(p2.tags, '{}'::text[]), ' '),
        p2.description,
        ptr.store_name,
        p2.sku
      ) as fts
    FROM public.products p2
    INNER JOIN public.partners ptr ON p2.partner_id = ptr.id
    LEFT JOIN public.marketplace_product_categories cat ON cat.id = p2.marketplace_category_id
    LEFT JOIN public.marketplace_product_categories parent_cat ON parent_cat.id = cat.parent_id
    WHERE (p_product_id IS NULL OR p2.id = p_product_id)
  ) data
  WHERE p.id = data.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_products_marketplace_fts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.refresh_product_marketplace_fts(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_marketplace_fts ON public.products;
CREATE TRIGGER trg_products_marketplace_fts
  AFTER INSERT OR UPDATE OF
    name, description, sku, tags, marketplace_category_id, partner_id
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_products_marketplace_fts();

CREATE OR REPLACE FUNCTION public.trg_partners_refresh_product_fts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.store_name IS DISTINCT FROM OLD.store_name THEN
    PERFORM public.refresh_product_marketplace_fts(p.id)
    FROM public.products p
    WHERE p.partner_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_partners_refresh_product_fts ON public.partners;
CREATE TRIGGER trg_partners_refresh_product_fts
  AFTER UPDATE OF store_name ON public.partners
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_partners_refresh_product_fts();

CREATE OR REPLACE FUNCTION public.trg_mp_category_refresh_product_fts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.name IS DISTINCT FROM OLD.name THEN
    PERFORM public.refresh_product_marketplace_fts(p.id)
    FROM public.products p
    WHERE p.marketplace_category_id = NEW.id
       OR p.marketplace_category_id IN (
         SELECT id FROM public.marketplace_product_categories WHERE parent_id = NEW.id
       );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mp_category_refresh_product_fts ON public.marketplace_product_categories;
CREATE TRIGGER trg_mp_category_refresh_product_fts
  AFTER UPDATE OF name ON public.marketplace_product_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_mp_category_refresh_product_fts();

CREATE INDEX IF NOT EXISTS idx_products_fts ON public.products USING GIN (fts);
CREATE INDEX IF NOT EXISTS idx_products_marketplace_active_fts
  ON public.products (is_active, show_in_marketplace)
  WHERE is_active = true AND show_in_marketplace = true;

-- ---------------------------------------------------------------------------
-- Services
-- ---------------------------------------------------------------------------

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS marketplace_category_id UUID
    REFERENCES public.marketplace_service_categories(id) ON DELETE SET NULL;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS mp_search_category_text TEXT,
  ADD COLUMN IF NOT EXISTS mp_search_subcategory_text TEXT,
  ADD COLUMN IF NOT EXISTS mp_store_name TEXT,
  ADD COLUMN IF NOT EXISTS fts tsvector;

CREATE OR REPLACE FUNCTION public.refresh_service_marketplace_fts(p_service_id UUID DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
AS $$
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
      ptr.store_name,
      coalesce(
        CASE WHEN mcat.parent_id IS NOT NULL THEN mparent.name ELSE mcat.name END,
        sc.name
      ) as category_text,
      CASE
        WHEN mcat.parent_id IS NOT NULL THEN mcat.name
        ELSE NULL
      END as subcategory_text,
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
        ptr.store_name,
        NULL
      ) as fts
    FROM public.services s2
    INNER JOIN public.partners ptr ON s2.partner_id = ptr.id
    LEFT JOIN public.marketplace_service_categories mcat ON mcat.id = s2.marketplace_category_id
    LEFT JOIN public.marketplace_service_categories mparent ON mparent.id = mcat.parent_id
    LEFT JOIN public.service_categories sc ON sc.id = s2.category_id
    WHERE (p_service_id IS NULL OR s2.id = p_service_id)
  ) data
  WHERE s.id = data.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_services_marketplace_fts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.refresh_service_marketplace_fts(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_services_marketplace_fts ON public.services;
CREATE TRIGGER trg_services_marketplace_fts
  AFTER INSERT OR UPDATE OF
    name, description, tags, marketplace_category_id, category_id, partner_id
  ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_services_marketplace_fts();

CREATE INDEX IF NOT EXISTS idx_services_fts ON public.services USING GIN (fts);
CREATE INDEX IF NOT EXISTS idx_services_marketplace_active_fts
  ON public.services (is_active, show_in_marketplace)
  WHERE is_active = true AND show_in_marketplace = true;

-- ---------------------------------------------------------------------------
-- Partners (vitrines)
-- ---------------------------------------------------------------------------

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS mp_search_category_text TEXT,
  ADD COLUMN IF NOT EXISTS fts tsvector;

CREATE OR REPLACE FUNCTION public.refresh_partner_marketplace_fts(p_partner_id UUID DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.partners p
  SET
    mp_search_category_text = CASE
      WHEN cat.parent_id IS NOT NULL THEN parent_cat.name
      ELSE cat.name
    END,
    fts = public.build_marketplace_tsvector(
      p.store_name,
      CASE WHEN cat.parent_id IS NOT NULL THEN parent_cat.name ELSE cat.name END,
      CASE WHEN cat.parent_id IS NOT NULL THEN cat.name ELSE NULL END,
      NULL,
      p.store_description,
      p.store_name,
      NULL
    )
  FROM public.partners p2
  LEFT JOIN public.marketplace_partner_categories cat ON cat.id = p2.category_id
  LEFT JOIN public.marketplace_partner_categories parent_cat ON parent_cat.id = cat.parent_id
  WHERE p.id = p2.id
    AND (p_partner_id IS NULL OR p.id = p_partner_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_partners_marketplace_fts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.refresh_partner_marketplace_fts(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_partners_marketplace_fts ON public.partners;
CREATE TRIGGER trg_partners_marketplace_fts
  AFTER INSERT OR UPDATE OF
    store_name, store_description, category_id
  ON public.partners
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_partners_marketplace_fts();

CREATE INDEX IF NOT EXISTS idx_partners_fts ON public.partners USING GIN (fts);
CREATE INDEX IF NOT EXISTS idx_partners_active_fts
  ON public.partners (is_active)
  WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- Recurring plans
-- ---------------------------------------------------------------------------

ALTER TABLE public.recurring_plans
  ADD COLUMN IF NOT EXISTS mp_store_name TEXT,
  ADD COLUMN IF NOT EXISTS fts tsvector;

CREATE OR REPLACE FUNCTION public.refresh_recurring_plan_marketplace_fts(p_plan_id UUID DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.recurring_plans rp
  SET
    mp_store_name = ptr.store_name,
    fts = public.build_marketplace_tsvector(
      rp.name,
      NULL,
      NULL,
      NULL,
      rp.description,
      ptr.store_name,
      NULL
    )
  FROM public.partners ptr
  WHERE rp.partner_id = ptr.id
    AND (p_plan_id IS NULL OR rp.id = p_plan_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_recurring_plans_marketplace_fts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.refresh_recurring_plan_marketplace_fts(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recurring_plans_marketplace_fts ON public.recurring_plans;
CREATE TRIGGER trg_recurring_plans_marketplace_fts
  AFTER INSERT OR UPDATE OF
    name, description, partner_id
  ON public.recurring_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_recurring_plans_marketplace_fts();

CREATE INDEX IF NOT EXISTS idx_recurring_plans_fts ON public.recurring_plans USING GIN (fts);
CREATE INDEX IF NOT EXISTS idx_recurring_plans_marketplace_active_fts
  ON public.recurring_plans (status, show_in_marketplace)
  WHERE status = 'active' AND show_in_marketplace = true;

-- ---------------------------------------------------------------------------
-- Marketplace search RPC (relevance-ranked, cursor paginated)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.search_marketplace(
  p_tsquery TEXT,
  p_type TEXT DEFAULT 'tudo',
  p_limit INT DEFAULT 20,
  p_cursor_rank REAL DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL,
  p_partner_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  item_type TEXT,
  id UUID,
  rank REAL,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
  v_tsq tsquery;
BEGIN
  IF coalesce(trim(p_tsquery), '') = '' THEN
    RETURN;
  END IF;

  BEGIN
    v_tsq := to_tsquery('portuguese', p_tsquery);
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;

  IF v_tsq IS NULL OR v_tsq = ''::tsquery THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH combined AS (
    SELECT
      'produto'::TEXT AS item_type,
      p.id,
      ts_rank_cd(p.fts, v_tsq, 32)::REAL AS rank,
      p.created_at
    FROM public.products p
    WHERE (p_type IN ('tudo', 'produtos'))
      AND p.is_active = true
      AND p.show_in_marketplace = true
      AND p.fts @@ v_tsq
      AND (p_partner_ids IS NULL OR p.partner_id = ANY(p_partner_ids))

    UNION ALL

    SELECT
      'servico'::TEXT,
      s.id,
      ts_rank_cd(s.fts, v_tsq, 32)::REAL,
      s.created_at
    FROM public.services s
    WHERE (p_type IN ('tudo', 'servicos'))
      AND s.is_active = true
      AND s.show_in_marketplace = true
      AND s.fts @@ v_tsq
      AND (p_partner_ids IS NULL OR s.partner_id = ANY(p_partner_ids))

    UNION ALL

    SELECT
      'loja'::TEXT,
      pt.id,
      ts_rank_cd(pt.fts, v_tsq, 32)::REAL,
      pt.created_at
    FROM public.partners pt
    WHERE (p_type IN ('tudo', 'vitrines'))
      AND pt.is_active = true
      AND pt.fts @@ v_tsq
      AND (p_partner_ids IS NULL OR pt.id = ANY(p_partner_ids))

    UNION ALL

    SELECT
      'plano'::TEXT,
      rp.id,
      ts_rank_cd(rp.fts, v_tsq, 32)::REAL,
      rp.created_at
    FROM public.recurring_plans rp
    WHERE (p_type IN ('tudo', 'planos'))
      AND rp.status = 'active'
      AND rp.show_in_marketplace = true
      AND rp.fts @@ v_tsq
      AND (p_partner_ids IS NULL OR rp.partner_id = ANY(p_partner_ids))
  )
  SELECT c.item_type, c.id, c.rank, c.created_at
  FROM combined c
  WHERE
    p_cursor_rank IS NULL
    OR p_cursor_id IS NULL
    OR (c.rank < p_cursor_rank OR (c.rank = p_cursor_rank AND c.id < p_cursor_id))
  ORDER BY c.rank DESC, c.id DESC
  LIMIT greatest(p_limit, 1);
END;
$$;

-- ---------------------------------------------------------------------------
-- Backfill existing rows
-- ---------------------------------------------------------------------------

SELECT public.refresh_product_marketplace_fts();
SELECT public.refresh_service_marketplace_fts();
SELECT public.refresh_partner_marketplace_fts();
SELECT public.refresh_recurring_plan_marketplace_fts();
