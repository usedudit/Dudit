-- Performance pass for the slow-query sample collected after the marketplace
-- search and ERP keyset migrations.
--
-- Scope:
--   1. Make marketplace candidate filtering visible to the planner before the
--      expensive rank/matching helpers run.
--   2. Add the missing partial search and delivery lookup indexes.
--   3. Provide a bulk advertisement-impression RPC so the web client can
--      coalesce several cards into one UPDATE.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- Marketplace search: smaller partial indexes for the active public set.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_products_marketplace_fts_gin
  ON public.products USING GIN (fts)
  WHERE is_active = TRUE AND show_in_marketplace = TRUE;

CREATE INDEX IF NOT EXISTS idx_services_marketplace_fts_gin
  ON public.services USING GIN (fts)
  WHERE is_active = TRUE AND show_in_marketplace = TRUE;

CREATE INDEX IF NOT EXISTS idx_stores_marketplace_fts_gin
  ON public.stores USING GIN (fts)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_recurring_plans_marketplace_fts_gin
  ON public.recurring_plans USING GIN (fts)
  WHERE status = 'active' AND show_in_marketplace = TRUE;

CREATE INDEX IF NOT EXISTS idx_services_search_category_trgm
  ON public.services
  USING GIN (
    public.normalize_search_text(
      coalesce(mp_search_category_text, '') || ' ' || coalesce(mp_search_subcategory_text, '')
    ) gin_trgm_ops
  )
  WHERE is_active = TRUE AND show_in_marketplace = TRUE;

CREATE INDEX IF NOT EXISTS idx_stores_search_name_trgm
  ON public.stores
  USING GIN (public.normalize_search_text(name) gin_trgm_ops)
  WHERE is_active = TRUE;

-- The old function call was opaque to the planner: every row reached
-- mp_search_row_matches() before PostgreSQL could use the GIN indexes. The
-- indexed predicates below are deliberately only a candidate pre-filter; the
-- original helper remains the final authority, preserving the ranking rules.
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
SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_norm TEXT;
  v_tokens TEXT[];
  v_expanded TEXT[];
  v_tsq TSQUERY;
BEGIN
  v_norm := public.normalize_search_text(p_query);
  IF v_norm = '' THEN RETURN; END IF;

  v_tokens := regexp_split_to_array(v_norm, '\\s+');

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
    WHERE p_type IN ('tudo', 'produtos')
      AND p.is_active = TRUE
      AND p.show_in_marketplace = TRUE
      AND NOT public.mp_store_risk_is_hidden(st.risk_score)
      AND (p_partner_ids IS NULL OR p.partner_id = ANY(p_partner_ids))
      AND (p_store_ids IS NULL OR (p.store_id IS NOT NULL AND p.store_id = ANY(p_store_ids)))
      AND (
        (v_tsq IS NOT NULL AND p.fts @@ v_tsq)
        OR public.normalize_search_text(p.name) LIKE v_norm || '%'
        OR public.normalize_search_text(p.name) LIKE '%' || v_norm || '%'
        OR public.normalize_search_text(p.name) % v_norm
        OR public.normalize_search_text(coalesce(p.mp_search_category_text, '') || ' ' || coalesce(p.mp_search_subcategory_text, '')) % v_norm
      )
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
    WHERE p_type IN ('tudo', 'servicos')
      AND s.is_active = TRUE
      AND s.show_in_marketplace = TRUE
      AND NOT public.mp_store_risk_is_hidden(st.risk_score)
      AND (p_partner_ids IS NULL OR s.partner_id = ANY(p_partner_ids))
      AND (p_store_ids IS NULL OR (s.store_id IS NOT NULL AND s.store_id = ANY(p_store_ids)))
      AND (
        (v_tsq IS NOT NULL AND s.fts @@ v_tsq)
        OR public.normalize_search_text(s.name) LIKE v_norm || '%'
        OR public.normalize_search_text(s.name) LIKE '%' || v_norm || '%'
        OR public.normalize_search_text(s.name) % v_norm
        OR public.normalize_search_text(coalesce(s.mp_search_category_text, '') || ' ' || coalesce(s.mp_search_subcategory_text, '')) % v_norm
      )
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
    WHERE p_type IN ('tudo', 'vitrines')
      AND st.is_active = TRUE
      AND NOT public.mp_store_risk_is_hidden(st.risk_score)
      AND (p_partner_ids IS NULL OR st.partner_id = ANY(p_partner_ids))
      AND (
        (v_tsq IS NOT NULL AND st.fts @@ v_tsq)
        OR public.normalize_search_text(st.name) LIKE v_norm || '%'
        OR public.normalize_search_text(st.name) LIKE '%' || v_norm || '%'
        OR public.normalize_search_text(st.name) % v_norm
        OR public.normalize_search_text(coalesce(pt.mp_search_category_text, '')) % v_norm
      )
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
    WHERE p_type IN ('tudo', 'planos')
      AND rp.status = 'active'
      AND rp.show_in_marketplace = TRUE
      AND NOT public.mp_store_risk_is_hidden(st.risk_score)
      AND (p_partner_ids IS NULL OR rp.partner_id = ANY(p_partner_ids))
      AND (p_store_ids IS NULL OR (rp.store_id IS NOT NULL AND rp.store_id = ANY(p_store_ids)))
      AND (
        (v_tsq IS NOT NULL AND rp.fts @@ v_tsq)
        OR public.normalize_search_text(rp.name) LIKE v_norm || '%'
        OR public.normalize_search_text(rp.name) LIKE '%' || v_norm || '%'
        OR public.normalize_search_text(rp.name) % v_norm
      )
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

-- ---------------------------------------------------------------------------
-- Delivery RPC lookups: support the recent/active candidate path and JSON
-- aggregation without adding broad unfiltered indexes.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_delivery_assignments_available_recent
  ON public.delivery_assignments (assigned_at DESC, id DESC)
  WHERE status IN ('available', 'requested')
     OR (status = 'assigned' AND driver_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_delivery_orders_delivery_order
  ON public.delivery_orders (delivery_id, order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id_id
  ON public.order_items (order_id, id);

CREATE INDEX IF NOT EXISTS idx_addresses_store_city_normalized
  ON public.addresses (store_id, lower(trim(city)))
  WHERE store_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_addresses_partner_city_normalized
  ON public.addresses (partner_id, lower(trim(city)))
  WHERE partner_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Ads: batch impressions to reduce one UPDATE/RPC per rendered card.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.increment_ad_impressions(p_ad_ids UUID[])
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  WITH increments AS (
    SELECT ad_id, count(*)::BIGINT AS amount
    FROM unnest(coalesce(p_ad_ids, ARRAY[]::UUID[])) AS ids(ad_id)
    GROUP BY ad_id
  )
  UPDATE public.advertisements a
  SET impressions_count = a.impressions_count + i.amount,
      updated_at = now()
  FROM increments i
  WHERE a.id = i.ad_id
    AND a.status = 'active'
    AND a.starts_at <= now()
    AND a.ends_at >= now();
$function$;

REVOKE ALL ON FUNCTION public.increment_ad_impressions(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_ad_impressions(UUID[]) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
