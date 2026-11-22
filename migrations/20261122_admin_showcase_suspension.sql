-- Migration: Administrative Online Showcase Suspension (per-store and per-partner/ERP)
-- Date: 2026-11-22
-- Description:
-- 1. Adds dedicated administrative showcase suspension columns to public.stores and public.partners,
--    separate from the merchant-controlled is_showcase_active toggle.
-- 2. Adds partial indexes for efficient expiration sweeps.
-- 3. Adds helper public.mp_is_showcase_suspended() to check active (non-expired) admin showcase suspension.
-- 4. Updates public marketplace SQL RPCs (browse_marketplace_by_score, search_marketplace_fts,
--    get_marketplace_products_public, get_marketplace_services_public) to completely hide
--    stores/partners with an active admin showcase suspension while preserving ERP access
--    and preserving the 0.01 ranking penalty for merchant-paused showcases (is_showcase_active = false).

BEGIN;

-- =============================================================================
-- 1. Add admin showcase suspension columns to stores & partners
-- =============================================================================

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS showcase_suspended_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS showcase_suspended_until TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS showcase_suspended_reason TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS showcase_suspended_by UUID DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS showcase_suspended_case_id TEXT DEFAULT NULL;

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS showcase_suspended_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS showcase_suspended_until TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS showcase_suspended_reason TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS showcase_suspended_by UUID DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS showcase_suspended_case_id TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_stores_showcase_suspended_until
  ON public.stores (showcase_suspended_until)
  WHERE showcase_suspended_at IS NOT NULL AND showcase_suspended_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_partners_showcase_suspended_until
  ON public.partners (showcase_suspended_until)
  WHERE showcase_suspended_at IS NOT NULL AND showcase_suspended_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stores_showcase_suspended_at
  ON public.stores (showcase_suspended_at)
  WHERE showcase_suspended_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_partners_showcase_suspended_at
  ON public.partners (showcase_suspended_at)
  WHERE showcase_suspended_at IS NOT NULL;

-- =============================================================================
-- 2. Helper function: is showcase actively suspended by admin?
-- =============================================================================

CREATE OR REPLACE FUNCTION public.mp_is_showcase_suspended(
  p_store_suspended_at TIMESTAMPTZ,
  p_store_suspended_until TIMESTAMPTZ,
  p_partner_suspended_at TIMESTAMPTZ,
  p_partner_suspended_until TIMESTAMPTZ
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT
    (p_store_suspended_at IS NOT NULL AND (p_store_suspended_until IS NULL OR p_store_suspended_until > now()))
    OR
    (p_partner_suspended_at IS NOT NULL AND (p_partner_suspended_until IS NULL OR p_partner_suspended_until > now()));
$$;

-- =============================================================================
-- 3. Update browse_marketplace_by_score to hide admin-suspended showcases
-- =============================================================================

DROP FUNCTION IF EXISTS public.browse_marketplace_by_score(TEXT, INT, REAL, UUID, UUID[]);
DROP FUNCTION IF EXISTS public.browse_marketplace_by_score(TEXT, INT, REAL, UUID, UUID[], UUID[]);

CREATE OR REPLACE FUNCTION public.browse_marketplace_by_score(
  p_type TEXT DEFAULT 'produtos',
  p_limit INT DEFAULT 20,
  p_cursor_score REAL DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL,
  p_partner_ids UUID[] DEFAULT NULL,
  p_store_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  item_type TEXT,
  id UUID,
  score REAL,
  created_at TIMESTAMPTZ,
  partner_id UUID,
  store_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  WITH combined AS (
    SELECT
      'produto'::TEXT AS item_type,
      p.id,
      (COALESCE(p.marketplace_score, 0)::REAL
        * CASE WHEN st.is_showcase_active = false THEN 0.01::REAL ELSE 1.0::REAL END
        * COALESCE(public.mp_store_risk_rank_multiplier(st.risk_score), 1.0::REAL)
      )::REAL AS score,
      p.created_at,
      p.partner_id,
      p.store_id
    FROM public.products p
    JOIN public.partners pt ON pt.id = p.partner_id
    LEFT JOIN public.stores st ON st.id = p.store_id
    WHERE p_type IN ('tudo', 'produtos')
      AND p.is_active = true
      AND p.show_in_marketplace = true
      AND NOT public.mp_is_showcase_suspended(st.showcase_suspended_at, st.showcase_suspended_until, pt.showcase_suspended_at, pt.showcase_suspended_until)
      AND NOT COALESCE(public.mp_store_risk_is_hidden(st.risk_score), false)
      AND (p_partner_ids IS NULL OR p.partner_id = ANY(p_partner_ids))
      AND (p_store_ids IS NULL OR (p.store_id IS NOT NULL AND p.store_id = ANY(p_store_ids)))

    UNION ALL

    SELECT
      'servico'::TEXT,
      s.id,
      (COALESCE(s.marketplace_score, 0)::REAL
        * CASE WHEN st.is_showcase_active = false THEN 0.01::REAL ELSE 1.0::REAL END
        * COALESCE(public.mp_store_risk_rank_multiplier(st.risk_score), 1.0::REAL)
      )::REAL,
      s.created_at,
      s.partner_id,
      s.store_id
    FROM public.services s
    JOIN public.partners pt ON pt.id = s.partner_id
    LEFT JOIN public.stores st ON st.id = s.store_id
    WHERE p_type IN ('tudo', 'servicos')
      AND s.is_active = true
      AND s.show_in_marketplace = true
      AND NOT public.mp_is_showcase_suspended(st.showcase_suspended_at, st.showcase_suspended_until, pt.showcase_suspended_at, pt.showcase_suspended_until)
      AND NOT COALESCE(public.mp_store_risk_is_hidden(st.risk_score), false)
      AND (p_partner_ids IS NULL OR s.partner_id = ANY(p_partner_ids))
      AND (p_store_ids IS NULL OR (s.store_id IS NOT NULL AND s.store_id = ANY(p_store_ids)))

    UNION ALL

    SELECT
      'plano'::TEXT,
      rp.id,
      (COALESCE(rp.marketplace_score, 0)::REAL
        * CASE WHEN st.is_showcase_active = false THEN 0.01::REAL ELSE 1.0::REAL END
        * COALESCE(public.mp_store_risk_rank_multiplier(st.risk_score), 1.0::REAL)
      )::REAL,
      rp.created_at,
      rp.partner_id,
      rp.store_id
    FROM public.recurring_plans rp
    JOIN public.partners pt ON pt.id = rp.partner_id
    LEFT JOIN public.stores st ON st.id = rp.store_id
    WHERE p_type IN ('tudo', 'planos')
      AND rp.status = 'active'
      AND rp.show_in_marketplace = true
      AND NOT public.mp_is_showcase_suspended(st.showcase_suspended_at, st.showcase_suspended_until, pt.showcase_suspended_at, pt.showcase_suspended_until)
      AND NOT COALESCE(public.mp_store_risk_is_hidden(st.risk_score), false)
      AND (p_partner_ids IS NULL OR rp.partner_id = ANY(p_partner_ids))
      AND (p_store_ids IS NULL OR (rp.store_id IS NOT NULL AND rp.store_id = ANY(p_store_ids)))

    UNION ALL

    SELECT
      'loja'::TEXT,
      st.id,
      (COALESCE(st.marketplace_reputation, 0)::REAL
        * CASE WHEN st.is_showcase_active = false THEN 0.01::REAL ELSE 1.0::REAL END
        * COALESCE(public.mp_store_risk_rank_multiplier(st.risk_score), 1.0::REAL)
      )::REAL,
      st.created_at,
      st.partner_id,
      st.id AS store_id
    FROM public.stores st
    JOIN public.partners pt ON pt.id = st.partner_id
    WHERE p_type IN ('tudo', 'vitrines')
      AND st.is_active = true
      AND NOT public.mp_is_showcase_suspended(st.showcase_suspended_at, st.showcase_suspended_until, pt.showcase_suspended_at, pt.showcase_suspended_until)
      AND NOT COALESCE(public.mp_store_risk_is_hidden(st.risk_score), false)
      AND (p_partner_ids IS NULL OR st.partner_id = ANY(p_partner_ids))
      AND (p_store_ids IS NULL OR st.id = ANY(p_store_ids))
  )
  SELECT c.item_type, c.id, c.score, c.created_at, c.partner_id, c.store_id
  FROM combined c
  WHERE
    p_cursor_score IS NULL
    OR p_cursor_id IS NULL
    OR (c.score < p_cursor_score OR (c.score = p_cursor_score AND c.id < p_cursor_id))
  ORDER BY c.score DESC, c.id DESC
  LIMIT greatest(p_limit, 1);
END;
$$;

-- =============================================================================
-- 4. Update search_marketplace_fts to hide admin-suspended showcases
-- =============================================================================

CREATE OR REPLACE FUNCTION public.search_marketplace_fts(
  p_query TEXT,
  p_type TEXT DEFAULT 'tudo',
  p_limit INT DEFAULT 20,
  p_cursor_rank REAL DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL,
  p_partner_ids UUID[] DEFAULT NULL,
  p_store_ids UUID[] DEFAULT NULL
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
AS $function$
DECLARE
  v_norm TEXT;
  v_tokens TEXT[];
  v_expanded TEXT[];
  v_tsq TSQUERY;
BEGIN
  v_norm := public.normalize_search_text(p_query);
  IF v_norm = '' THEN RETURN; END IF;

  v_tokens := regexp_split_to_array(v_norm, '\s+');

  SELECT context.expanded_terms, context.tsq
  INTO v_expanded, v_tsq
  FROM public.build_marketplace_search_context(p_query) AS context;

  RETURN QUERY
  WITH combined AS (
    SELECT
      'produto'::TEXT AS item_type,
      p.id,
      p.created_at,
      p.partner_id,
      p.store_id,
      public.mp_compute_search_rank(
        p.name, v_norm, v_tokens, v_expanded,
        p.mp_search_category_text, p.mp_search_subcategory_text,
        p.fts, v_tsq, p.marketplace_score, p.rating, p.sales_last_30_days, p.created_at
      ) * public.mp_store_risk_rank_multiplier(st.risk_score) AS rank
    FROM public.products p
    JOIN public.partners pt ON pt.id = p.partner_id
    LEFT JOIN public.stores st ON st.id = p.store_id
    WHERE (p_type IN ('tudo', 'produtos'))
      AND p.is_active = TRUE
      AND p.show_in_marketplace = TRUE
      AND NOT public.mp_is_showcase_suspended(st.showcase_suspended_at, st.showcase_suspended_until, pt.showcase_suspended_at, pt.showcase_suspended_until)
      AND NOT public.mp_store_risk_is_hidden(st.risk_score)
      AND (p_partner_ids IS NULL OR p.partner_id = ANY(p_partner_ids))
      AND (p_store_ids IS NULL OR (p.store_id IS NOT NULL AND p.store_id = ANY(p_store_ids)))
      AND public.mp_search_row_matches(
        p.name, p.mp_search_category_text, p.mp_search_subcategory_text,
        p.fts, v_tsq, v_norm, v_tokens, v_expanded
      )

    UNION ALL

    SELECT
      'servico'::TEXT,
      s.id,
      s.created_at,
      s.partner_id,
      s.store_id,
      public.mp_compute_search_rank(
        s.name, v_norm, v_tokens, v_expanded,
        s.mp_search_category_text, s.mp_search_subcategory_text,
        s.fts, v_tsq, s.marketplace_score, s.rating, s.bookings_last_30_days, s.created_at
      ) * public.mp_store_risk_rank_multiplier(st.risk_score)
    FROM public.services s
    JOIN public.partners pt ON pt.id = s.partner_id
    LEFT JOIN public.stores st ON st.id = s.store_id
    WHERE (p_type IN ('tudo', 'servicos'))
      AND s.is_active = TRUE
      AND s.show_in_marketplace = TRUE
      AND NOT public.mp_is_showcase_suspended(st.showcase_suspended_at, st.showcase_suspended_until, pt.showcase_suspended_at, pt.showcase_suspended_until)
      AND NOT public.mp_store_risk_is_hidden(st.risk_score)
      AND (p_partner_ids IS NULL OR s.partner_id = ANY(p_partner_ids))
      AND (p_store_ids IS NULL OR (s.store_id IS NOT NULL AND s.store_id = ANY(p_store_ids)))
      AND public.mp_search_row_matches(
        s.name, s.mp_search_category_text, s.mp_search_subcategory_text,
        s.fts, v_tsq, v_norm, v_tokens, v_expanded
      )

    UNION ALL

    SELECT
      'loja'::TEXT,
      st.id,
      st.created_at,
      st.partner_id,
      st.id AS store_id,
      public.mp_compute_search_rank(
        st.name, v_norm, v_tokens, v_expanded,
        pt.mp_search_category_text, NULL,
        st.fts, v_tsq, st.marketplace_reputation, st.rating, st.completed_orders_count, st.created_at
      ) * public.mp_store_risk_rank_multiplier(st.risk_score)
    FROM public.stores st
    JOIN public.partners pt ON pt.id = st.partner_id
    WHERE (p_type IN ('tudo', 'vitrines'))
      AND st.is_active = TRUE
      AND NOT public.mp_is_showcase_suspended(st.showcase_suspended_at, st.showcase_suspended_until, pt.showcase_suspended_at, pt.showcase_suspended_until)
      AND NOT public.mp_store_risk_is_hidden(st.risk_score)
      AND (p_partner_ids IS NULL OR st.partner_id = ANY(p_partner_ids))
      AND public.mp_search_row_matches(
        st.name, pt.mp_search_category_text, NULL,
        st.fts, v_tsq, v_norm, v_tokens, v_expanded
      )

    UNION ALL

    SELECT
      'plano'::TEXT,
      rp.id,
      rp.created_at,
      rp.partner_id,
      rp.store_id,
      public.mp_compute_search_rank(
        rp.name, v_norm, v_tokens, v_expanded,
        NULL, NULL,
        rp.fts, v_tsq, rp.marketplace_score, 0, rp.signups_last_30_days, rp.created_at
      ) * public.mp_store_risk_rank_multiplier(st.risk_score)
    FROM public.recurring_plans rp
    JOIN public.partners pt ON pt.id = rp.partner_id
    LEFT JOIN public.stores st ON st.id = rp.store_id
    WHERE (p_type IN ('tudo', 'planos'))
      AND rp.status = 'active'
      AND rp.show_in_marketplace = TRUE
      AND NOT public.mp_is_showcase_suspended(st.showcase_suspended_at, st.showcase_suspended_until, pt.showcase_suspended_at, pt.showcase_suspended_until)
      AND NOT public.mp_store_risk_is_hidden(st.risk_score)
      AND (p_partner_ids IS NULL OR rp.partner_id = ANY(p_partner_ids))
      AND (p_store_ids IS NULL OR (rp.store_id IS NOT NULL AND rp.store_id = ANY(p_store_ids)))
      AND public.mp_search_row_matches(
        rp.name, NULL, NULL,
        rp.fts, v_tsq, v_norm, v_tokens, v_expanded
      )
  ),
  diversified AS (
    SELECT
      c.*,
      row_number() OVER (
        PARTITION BY COALESCE(c.store_id::text, c.partner_id::text)
        ORDER BY c.rank DESC, c.id DESC
      ) AS seller_row
    FROM combined c
  )
  SELECT d.item_type, d.id, d.rank, d.created_at
  FROM diversified d
  WHERE d.seller_row <= 3
    AND (
      p_cursor_rank IS NULL
      OR p_cursor_id IS NULL
      OR (d.rank < p_cursor_rank OR (d.rank = p_cursor_rank AND d.id < p_cursor_id))
    )
  ORDER BY d.rank DESC, d.id DESC
  LIMIT greatest(p_limit, 1);
END;
$function$;

-- =============================================================================
-- 5. Update get_marketplace_products_public & get_marketplace_services_public
-- =============================================================================

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
  LEFT JOIN public.partners AS pt
    ON pt.id = p.partner_id
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
    AND NOT public.mp_is_showcase_suspended(s.showcase_suspended_at, s.showcase_suspended_until, pt.showcase_suspended_at, pt.showcase_suspended_until)
    AND (p_product_ids IS NULL OR p.id = ANY (p_product_ids))
    AND (p_store_id IS NULL OR p.store_id = p_store_id);
$$;

REVOKE ALL ON FUNCTION public.get_marketplace_products_public(uuid[], uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_marketplace_products_public(uuid[], uuid) TO anon, authenticated, service_role;

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
  LEFT JOIN public.partners AS pt
    ON pt.id = sv.partner_id
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
    AND NOT public.mp_is_showcase_suspended(s.showcase_suspended_at, s.showcase_suspended_until, pt.showcase_suspended_at, pt.showcase_suspended_until)
    AND (p_service_ids IS NULL OR sv.id = ANY (p_service_ids))
    AND (p_store_id IS NULL OR sv.store_id = p_store_id);
$$;

REVOKE ALL ON FUNCTION public.get_marketplace_services_public(uuid[], uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_marketplace_services_public(uuid[], uuid) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
