-- ============================================================================
-- Migration: 20261126_search_scale_and_quality_upgrade.sql
--
-- Objetivo (Busca do Marketplace pronta para escala):
--   1. Destravar os índices GIN (`idx_products_fts`, `idx_products_search_name_trgm`,
--      `idx_products_search_category_trgm`, `idx_services_fts`, etc.) dentro de
--      `search_marketplace_fts` com pré-filtros indexáveis (BitmapOr Index Scan),
--      eliminando Sequential Scan quando o catálogo crescer para 10k-100k+ itens.
--   2. Incluir `brand` (`products.brand` / `brands.name`) e variações ativas
--      (`product_variants`) no `products.fts`, além de `technical_specs` e
--      `services.technical_details`, com triggers automáticos.
--   3. Adicionar prefix match (`:*`) nos tokens digitados pelo usuário em
--      `build_marketplace_search_context` para encontrar palavras parciais em
--      tags, especificações, marcas e descrições usando o próprio índice GIN.
--   4. Adicionar parâmetro opcional `p_extra_store_terms TEXT[]` em
--      `search_marketplace_fts` para trazer vitrines relacionadas (ex: "pneu" ->
--      borracharia/autocenter) na MESMA query, eliminando até 8 RPCs extras.
--   5. Corrigir `marketplace_search_autocomplete` para respeitar suspensão de
--      vitrine (`mp_is_showcase_suspended`), risco (`mp_store_risk_is_hidden`)
--      e `services.deleted_at IS NULL`.
--   6. Corrigir `services.deleted_at IS NULL`, `p_store_ids` no branch `loja`
--      e zerar peso 'D' no `ts_rank_cd` de `mp_compute_search_rank`.
--
-- Totalmente idempotente e segura para rodar em produção (independente ou após
-- 20261126_search_index_specifications.sql).
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Índices parciais GIN trigram complementares (espelhando products/stores)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_services_search_category_trgm
  ON public.services USING gin (
    public.normalize_search_text(
      COALESCE(mp_search_category_text, ''::text) || ' '::text || COALESCE(mp_search_subcategory_text, ''::text)
    ) gin_trgm_ops
  )
  WHERE (is_active = true AND show_in_marketplace = true AND deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_stores_search_name_trgm
  ON public.stores USING gin (public.normalize_search_text(name) gin_trgm_ops)
  WHERE (is_active = true);

-- ============================================================================
-- 2. Extrator de texto de variações ativas de produto (`product_variants`)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.extract_product_variants_text(p_product_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_result TEXT;
BEGIN
  IF p_product_id IS NULL THEN
    RETURN '';
  END IF;

  SELECT string_agg(part, ' ')
  INTO v_result
  FROM (
    SELECT trim(concat_ws(
      ' ',
      NULLIF(trim(coalesce(pv.variant_name, '')), ''),
      NULLIF(trim(coalesce(pv.variant_value, '')), ''),
      NULLIF(trim(coalesce(pv.sku, '')), ''),
      CASE
        WHEN pv.variant_options IS NOT NULL AND jsonb_typeof(pv.variant_options) = 'object' THEN (
          SELECT string_agg(trim(kv.value #>> '{}'), ' ')
          FROM jsonb_each(pv.variant_options) AS kv(key, value)
          WHERE kv.key NOT IN ('image', 'image_url', 'images', 'sku', 'price', 'stock', 'id', 'color_hex', 'hex')
            AND jsonb_typeof(kv.value) IN ('string', 'number')
            AND trim(kv.value #>> '{}') <> ''
        )
        ELSE NULL
      END
    )) AS part
    FROM public.product_variants pv
    WHERE pv.product_id = p_product_id
      AND COALESCE(pv.is_active, TRUE) = TRUE
  ) sub
  WHERE part IS NOT NULL AND part <> '';

  RETURN COALESCE(v_result, '');
END;
$function$;

-- ============================================================================
-- 3. Atualizar `refresh_product_marketplace_fts` para incluir marca + specs +
--    variações ativas (peso 'B' via `p_specs`) e triggers correspondentes
-- ============================================================================

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
        p2.sku,
        NULLIF(trim(concat_ws(
          ' ',
          NULLIF(trim(COALESCE(br.name, '')), ''),
          CASE
            WHEN NULLIF(trim(COALESCE(p2.brand, '')), '') IS DISTINCT FROM NULLIF(trim(COALESCE(br.name, '')), '')
            THEN NULLIF(trim(COALESCE(p2.brand, '')), '')
            ELSE NULL
          END,
          NULLIF(public.extract_marketplace_specs_text(p2.technical_specs), ''),
          NULLIF(public.extract_product_variants_text(p2.id), '')
        )), '')
      ) AS fts
    FROM public.products p2
    LEFT JOIN public.stores st ON st.id = COALESCE(
      p2.store_id,
      (SELECT s.id FROM public.stores s WHERE s.partner_id = p2.partner_id LIMIT 1)
    )
    LEFT JOIN public.brands br ON br.id = p2.brand_id
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
    name, description, sku, tags, brand, brand_id, technical_specs, marketplace_category_id, partner_id, store_id
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_products_marketplace_fts();

CREATE OR REPLACE FUNCTION public.trg_product_variants_refresh_fts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_product_id UUID;
BEGIN
  v_product_id := COALESCE(NEW.product_id, OLD.product_id);
  IF v_product_id IS NOT NULL THEN
    PERFORM public.refresh_product_marketplace_fts(v_product_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_product_variants_refresh_fts ON public.product_variants;
CREATE TRIGGER trg_product_variants_refresh_fts
  AFTER INSERT OR UPDATE OF variant_name, variant_value, variant_options, sku, is_active OR DELETE
  ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_product_variants_refresh_fts();

CREATE OR REPLACE FUNCTION public.trg_brands_refresh_product_fts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.name IS DISTINCT FROM OLD.name THEN
    PERFORM public.refresh_product_marketplace_fts(p.id)
    FROM public.products p
    WHERE p.brand_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_brands_refresh_product_fts ON public.brands;
CREATE TRIGGER trg_brands_refresh_product_fts
  AFTER UPDATE OF name ON public.brands
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_brands_refresh_product_fts();

-- ============================================================================
-- 4. Prefix match (`:*`) em `build_marketplace_search_context`
--    Tokens digitados pelo usuário (>= 2 chars) usam `:*` para casar prefixos
--    em nome, tags, marcas, variações, especificações e descrição via GIN.
-- ============================================================================

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
    -- Tokens digitados pelo usuário: aplica prefixo `:*` quando >= 2 chars alfanuméricos
    SELECT
      input.token,
      input.ordinality,
      CASE
        WHEN length(input.token) >= 2 AND input.token ~ '^[a-z0-9]+$'
          THEN input.token || ':*'
        ELSE input.token
      END AS term_expr
    FROM input_tokens input

    UNION

    -- Sinônimos expandidos: match exato/stemmed (sem :* para evitar falsos positivos)
    SELECT
      input.token,
      input.ordinality,
      replace(group_term.term, ' ', ' & ') AS term_expr
    FROM input_tokens input
    JOIN group_terms group_term
      ON group_term.token = input.token
  ),
  tsquery_clauses AS (
    SELECT
      token,
      ordinality,
      '(' || string_agg(term_expr, ' | ' ORDER BY term_expr) || ')' AS clause
    FROM tsquery_terms
    WHERE coalesce(term_expr, '') <> ''
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

-- ============================================================================
-- 5. `mp_compute_search_rank`: zera peso 'D' no `ts_rank_cd` (consistente com
--    `mp_search_row_matches`, evitando boost artificial pelo nome da loja em itens)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mp_compute_search_rank(
  p_name text,
  p_norm_query text,
  p_tokens text[],
  p_expanded text[],
  p_category text,
  p_subcategory text,
  p_fts tsvector,
  p_tsq tsquery,
  p_marketplace_score numeric,
  p_rating numeric,
  p_sales_30d integer,
  p_created_at timestamp with time zone
)
 RETURNS real
 LANGUAGE plpgsql
 STABLE PARALLEL SAFE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
  v_n TEXT;
  v_core REAL;
BEGIN
  IF v_name = p_norm_query THEN
    v_exact := 1.0;
  END IF;

  IF starts_with(v_name, p_norm_query) THEN
    v_prefix := GREATEST(v_prefix, 0.88);
  END IF;

  IF p_tokens IS NOT NULL THEN
    FOREACH v_token IN ARRAY p_tokens LOOP
      IF v_token IS NOT NULL AND v_token <> ''
         AND (starts_with(v_name, v_token) OR position(' ' || v_token IN v_name) > 0) THEN
        v_prefix := GREATEST(v_prefix, 0.82);
      END IF;
    END LOOP;
  END IF;

  IF p_tsq IS NOT NULL AND p_tsq <> ''::tsquery AND p_fts @@ p_tsq THEN
    v_fts := LEAST(ts_rank_cd('{0,0.1,0.4,1.0}'::float4[], p_fts, p_tsq, 32)::REAL, 1.0) * 0.72;
  END IF;

  v_category := public.mp_search_category_boost(p_category, p_subcategory, p_expanded);

  IF v_name <> '' AND p_expanded IS NOT NULL THEN
    FOREACH v_n IN ARRAY p_expanded LOOP
      IF v_n IS NOT NULL AND v_n <> '' AND position(v_n IN v_name) > 0 THEN
        v_synonym := 0.38;
        EXIT;
      END IF;
    END LOOP;
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
$function$;

-- ============================================================================
-- 6. `search_marketplace_fts`:
--    - Pré-filtros indexáveis (destrava GIN tsvector + GIN pg_trgm!)
--    - Suporte a `p_extra_store_terms TEXT[] DEFAULT NULL` (elimina fan-out)
--    - `s.deleted_at IS NULL` em services
--    - `p_store_ids` também aplicado no branch `loja`
--    (Drop da assinatura antiga de 7 args para evitar ambiguidade de overload)
-- ============================================================================

DROP FUNCTION IF EXISTS public.search_marketplace_fts(TEXT, TEXT, INT, REAL, UUID, UUID[], UUID[]);

CREATE OR REPLACE FUNCTION public.search_marketplace_fts(
  p_query TEXT,
  p_type TEXT DEFAULT 'tudo',
  p_limit INT DEFAULT 20,
  p_cursor_rank REAL DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL,
  p_partner_ids UUID[] DEFAULT NULL,
  p_store_ids UUID[] DEFAULT NULL,
  p_extra_store_terms TEXT[] DEFAULT NULL
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
  v_expanded_like TEXT[];
  v_token_prefix_like TEXT[];
  v_tsq TSQUERY;
  v_extra_norm TEXT[];
  v_extra_like TEXT[];
  v_extra_tsq TSQUERY;
BEGIN
  v_norm := public.normalize_search_text(p_query);
  IF v_norm = '' THEN RETURN; END IF;

  v_tokens := regexp_split_to_array(v_norm, '\s+');

  SELECT context.expanded_terms, context.tsq
  INTO v_expanded, v_tsq
  FROM public.build_marketplace_search_context(p_query) AS context;

  -- Padrões LIKE para pré-filtro indexável via GIN pg_trgm
  SELECT array_agg('%' || t || '%')
  INTO v_expanded_like
  FROM unnest(coalesce(v_expanded, ARRAY[]::TEXT[])) AS t
  WHERE t IS NOT NULL AND length(t) >= 2;

  SELECT array_agg(t || '%')
  INTO v_token_prefix_like
  FROM unnest(coalesce(v_tokens, ARRAY[]::TEXT[])) AS t
  WHERE t IS NOT NULL AND t <> '';

  -- Termos extras de vitrines relacionadas (ex: "pneu" -> borracharia, auto center...)
  IF p_extra_store_terms IS NOT NULL AND cardinality(p_extra_store_terms) > 0 THEN
    SELECT array_agg(DISTINCT n)
    INTO v_extra_norm
    FROM (
      SELECT public.normalize_search_text(raw_t) AS n
      FROM unnest(p_extra_store_terms) AS raw_t
    ) s
    WHERE n IS NOT NULL AND length(n) >= 2;

    IF v_extra_norm IS NOT NULL AND cardinality(v_extra_norm) > 0 THEN
      SELECT array_agg('%' || n || '%')
      INTO v_extra_like
      FROM unnest(v_extra_norm) AS n;

      BEGIN
        SELECT to_tsquery(
          'portuguese',
          string_agg('(' || replace(n, ' ', ' & ') || ')', ' | ')
        )
        INTO v_extra_tsq
        FROM unnest(v_extra_norm) AS n;
      EXCEPTION WHEN OTHERS THEN
        v_extra_tsq := NULL;
      END;
    END IF;
  END IF;

  RETURN QUERY
  WITH combined AS (
    -- ── PRODUTOS ────────────────────────────────────────────────────────────
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
      -- Pré-filtro indexável (GIN fts + GIN pg_trgm em name e category)
      AND (
        (v_tsq IS NOT NULL AND p.fts @@ v_tsq)
        OR public.normalize_search_text(p.name) LIKE v_norm || '%'
        OR (v_token_prefix_like IS NOT NULL AND public.normalize_search_text(p.name) LIKE ANY(v_token_prefix_like))
        OR (length(v_norm) >= 2 AND (
          public.normalize_search_text(p.name) % v_norm
          OR v_norm <% public.normalize_search_text(p.name)
        ))
        OR (v_expanded_like IS NOT NULL AND (
          public.normalize_search_text(p.name) LIKE ANY(v_expanded_like)
          OR public.normalize_search_text(
            COALESCE(p.mp_search_category_text, ''::text) || ' '::text || COALESCE(p.mp_search_subcategory_text, ''::text)
          ) LIKE ANY(v_expanded_like)
        ))
      )
      AND public.mp_search_row_matches(
        p.name, p.mp_search_category_text, p.mp_search_subcategory_text,
        p.fts, v_tsq, v_norm, v_tokens, v_expanded
      )

    UNION ALL

    -- ── SERVIÇOS ────────────────────────────────────────────────────────────
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
      AND s.deleted_at IS NULL
      AND s.show_in_marketplace = TRUE
      AND NOT public.mp_is_showcase_suspended(st.showcase_suspended_at, st.showcase_suspended_until, pt.showcase_suspended_at, pt.showcase_suspended_until)
      AND NOT public.mp_store_risk_is_hidden(st.risk_score)
      AND (p_partner_ids IS NULL OR s.partner_id = ANY(p_partner_ids))
      AND (p_store_ids IS NULL OR (s.store_id IS NOT NULL AND s.store_id = ANY(p_store_ids)))
      -- Pré-filtro indexável (GIN fts + GIN pg_trgm em name e category)
      AND (
        (v_tsq IS NOT NULL AND s.fts @@ v_tsq)
        OR public.normalize_search_text(s.name) LIKE v_norm || '%'
        OR (v_token_prefix_like IS NOT NULL AND public.normalize_search_text(s.name) LIKE ANY(v_token_prefix_like))
        OR (length(v_norm) >= 2 AND (
          public.normalize_search_text(s.name) % v_norm
          OR v_norm <% public.normalize_search_text(s.name)
        ))
        OR (v_expanded_like IS NOT NULL AND (
          public.normalize_search_text(s.name) LIKE ANY(v_expanded_like)
          OR public.normalize_search_text(
            COALESCE(s.mp_search_category_text, ''::text) || ' '::text || COALESCE(s.mp_search_subcategory_text, ''::text)
          ) LIKE ANY(v_expanded_like)
        ))
      )
      AND public.mp_search_row_matches(
        s.name, s.mp_search_category_text, s.mp_search_subcategory_text,
        s.fts, v_tsq, v_norm, v_tokens, v_expanded
      )

    UNION ALL

    -- ── LOJAS / VITRINES ────────────────────────────────────────────────────
    SELECT
      'loja'::TEXT,
      st.id,
      st.created_at,
      st.partner_id,
      st.id AS store_id,
      (
        CASE
          WHEN public.mp_search_row_matches(
            st.name, pt.mp_search_category_text, NULL,
            st.fts, v_tsq, v_norm, v_tokens, v_expanded
          ) THEN
            public.mp_compute_search_rank(
              st.name, v_norm, v_tokens, v_expanded,
              pt.mp_search_category_text, NULL,
              st.fts, v_tsq, st.marketplace_reputation, st.rating, st.completed_orders_count, st.created_at
            )
          ELSE
            -- Match via termo relacionado (ex: "pneu" -> borracharia): rank levemente menor que match direto
            (
              0.42
              + LEAST(COALESCE(st.marketplace_reputation, 0), 1)::REAL * 0.06
              + LEAST(COALESCE(st.rating, 0), 5)::REAL / 5.0 * 0.04
            )::REAL
        END
      ) * public.mp_store_risk_rank_multiplier(st.risk_score)
    FROM public.stores st
    JOIN public.partners pt ON pt.id = st.partner_id
    WHERE (p_type IN ('tudo', 'vitrines'))
      AND st.is_active = TRUE
      AND NOT public.mp_is_showcase_suspended(st.showcase_suspended_at, st.showcase_suspended_until, pt.showcase_suspended_at, pt.showcase_suspended_until)
      AND NOT public.mp_store_risk_is_hidden(st.risk_score)
      AND (p_partner_ids IS NULL OR st.partner_id = ANY(p_partner_ids))
      AND (p_store_ids IS NULL OR st.id = ANY(p_store_ids))
      AND (
        (
          (
            (v_tsq IS NOT NULL AND st.fts @@ v_tsq)
            OR public.normalize_search_text(st.name) LIKE v_norm || '%'
            OR (v_token_prefix_like IS NOT NULL AND public.normalize_search_text(st.name) LIKE ANY(v_token_prefix_like))
            OR (length(v_norm) >= 2 AND (
              public.normalize_search_text(st.name) % v_norm
              OR v_norm <% public.normalize_search_text(st.name)
            ))
            OR (v_expanded_like IS NOT NULL AND (
              public.normalize_search_text(st.name) LIKE ANY(v_expanded_like)
              OR public.normalize_search_text(COALESCE(pt.mp_search_category_text, '')) LIKE ANY(v_expanded_like)
            ))
          )
          AND public.mp_search_row_matches(
            st.name, pt.mp_search_category_text, NULL,
            st.fts, v_tsq, v_norm, v_tokens, v_expanded
          )
        )
        OR (
          v_extra_norm IS NOT NULL AND (
            (v_extra_tsq IS NOT NULL AND st.fts @@ v_extra_tsq)
            OR (v_extra_like IS NOT NULL AND (
              public.normalize_search_text(st.name) LIKE ANY(v_extra_like)
              OR public.normalize_search_text(COALESCE(pt.mp_search_category_text, '')) LIKE ANY(v_extra_like)
            ))
          )
        )
      )

    UNION ALL

    -- ── PLANOS RECORRENTES ──────────────────────────────────────────────────
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
      AND (
        (v_tsq IS NOT NULL AND rp.fts @@ v_tsq)
        OR public.normalize_search_text(rp.name) LIKE v_norm || '%'
        OR (v_token_prefix_like IS NOT NULL AND public.normalize_search_text(rp.name) LIKE ANY(v_token_prefix_like))
        OR (length(v_norm) >= 2 AND (
          public.normalize_search_text(rp.name) % v_norm
          OR v_norm <% public.normalize_search_text(rp.name)
        ))
        OR (v_expanded_like IS NOT NULL AND public.normalize_search_text(rp.name) LIKE ANY(v_expanded_like))
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

-- ============================================================================
-- 7. `marketplace_search_autocomplete`: filtrar suspensão, risco e deleted_at
-- ============================================================================

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
SET search_path = public, extensions, pg_temp
AS $function$
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
    JOIN public.partners pt ON pt.id = p.partner_id
    LEFT JOIN public.stores st ON st.id = p.store_id
    WHERE (p_type IN ('tudo', 'produtos'))
      AND p.is_active = TRUE
      AND p.show_in_marketplace = TRUE
      AND NOT public.mp_is_showcase_suspended(st.showcase_suspended_at, st.showcase_suspended_until, pt.showcase_suspended_at, pt.showcase_suspended_until)
      AND NOT public.mp_store_risk_is_hidden(st.risk_score)
      AND (p_partner_ids IS NULL OR p.partner_id = ANY(p_partner_ids))
      AND (
        public.normalize_search_text(p.name) LIKE v_norm || '%'
        OR public.normalize_search_text(p.name) % v_norm
      )

    UNION ALL

    SELECT
      'servico'::TEXT,
      s.id,
      s.name,
      GREATEST(
        CASE WHEN public.normalize_search_text(s.name) LIKE v_norm || '%' THEN 1.0 ELSE 0 END,
        word_similarity(v_norm, public.normalize_search_text(s.name))
      )::REAL
    FROM public.services s
    JOIN public.partners pt ON pt.id = s.partner_id
    LEFT JOIN public.stores st ON st.id = s.store_id
    WHERE (p_type IN ('tudo', 'servicos'))
      AND s.is_active = TRUE
      AND s.deleted_at IS NULL
      AND s.show_in_marketplace = TRUE
      AND NOT public.mp_is_showcase_suspended(st.showcase_suspended_at, st.showcase_suspended_until, pt.showcase_suspended_at, pt.showcase_suspended_until)
      AND NOT public.mp_store_risk_is_hidden(st.risk_score)
      AND (p_partner_ids IS NULL OR s.partner_id = ANY(p_partner_ids))
      AND (
        public.normalize_search_text(s.name) LIKE v_norm || '%'
        OR public.normalize_search_text(s.name) % v_norm
      )

    UNION ALL

    SELECT
      'plano'::TEXT,
      rp.id,
      rp.name,
      GREATEST(
        CASE WHEN public.normalize_search_text(rp.name) LIKE v_norm || '%' THEN 1.0 ELSE 0 END,
        word_similarity(v_norm, public.normalize_search_text(rp.name))
      )::REAL
    FROM public.recurring_plans rp
    JOIN public.partners pt ON pt.id = rp.partner_id
    LEFT JOIN public.stores st ON st.id = rp.store_id
    WHERE (p_type IN ('tudo', 'planos'))
      AND rp.status = 'active'
      AND rp.show_in_marketplace = TRUE
      AND NOT public.mp_is_showcase_suspended(st.showcase_suspended_at, st.showcase_suspended_until, pt.showcase_suspended_at, pt.showcase_suspended_until)
      AND NOT public.mp_store_risk_is_hidden(st.risk_score)
      AND (p_partner_ids IS NULL OR rp.partner_id = ANY(p_partner_ids))
      AND (
        public.normalize_search_text(rp.name) LIKE v_norm || '%'
        OR public.normalize_search_text(rp.name) % v_norm
      )

    UNION ALL

    SELECT
      'loja'::TEXT,
      st.id,
      st.name AS label,
      GREATEST(
        CASE WHEN public.normalize_search_text(st.name) LIKE v_norm || '%' THEN 1.0 ELSE 0 END,
        word_similarity(v_norm, public.normalize_search_text(st.name))
      )::REAL
    FROM public.stores st
    JOIN public.partners pt ON pt.id = st.partner_id
    WHERE (p_type IN ('tudo', 'vitrines'))
      AND st.is_active = TRUE
      AND NOT public.mp_is_showcase_suspended(st.showcase_suspended_at, st.showcase_suspended_until, pt.showcase_suspended_at, pt.showcase_suspended_until)
      AND NOT public.mp_store_risk_is_hidden(st.risk_score)
      AND (p_partner_ids IS NULL OR st.partner_id = ANY(p_partner_ids))
      AND (
        public.normalize_search_text(st.name) LIKE v_norm || '%'
        OR public.normalize_search_text(st.name) % v_norm
      )
  )
  SELECT c.item_type, c.id, c.label, c.score
  FROM combined c
  ORDER BY c.score DESC, c.label ASC
  LIMIT greatest(p_limit, 1);
END;
$function$;

-- ============================================================================
-- 8. Backfill cirúrgico: reindexa produtos que possuem marca ou variações ativas
-- ============================================================================

DO $$
DECLARE
  v_id UUID;
BEGIN
  FOR v_id IN
    SELECT DISTINCT p.id
    FROM public.products p
    LEFT JOIN public.product_variants pv
      ON pv.product_id = p.id AND COALESCE(pv.is_active, TRUE) = TRUE
    WHERE NULLIF(trim(COALESCE(p.brand, '')), '') IS NOT NULL
       OR p.brand_id IS NOT NULL
       OR pv.id IS NOT NULL
  LOOP
    PERFORM public.refresh_product_marketplace_fts(v_id);
  END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
