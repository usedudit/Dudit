-- Marketplace search performance: resolve synonym context once per request.
--
-- The previous search_marketplace_fts implementation resolved the same
-- synonym groups twice: once through expand_marketplace_search_terms() and
-- once through build_marketplace_tsquery(). This migration keeps both legacy
-- helpers intact and makes the RPC use one combined pass instead.

BEGIN;

CREATE OR REPLACE FUNCTION public.build_marketplace_search_context(p_query TEXT)
RETURNS TABLE (
  expanded_terms TEXT[],
  tsq TSQUERY
)
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_norm TEXT;
  v_tokens TEXT[];
  v_expanded TEXT[];
  v_tsquery_text TEXT;
  v_tsq TSQUERY;
BEGIN
  v_norm := public.normalize_search_text(p_query);

  IF v_norm = '' THEN
    expanded_terms := ARRAY[]::TEXT[];
    tsq := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  v_tokens := regexp_split_to_array(v_norm, '\s+');

  WITH input_tokens AS MATERIALIZED (
    SELECT token, ordinality
    FROM unnest(coalesce(v_tokens, ARRAY[]::TEXT[])) WITH ORDINALITY AS input(token, ordinality)
    WHERE coalesce(token, '') <> ''
  ),
  unique_tokens AS MATERIALIZED (
    SELECT DISTINCT token
    FROM input_tokens
  ),
  matched_groups AS MATERIALIZED (
    SELECT DISTINCT
      input.token,
      synonym.group_id
    FROM unique_tokens input
    JOIN public.marketplace_synonym_terms synonym
      ON synonym.is_active
     AND (
       synonym.term_normalized = input.token
       OR synonym.term_normalized LIKE input.token || '%'
       OR (
         length(input.token) >= 2
         AND synonym.term_normalized % input.token
       )
     )
    JOIN public.marketplace_synonym_groups synonym_group
      ON synonym_group.id = synonym.group_id
     AND synonym_group.is_active
  ),
  group_terms AS MATERIALIZED (
    SELECT DISTINCT
      matched.token,
      synonym.term_normalized AS term
    FROM matched_groups matched
    JOIN public.marketplace_synonym_terms synonym
      ON synonym.group_id = matched.group_id
     AND synonym.is_active
  ),
  group_keywords AS MATERIALIZED (
    SELECT DISTINCT
      public.normalize_search_text(keyword.value) AS term
    FROM (
      SELECT DISTINCT group_id
      FROM matched_groups
    ) matched
    JOIN public.marketplace_synonym_groups synonym_group
      ON synonym_group.id = matched.group_id
     AND synonym_group.is_active
    CROSS JOIN LATERAL unnest(
      coalesce(synonym_group.category_keywords, ARRAY[]::TEXT[])
    ) AS keyword(value)
    WHERE public.normalize_search_text(keyword.value) <> ''
  ),
  all_expanded_terms AS MATERIALIZED (
    SELECT token AS term
    FROM unique_tokens

    UNION

    SELECT term
    FROM group_terms

    UNION

    SELECT term
    FROM group_keywords
  ),
  tsquery_terms AS MATERIALIZED (
    SELECT input.token, input.ordinality, input.token AS term
    FROM input_tokens input

    UNION

    SELECT input.token, input.ordinality, group_term.term
    FROM input_tokens input
    JOIN group_terms group_term
      ON group_term.token = input.token
  ),
  tsquery_clauses AS (
    SELECT
      token,
      ordinality,
      '(' || string_agg(replace(term, ' ', ' & '), ' | ' ORDER BY term) || ')' AS clause
    FROM tsquery_terms
    GROUP BY token, ordinality
  )
  SELECT
    coalesce(
      (SELECT array_agg(term ORDER BY term) FROM all_expanded_terms),
      v_tokens
    ),
    (SELECT string_agg(clause, ' & ' ORDER BY ordinality) FROM tsquery_clauses)
  INTO v_expanded, v_tsquery_text;

  BEGIN
    v_tsq := to_tsquery('portuguese', v_tsquery_text);
  EXCEPTION WHEN OTHERS THEN
    v_tsq := plainto_tsquery('portuguese', v_norm);
  END;

  IF v_tsq IS NULL OR v_tsq = ''::TSQUERY THEN
    v_tsq := plainto_tsquery('portuguese', v_norm);
  END IF;

  expanded_terms := coalesce(v_expanded, v_tokens, ARRAY[]::TEXT[]);
  tsq := v_tsq;
  RETURN NEXT;
END;
$function$;

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
