-- Marketplace Search v2: pg_trgm, prefix/fuzzy matching, DB-managed synonym groups
-- Replaces hardcoded synonym dictionaries with scalable PostgreSQL search pipeline.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- =============================================================================
-- Text normalization (matches lib/search/normalize.ts)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.normalize_search_text(input TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT trim(regexp_replace(
    lower(unaccent(coalesce(input, ''))),
    '[^[:alnum:][:space:]]', ' ', 'g'
  ));
$$;

-- =============================================================================
-- Synonym groups (admin-managed)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.marketplace_synonym_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  category_keywords TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketplace_synonym_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.marketplace_synonym_groups(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  term_normalized TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, term_normalized)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_synonym_terms_normalized
  ON public.marketplace_synonym_terms (term_normalized)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_marketplace_synonym_terms_trgm
  ON public.marketplace_synonym_terms
  USING gin (term_normalized gin_trgm_ops)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_marketplace_synonym_terms_group
  ON public.marketplace_synonym_terms (group_id)
  WHERE is_active = TRUE;

ALTER TABLE public.marketplace_synonym_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_synonym_terms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketplace_synonym_groups_public_read ON public.marketplace_synonym_groups;
CREATE POLICY marketplace_synonym_groups_public_read
  ON public.marketplace_synonym_groups FOR SELECT
  USING (is_active = TRUE);

DROP POLICY IF EXISTS marketplace_synonym_terms_public_read ON public.marketplace_synonym_terms;
CREATE POLICY marketplace_synonym_terms_public_read
  ON public.marketplace_synonym_terms FOR SELECT
  USING (is_active = TRUE);

DROP POLICY IF EXISTS marketplace_synonym_groups_service ON public.marketplace_synonym_groups;
CREATE POLICY marketplace_synonym_groups_service
  ON public.marketplace_synonym_groups FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS marketplace_synonym_terms_service ON public.marketplace_synonym_terms;
CREATE POLICY marketplace_synonym_terms_service
  ON public.marketplace_synonym_terms FOR ALL
  USING (auth.role() = 'service_role');

-- =============================================================================
-- Seed synonym groups
-- =============================================================================

INSERT INTO public.marketplace_synonym_groups (name, slug, description, category_keywords)
VALUES
  (
    'Vestuário',
    'clothing',
    'Roupas, moda e vestuário',
    ARRAY['moda', 'roupas', 'vestuario', 'camiseta', 'camisa', 'calca', 'bermuda', 'short', 'blusa', 'jaqueta']
  ),
  (
    'Pets',
    'pets',
    'Produtos e serviços para animais',
    ARRAY['pet', 'pets', 'racao', 'coleira', 'brinquedo', 'adestramento']
  ),
  (
    'Veículos',
    'vehicles',
    'Auto e moto',
    ARRAY['auto', 'moto', 'carro', 'veiculo', 'pneu', 'peca']
  ),
  (
    'Eletrônicos',
    'electronics',
    'Tecnologia e eletrônicos',
    ARRAY['eletronico', 'celular', 'notebook', 'computador', 'tecnologia']
  )
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.marketplace_synonym_terms (group_id, term, term_normalized)
SELECT g.id, v.term, public.normalize_search_text(v.term)
FROM public.marketplace_synonym_groups g
CROSS JOIN (
  VALUES
    ('clothing', 'roupa'), ('clothing', 'roupas'), ('clothing', 'moda'),
    ('clothing', 'camiseta'), ('clothing', 'camisa'), ('clothing', 'calça'),
    ('clothing', 'calca'), ('clothing', 'bermuda'), ('clothing', 'short'),
    ('clothing', 'shorts'), ('clothing', 'blusa'), ('clothing', 'jaqueta'),
    ('clothing', 'vestuário'), ('clothing', 'vestuario'),
    ('pets', 'pet'), ('pets', 'pets'), ('pets', 'ração'), ('pets', 'racao'),
    ('pets', 'coleira'), ('pets', 'brinquedo'), ('pets', 'adestramento'),
    ('pets', 'acessório'), ('pets', 'acessorio'),
    ('vehicles', 'veículo'), ('vehicles', 'veiculo'), ('vehicles', 'carro'),
    ('vehicles', 'moto'), ('vehicles', 'auto'), ('vehicles', 'pneu'), ('vehicles', 'peça'), ('vehicles', 'peca'),
    ('electronics', 'eletrônico'), ('electronics', 'eletronico'), ('electronics', 'eletrônicos'),
    ('electronics', 'eletronicos'), ('electronics', 'celular'), ('electronics', 'notebook'),
    ('electronics', 'computador'), ('electronics', 'tecnologia'), ('electronics', 'fone')
) AS v(slug, term)
WHERE g.slug = v.slug
ON CONFLICT (group_id, term_normalized) DO NOTHING;

-- =============================================================================
-- Synonym expansion
-- =============================================================================

CREATE OR REPLACE FUNCTION public.expand_marketplace_search_terms(p_tokens TEXT[])
RETURNS TEXT[]
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  WITH input_tokens AS (
    SELECT DISTINCT t AS token
    FROM unnest(coalesce(p_tokens, ARRAY[]::TEXT[])) AS t
    WHERE coalesce(t, '') <> ''
  ),
  matched_groups AS (
    SELECT DISTINCT st.group_id
    FROM public.marketplace_synonym_terms st
    INNER JOIN public.marketplace_synonym_groups sg ON sg.id = st.group_id AND sg.is_active
    INNER JOIN input_tokens it ON st.is_active AND (
      st.term_normalized = it.token
      OR st.term_normalized LIKE it.token || '%'
      OR (length(it.token) >= 2 AND st.term_normalized % it.token)
    )
  ),
  group_keywords AS (
    SELECT DISTINCT public.normalize_search_text(kw) AS term
    FROM public.marketplace_synonym_groups sg
    CROSS JOIN unnest(sg.category_keywords) AS kw
    WHERE sg.is_active AND sg.id IN (SELECT group_id FROM matched_groups)
  ),
  group_terms AS (
    SELECT DISTINCT st.term_normalized AS term
    FROM public.marketplace_synonym_terms st
    WHERE st.is_active AND st.group_id IN (SELECT group_id FROM matched_groups)
  ),
  all_terms AS (
    SELECT token AS term FROM input_tokens
    UNION SELECT term FROM group_terms
    UNION SELECT term FROM group_keywords
  )
  SELECT coalesce(array_agg(DISTINCT term), p_tokens)
  FROM all_terms;
$$;

CREATE OR REPLACE FUNCTION public.build_marketplace_tsquery(p_query TEXT)
RETURNS tsquery
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_norm TEXT;
  v_tokens TEXT[];
  v_token TEXT;
  v_group_terms TEXT[];
  v_clauses TEXT[] := '{}';
  v_clause TEXT;
  v_result tsquery;
BEGIN
  v_norm := public.normalize_search_text(p_query);
  IF v_norm = '' THEN RETURN NULL; END IF;

  v_tokens := regexp_split_to_array(v_norm, '\s+');

  FOREACH v_token IN ARRAY v_tokens LOOP
    SELECT coalesce(array_agg(DISTINCT t), ARRAY[v_token])
    INTO v_group_terms
    FROM (
      SELECT v_token AS t
      UNION
      SELECT st.term_normalized
      FROM public.marketplace_synonym_terms st
      INNER JOIN public.marketplace_synonym_groups sg ON sg.id = st.group_id AND sg.is_active
      WHERE st.is_active AND st.group_id IN (
        SELECT st2.group_id
        FROM public.marketplace_synonym_terms st2
        WHERE st2.is_active AND (
          st2.term_normalized = v_token
          OR st2.term_normalized LIKE v_token || '%'
          OR (length(v_token) >= 2 AND st2.term_normalized % v_token)
        )
      )
    ) expanded;

    IF coalesce(array_length(v_group_terms, 1), 0) <= 1 THEN
      v_clause := replace(v_group_terms[1], ' ', ' & ');
    ELSE
      v_clause := '(' || array_to_string(
        ARRAY(SELECT replace(x, ' ', ' & ') FROM unnest(v_group_terms) x),
        ' | '
      ) || ')';
    END IF;
    v_clauses := array_append(v_clauses, v_clause);
  END LOOP;

  BEGIN
    v_result := to_tsquery('portuguese', array_to_string(v_clauses, ' & '));
  EXCEPTION WHEN OTHERS THEN
    v_result := plainto_tsquery('portuguese', v_norm);
  END;

  IF v_result IS NULL OR v_result = ''::tsquery THEN
    v_result := plainto_tsquery('portuguese', v_norm);
  END IF;

  RETURN v_result;
END;
$$;

-- =============================================================================
-- Trigram / prefix indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_products_search_name_trgm
  ON public.products
  USING gin (public.normalize_search_text(name) gin_trgm_ops)
  WHERE is_active = TRUE AND show_in_marketplace = TRUE;

CREATE INDEX IF NOT EXISTS idx_services_search_name_trgm
  ON public.services
  USING gin (public.normalize_search_text(name) gin_trgm_ops)
  WHERE is_active = TRUE AND show_in_marketplace = TRUE;

CREATE INDEX IF NOT EXISTS idx_recurring_plans_search_name_trgm
  ON public.recurring_plans
  USING gin (public.normalize_search_text(name) gin_trgm_ops)
  WHERE status = 'active' AND show_in_marketplace = TRUE;

CREATE INDEX IF NOT EXISTS idx_partners_search_name_trgm
  ON public.partners
  USING gin (public.normalize_search_text(store_name) gin_trgm_ops)
  WHERE is_active = TRUE;

-- Category text trigram for boost matching
CREATE INDEX IF NOT EXISTS idx_products_category_text_trgm
  ON public.products
  USING gin (public.normalize_search_text(coalesce(mp_search_category_text, '') || ' ' || coalesce(mp_search_subcategory_text, '')) gin_trgm_ops)
  WHERE is_active = TRUE AND show_in_marketplace = TRUE;

-- =============================================================================
-- Relevance scoring helper
-- =============================================================================

CREATE OR REPLACE FUNCTION public.mp_search_text_matches_any(haystack TEXT, needles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(coalesce(needles, ARRAY[]::TEXT[])) n
    WHERE n <> '' AND public.normalize_search_text(haystack) LIKE '%' || n || '%'
  );
$$;

CREATE OR REPLACE FUNCTION public.mp_search_category_boost(
  p_category TEXT,
  p_subcategory TEXT,
  p_expanded TEXT[]
)
RETURNS REAL
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN public.normalize_search_text(coalesce(p_category, '')) = ANY(p_expanded)
      OR public.normalize_search_text(coalesce(p_subcategory, '')) = ANY(p_expanded)
    THEN 0.55
    WHEN public.mp_search_text_matches_any(coalesce(p_category, '') || ' ' || coalesce(p_subcategory, ''), p_expanded)
    THEN 0.45
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.mp_compute_search_rank(
  p_name TEXT,
  p_norm_query TEXT,
  p_tokens TEXT[],
  p_expanded TEXT[],
  p_category TEXT,
  p_subcategory TEXT,
  p_fts tsvector,
  p_tsq tsquery,
  p_marketplace_score NUMERIC,
  p_rating NUMERIC,
  p_sales_30d INTEGER,
  p_created_at TIMESTAMPTZ
)
RETURNS REAL
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
AS $$
DECLARE
  v_name TEXT := public.normalize_search_text(p_name);
  v_exact REAL := 0;
  v_prefix REAL := 0;
  v_fts REAL := 0;
  v_category REAL := 0;
  v_synonym REAL := 0;
  v_fuzzy REAL := 0;
  v_boost REAL := 0;
  v_fresh REAL := 1;
  v_token TEXT;
  v_core REAL;
BEGIN
  IF v_name = p_norm_query THEN
    v_exact := 1.0;
  END IF;

  IF v_name LIKE p_norm_query || '%' THEN
    v_prefix := GREATEST(v_prefix, 0.88);
  END IF;

  FOREACH v_token IN ARRAY coalesce(p_tokens, ARRAY[]::TEXT[]) LOOP
    IF v_name LIKE v_token || '%' OR v_name LIKE '% ' || v_token || '%' THEN
      v_prefix := GREATEST(v_prefix, 0.82);
    END IF;
  END LOOP;

  IF p_tsq IS NOT NULL AND p_tsq <> ''::tsquery AND p_fts @@ p_tsq THEN
    v_fts := LEAST(ts_rank_cd(p_fts, p_tsq, 32)::REAL, 1.0) * 0.72;
  END IF;

  v_category := public.mp_search_category_boost(p_category, p_subcategory, p_expanded);

  IF v_synonym = 0 AND public.mp_search_text_matches_any(v_name, p_expanded) THEN
    v_synonym := 0.38;
  END IF;

  IF length(p_norm_query) >= 2 THEN
    v_fuzzy := GREATEST(
      similarity(v_name, p_norm_query),
      word_similarity(p_norm_query, v_name)
    ) * 0.32;
  END IF;

  v_core := GREATEST(v_exact, v_prefix, v_fts, v_category, v_synonym, v_fuzzy);

  IF coalesce(p_sales_30d, 0) > 0 THEN
    v_boost := v_boost + LEAST(coalesce(p_sales_30d, 0), 100)::REAL / 100.0 * 0.05;
  END IF;
  v_boost := v_boost + LEAST(coalesce(p_rating, 0), 5)::REAL / 5.0 * 0.04;
  v_boost := v_boost + LEAST(coalesce(p_marketplace_score, 0), 1)::REAL * 0.06;

  BEGIN
    v_fresh := public.mp_freshness_factor(p_created_at);
  EXCEPTION WHEN OTHERS THEN
    v_fresh := CASE
      WHEN p_created_at > now() - interval '7 days' THEN 1.25
      WHEN p_created_at > now() - interval '30 days' THEN 1.10
      ELSE 1.0
    END;
  END;

  v_boost := v_boost + (LEAST(v_fresh, 1.25) / 1.25) * 0.04;

  RETURN (v_core + v_boost)::REAL;
END;
$$;

CREATE OR REPLACE FUNCTION public.mp_search_row_matches(
  p_name TEXT,
  p_category TEXT,
  p_subcategory TEXT,
  p_fts tsvector,
  p_tsq tsquery,
  p_norm_query TEXT,
  p_tokens TEXT[],
  p_expanded TEXT[]
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT
    public.normalize_search_text(p_name) = p_norm_query
    OR public.normalize_search_text(p_name) LIKE p_norm_query || '%'
    OR EXISTS (
      SELECT 1 FROM unnest(coalesce(p_tokens, ARRAY[]::TEXT[])) t
      WHERE public.normalize_search_text(p_name) LIKE t || '%'
    )
    OR (p_tsq IS NOT NULL AND p_tsq <> ''::tsquery AND p_fts @@ p_tsq)
    OR public.mp_search_category_boost(p_category, p_subcategory, p_expanded) > 0
    OR public.mp_search_text_matches_any(p_name, p_expanded)
    OR (
      length(p_norm_query) >= 2 AND (
        similarity(public.normalize_search_text(p_name), p_norm_query) > 0.28
        OR word_similarity(p_norm_query, public.normalize_search_text(p_name)) > 0.28
      )
    );
$$;

-- =============================================================================
-- Main search RPC (replaces tsquery-only version)
-- =============================================================================

DROP FUNCTION IF EXISTS public.search_marketplace(TEXT, TEXT, INT, REAL, UUID, UUID[]);

CREATE OR REPLACE FUNCTION public.search_marketplace(
  p_query TEXT,
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
      public.mp_compute_search_rank(
        p.name, v_norm, v_tokens, v_expanded,
        p.mp_search_category_text, p.mp_search_subcategory_text,
        p.fts, v_tsq, p.marketplace_score, p.rating, p.sales_last_30_days, p.created_at
      ) AS rank
    FROM public.products p
    WHERE (p_type IN ('tudo', 'produtos'))
      AND p.is_active = TRUE
      AND p.show_in_marketplace = TRUE
      AND (p_partner_ids IS NULL OR p.partner_id = ANY(p_partner_ids))
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
      public.mp_compute_search_rank(
        s.name, v_norm, v_tokens, v_expanded,
        s.mp_search_category_text, s.mp_search_subcategory_text,
        s.fts, v_tsq, s.marketplace_score, s.rating, s.bookings_last_30_days, s.created_at
      )
    FROM public.services s
    WHERE (p_type IN ('tudo', 'servicos'))
      AND s.is_active = TRUE
      AND s.show_in_marketplace = TRUE
      AND (p_partner_ids IS NULL OR s.partner_id = ANY(p_partner_ids))
      AND public.mp_search_row_matches(
        s.name, s.mp_search_category_text, s.mp_search_subcategory_text,
        s.fts, v_tsq, v_norm, v_tokens, v_expanded
      )

    UNION ALL

    SELECT
      'loja'::TEXT,
      pt.id,
      pt.created_at,
      pt.id AS partner_id,
      public.mp_compute_search_rank(
        pt.store_name, v_norm, v_tokens, v_expanded,
        pt.mp_search_category_text, NULL,
        pt.fts, v_tsq, pt.marketplace_reputation, pt.rating, pt.completed_orders_count, pt.created_at
      )
    FROM public.partners pt
    WHERE (p_type IN ('tudo', 'vitrines'))
      AND pt.is_active = TRUE
      AND (p_partner_ids IS NULL OR pt.id = ANY(p_partner_ids))
      AND public.mp_search_row_matches(
        pt.store_name, pt.mp_search_category_text, NULL,
        pt.fts, v_tsq, v_norm, v_tokens, v_expanded
      )

    UNION ALL

    SELECT
      'plano'::TEXT,
      rp.id,
      rp.created_at,
      rp.partner_id,
      public.mp_compute_search_rank(
        rp.name, v_norm, v_tokens, v_expanded,
        NULL, NULL,
        rp.fts, v_tsq, rp.marketplace_score, 0, rp.signups_last_30_days, rp.created_at
      )
    FROM public.recurring_plans rp
    WHERE (p_type IN ('tudo', 'planos'))
      AND rp.status = 'active'
      AND rp.show_in_marketplace = TRUE
      AND (p_partner_ids IS NULL OR rp.partner_id = ANY(p_partner_ids))
      AND public.mp_search_row_matches(
        rp.name, NULL, NULL,
        rp.fts, v_tsq, v_norm, v_tokens, v_expanded
      )
  ),
  diversified AS (
    SELECT
      c.*,
      row_number() OVER (PARTITION BY c.partner_id ORDER BY c.rank DESC, c.id DESC) AS seller_row
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

-- =============================================================================
-- Autocomplete / prefix search RPC
-- =============================================================================

CREATE OR REPLACE FUNCTION public.marketplace_search_autocomplete(
  p_query TEXT,
  p_type TEXT DEFAULT 'tudo',
  p_limit INT DEFAULT 10,
  p_partner_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  item_type TEXT,
  id UUID,
  label TEXT,
  score REAL
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
  v_norm TEXT;
BEGIN
  v_norm := public.normalize_search_text(p_query);
  IF length(v_norm) < 2 THEN RETURN; END IF;

  RETURN QUERY
  WITH combined AS (
    SELECT
      'produto'::TEXT AS item_type,
      p.id,
      p.name AS label,
      GREATEST(
        CASE WHEN public.normalize_search_text(p.name) LIKE v_norm || '%' THEN 1.0 ELSE 0 END,
        word_similarity(v_norm, public.normalize_search_text(p.name))
      )::REAL AS score
    FROM public.products p
    WHERE (p_type IN ('tudo', 'produtos'))
      AND p.is_active = TRUE AND p.show_in_marketplace = TRUE
      AND (p_partner_ids IS NULL OR p.partner_id = ANY(p_partner_ids))
      AND (
        public.normalize_search_text(p.name) LIKE v_norm || '%'
        OR public.normalize_search_text(p.name) % v_norm
      )

    UNION ALL

    SELECT
      'servico'::TEXT, s.id, s.name,
      GREATEST(
        CASE WHEN public.normalize_search_text(s.name) LIKE v_norm || '%' THEN 1.0 ELSE 0 END,
        word_similarity(v_norm, public.normalize_search_text(s.name))
      )::REAL
    FROM public.services s
    WHERE (p_type IN ('tudo', 'servicos'))
      AND s.is_active = TRUE AND s.show_in_marketplace = TRUE
      AND (p_partner_ids IS NULL OR s.partner_id = ANY(p_partner_ids))
      AND (
        public.normalize_search_text(s.name) LIKE v_norm || '%'
        OR public.normalize_search_text(s.name) % v_norm
      )

    UNION ALL

    SELECT
      'plano'::TEXT, rp.id, rp.name,
      GREATEST(
        CASE WHEN public.normalize_search_text(rp.name) LIKE v_norm || '%' THEN 1.0 ELSE 0 END,
        word_similarity(v_norm, public.normalize_search_text(rp.name))
      )::REAL
    FROM public.recurring_plans rp
    WHERE (p_type IN ('tudo', 'planos'))
      AND rp.status = 'active' AND rp.show_in_marketplace = TRUE
      AND (p_partner_ids IS NULL OR rp.partner_id = ANY(p_partner_ids))
      AND (
        public.normalize_search_text(rp.name) LIKE v_norm || '%'
        OR public.normalize_search_text(rp.name) % v_norm
      )

    UNION ALL

    SELECT
      'loja'::TEXT, pt.id, pt.store_name,
      GREATEST(
        CASE WHEN public.normalize_search_text(pt.store_name) LIKE v_norm || '%' THEN 1.0 ELSE 0 END,
        word_similarity(v_norm, public.normalize_search_text(pt.store_name))
      )::REAL
    FROM public.partners pt
    WHERE (p_type IN ('tudo', 'vitrines'))
      AND pt.is_active = TRUE
      AND (p_partner_ids IS NULL OR pt.id = ANY(p_partner_ids))
      AND (
        public.normalize_search_text(pt.store_name) LIKE v_norm || '%'
        OR public.normalize_search_text(pt.store_name) % v_norm
      )
  )
  SELECT c.item_type, c.id, c.label, c.score
  FROM combined c
  ORDER BY c.score DESC, c.label ASC
  LIMIT greatest(p_limit, 1);
END;
$$;
