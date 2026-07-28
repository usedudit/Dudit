-- ============================================================================
-- Fix functions/triggers still referencing partners.store_name and other
-- columns dropped by 20260729_clean_partners_schema.sql.
--
-- What changed:
--   partners.store_name        → stores.name
--   partners.store_description → stores.description
--   partners.rating            → stores.rating
--   partners.risk_score        → stores.risk_score
--   partners.marketplace_reputation → stores.marketplace_reputation
--   partners.completed_orders_count → stores.completed_orders_count
--   partners.fts               → stores.fts
-- ============================================================================

BEGIN;

-- ─── 1. Drop broken triggers on partners ────────────────────────────────────
DROP TRIGGER IF EXISTS trg_partners_refresh_product_fts ON public.partners;
DROP FUNCTION IF EXISTS public.trg_partners_refresh_product_fts();

DROP TRIGGER IF EXISTS trg_partners_marketplace_fts ON public.partners;
DROP FUNCTION IF EXISTS public.trg_partners_marketplace_fts();

-- ─── 2. Fix refresh_product_marketplace_fts ─────────────────────────────────
--     Uses stores.name instead of partners.store_name.
--     Falls back: product.store_id → first store of the partner.
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
      COALESCE(st.name, '') AS store_name,
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
        COALESCE(st.name, ''),
        p2.sku
      ) as fts
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
$$;

-- ─── 3. Fix refresh_service_marketplace_fts ─────────────────────────────────
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
      COALESCE(st.name, '') AS store_name,
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
        COALESCE(st.name, ''),
        NULL
      ) as fts
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
$$;

-- ─── 4. Fix refresh_recurring_plan_marketplace_fts ──────────────────────────
CREATE OR REPLACE FUNCTION public.refresh_recurring_plan_marketplace_fts(p_plan_id UUID DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.recurring_plans rp
  SET
    mp_store_name = COALESCE(st.name, ''),
    fts = public.build_marketplace_tsvector(
      rp.name, NULL, NULL, NULL, rp.description,
      COALESCE(st.name, ''),
      NULL
    )
  FROM (
    SELECT rp2.id,
      (SELECT s.name FROM public.stores s
       WHERE s.id = COALESCE(rp2.store_id,
         (SELECT s2.id FROM public.stores s2 WHERE s2.partner_id = rp2.partner_id LIMIT 1)
       )
       LIMIT 1
      ) AS name
    FROM public.recurring_plans rp2
    WHERE (p_plan_id IS NULL OR rp2.id = p_plan_id)
  ) st
  WHERE rp.id = st.id;
END;
$$;

-- ─── 5. Fix refresh_partner_marketplace_fts ─────────────────────────────────
--     Partners no longer have store_name/store_description.
--     For vitrine FTS we pull the first store's name/description.
CREATE OR REPLACE FUNCTION public.refresh_partner_marketplace_fts(p_partner_id UUID DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.partners p
  SET
    mp_search_category_text = data.category_text,
    fts = data.fts
  FROM (
    SELECT
      p2.id,
      CASE WHEN cat.parent_id IS NOT NULL THEN parent_cat.name ELSE cat.name END AS category_text,
      public.build_marketplace_tsvector(
        COALESCE(st.name, ''),
        CASE WHEN cat.parent_id IS NOT NULL THEN parent_cat.name ELSE cat.name END,
        CASE WHEN cat.parent_id IS NOT NULL THEN cat.name ELSE NULL END,
        NULL,
        COALESCE(st.description, ''),
        COALESCE(st.name, ''),
        NULL
      ) AS fts
    FROM public.partners p2
    LEFT JOIN public.marketplace_partner_categories cat ON cat.id = p2.category_id
    LEFT JOIN public.marketplace_partner_categories parent_cat ON parent_cat.id = cat.parent_id
    LEFT JOIN LATERAL (
      SELECT s.name, s.description
      FROM public.stores s
      WHERE s.partner_id = p2.id
      ORDER BY s.created_at ASC
      LIMIT 1
    ) st ON true
    WHERE (p_partner_id IS NULL OR p2.id = p_partner_id)
  ) data
  WHERE p.id = data.id;
END;
$$;

-- ─── 6. Fix search_marketplace ──────────────────────────────────────────────
--     The 20260729 migration created search_marketplace_fts (new name) but
--     did NOT overwrite the original search_marketplace from 20260726.
--     That old version still references pt.store_name, pt.rating, etc.
DROP FUNCTION IF EXISTS public.search_marketplace(TEXT, TEXT, INT, REAL, UUID, UUID[]);

CREATE OR REPLACE FUNCTION public.search_marketplace(
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
AS $$
DECLARE
  v_norm TEXT;
  v_tokens TEXT[];
  v_expanded TEXT[];
  v_tsq tsquery;
BEGIN
  v_norm := public.normalize_search_text(p_query);
  IF v_norm = '' THEN RETURN; END IF;

  v_tokens := regexp_split_to_array(v_norm, '\s+');
  v_expanded := public.expand_marketplace_search_terms(v_tokens);
  v_tsq := public.build_marketplace_tsquery(p_query);

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
      ) * COALESCE(
        public.mp_store_risk_rank_multiplier(st.risk_score),
        public.mp_partner_risk_rank_multiplier(pt.risk_score)
      ) AS rank
    FROM public.products p
    JOIN public.partners pt ON pt.id = p.partner_id
    LEFT JOIN public.stores st ON st.id = p.store_id
    WHERE (p_type IN ('tudo', 'produtos'))
      AND p.is_active = TRUE
      AND p.show_in_marketplace = TRUE
      AND NOT COALESCE(public.mp_store_risk_is_hidden(st.risk_score), public.mp_partner_risk_is_hidden(pt.risk_score))
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
      ) * COALESCE(
        public.mp_store_risk_rank_multiplier(st.risk_score),
        public.mp_partner_risk_rank_multiplier(pt.risk_score)
      )
    FROM public.services s
    JOIN public.partners pt ON pt.id = s.partner_id
    LEFT JOIN public.stores st ON st.id = s.store_id
    WHERE (p_type IN ('tudo', 'servicos'))
      AND s.is_active = TRUE
      AND s.show_in_marketplace = TRUE
      AND NOT COALESCE(public.mp_store_risk_is_hidden(st.risk_score), public.mp_partner_risk_is_hidden(pt.risk_score))
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
      AND NOT public.mp_store_risk_is_hidden(st.risk_score)
      AND (p_partner_ids IS NULL OR st.partner_id = ANY(p_partner_ids))
      AND (p_store_ids IS NULL OR st.id = ANY(p_store_ids))
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
      ) * COALESCE(
        public.mp_store_risk_rank_multiplier(st.risk_score),
        public.mp_partner_risk_rank_multiplier(pt.risk_score)
      )
    FROM public.recurring_plans rp
    JOIN public.partners pt ON pt.id = rp.partner_id
    LEFT JOIN public.stores st ON st.id = rp.store_id
    WHERE (p_type IN ('tudo', 'planos'))
      AND rp.status = 'active'
      AND rp.show_in_marketplace = TRUE
      AND NOT COALESCE(public.mp_store_risk_is_hidden(st.risk_score), public.mp_partner_risk_is_hidden(pt.risk_score))
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
$$;

-- ─── 7. Drop obsolete index on partners.store_name ─────────────────────────
DROP INDEX IF EXISTS public.idx_partners_search_name_trgm;

COMMIT;

NOTIFY pgrst, 'reload schema';
