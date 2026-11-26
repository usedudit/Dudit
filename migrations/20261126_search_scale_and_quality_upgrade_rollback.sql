-- ============================================================================
-- Rollback: 20261126_search_scale_and_quality_upgrade_rollback.sql
--
-- Reverte as alterações de 20261126_search_scale_and_quality_upgrade.sql
-- (mantendo a compatibilidade com 20261126_search_index_specifications.sql).
-- ============================================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_product_variants_refresh_fts ON public.product_variants;
DROP FUNCTION IF EXISTS public.trg_product_variants_refresh_fts();

DROP TRIGGER IF EXISTS trg_brands_refresh_product_fts ON public.brands;
DROP FUNCTION IF EXISTS public.trg_brands_refresh_product_fts();

DROP FUNCTION IF EXISTS public.extract_product_variants_text(UUID);

DROP INDEX IF EXISTS public.idx_services_search_category_trgm;
DROP INDEX IF EXISTS public.idx_stores_search_name_trgm;

DROP FUNCTION IF EXISTS public.search_marketplace_fts(TEXT, TEXT, INT, REAL, UUID, UUID[], UUID[], TEXT[]);

-- Restaura search_marketplace_fts (7 args, estado pós-20261122)
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

NOTIFY pgrst, 'reload schema';

COMMIT;
