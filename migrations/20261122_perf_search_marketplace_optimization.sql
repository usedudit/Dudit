-- ============================================================================
-- Migration: 20261122_perf_search_marketplace_optimization.sql
--
-- Objetivo (Etapa 3 - Performance da Busca do Marketplace):
--   1. Eliminar ~40-60 chamadas repetidas de `normalize_search_text(...)`
--      (unaccent + regexp_replace + lower + trim) POR LINHA dentro de
--      `mp_search_text_matches_any`, `mp_search_category_boost`,
--      `mp_search_row_matches` e `mp_compute_search_rank`.
--   2. Usar `position(needle IN haystack) > 0` (em vez de `LIKE '%' || n || '%'`)
--      e retorno antecipado (short-circuit) para que matches exatos/prefixo/FTS
--      nem precisem calcular `similarity()` / `word_similarity()`.
--   3. Criar os índices parciais GIN trigram que faltavam em `products`,
--      `services` e `recurring_plans` (espelhando o padrão já usado em `stores`).
--   4. Garantir `SET search_path` seguro em `search_marketplace_fts`.
--
-- Garantia: retorna 100% os mesmos itens e o mesmo `rank` de antes.
-- Migration idempotente e segura para rodar em produção.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ÍNDICES PARCIAIS GIN TRIGRAM FALTANTES (mesmo padrão de `stores`)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_products_search_name_trgm
  ON public.products USING gin (public.normalize_search_text(name) gin_trgm_ops)
  WHERE (is_active = true AND show_in_marketplace = true);

CREATE INDEX IF NOT EXISTS idx_products_search_category_trgm
  ON public.products USING gin (
    public.normalize_search_text(
      COALESCE(mp_search_category_text, ''::text) || ' '::text || COALESCE(mp_search_subcategory_text, ''::text)
    ) gin_trgm_ops
  )
  WHERE (is_active = true AND show_in_marketplace = true);

CREATE INDEX IF NOT EXISTS idx_services_search_name_trgm
  ON public.services USING gin (public.normalize_search_text(name) gin_trgm_ops)
  WHERE (is_active = true AND show_in_marketplace = true);

CREATE INDEX IF NOT EXISTS idx_recurring_plans_search_name_trgm
  ON public.recurring_plans USING gin (public.normalize_search_text(name) gin_trgm_ops)
  WHERE (status = 'active'::text AND show_in_marketplace = true);

-- ============================================================================
-- 2. `mp_search_text_matches_any`: normaliza `haystack` UMA única vez e usa
--    `position()` em loop com retorno imediato no primeiro match
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mp_search_text_matches_any(haystack text, needles text[])
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_hay TEXT;
  v_n TEXT;
BEGIN
  IF haystack IS NULL OR needles IS NULL OR cardinality(needles) = 0 THEN
    RETURN FALSE;
  END IF;

  v_hay := public.normalize_search_text(haystack);
  IF v_hay = '' THEN
    RETURN FALSE;
  END IF;

  FOREACH v_n IN ARRAY needles LOOP
    IF v_n IS NOT NULL AND v_n <> '' AND position(v_n IN v_hay) > 0 THEN
      RETURN TRUE;
    END IF;
  END LOOP;

  RETURN FALSE;
END;
$function$;

-- ============================================================================
-- 3. `mp_search_category_boost`: normaliza categoria e subcategoria UMA vez
--    em vez de re-normalizar para cada termo expandido
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mp_search_category_boost(p_category text, p_subcategory text, p_expanded text[])
 RETURNS real
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_cat TEXT;
  v_sub TEXT;
  v_both TEXT;
  v_n TEXT;
BEGIN
  IF (p_category IS NULL AND p_subcategory IS NULL) OR p_expanded IS NULL OR cardinality(p_expanded) = 0 THEN
    RETURN 0;
  END IF;

  v_cat := public.normalize_search_text(coalesce(p_category, ''));
  v_sub := public.normalize_search_text(coalesce(p_subcategory, ''));

  IF (v_cat <> '' AND v_cat = ANY(p_expanded)) OR (v_sub <> '' AND v_sub = ANY(p_expanded)) THEN
    RETURN 0.55;
  END IF;

  v_both := trim(v_cat || ' ' || v_sub);
  IF v_both = '' THEN
    RETURN 0;
  END IF;

  FOREACH v_n IN ARRAY p_expanded LOOP
    IF v_n IS NOT NULL AND v_n <> '' AND position(v_n IN v_both) > 0 THEN
      RETURN 0.45;
    END IF;
  END LOOP;

  RETURN 0;
END;
$function$;

-- ============================================================================
-- 4. `mp_search_row_matches`: calcula `v_name` UMA única vez com short-circuit
--    (exact -> prefix -> token prefix -> FTS -> category -> synonyms -> fuzzy)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mp_search_row_matches(
  p_name text,
  p_category text,
  p_subcategory text,
  p_fts tsvector,
  p_tsq tsquery,
  p_norm_query text,
  p_tokens text[],
  p_expanded text[]
)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_name TEXT := public.normalize_search_text(p_name);
  v_t TEXT;
  v_n TEXT;
BEGIN
  -- 1. Exact / prefix match on normalized name (mais barato)
  IF v_name = p_norm_query OR starts_with(v_name, p_norm_query) THEN
    RETURN TRUE;
  END IF;

  -- 2. Token prefix match
  IF p_tokens IS NOT NULL THEN
    FOREACH v_t IN ARRAY p_tokens LOOP
      IF v_t IS NOT NULL AND v_t <> '' AND starts_with(v_name, v_t) THEN
        RETURN TRUE;
      END IF;
    END LOOP;
  END IF;

  -- 3. FTS match (ignora peso D = nome da loja denormalizado)
  IF p_tsq IS NOT NULL AND p_tsq <> ''::tsquery AND p_fts @@ p_tsq THEN
    IF coalesce(ts_rank('{0,0.1,0.4,1.0}'::float4[], p_fts, p_tsq), 0) > 0 THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- 4. Category / subcategory match
  IF public.mp_search_category_boost(p_category, p_subcategory, p_expanded) > 0 THEN
    RETURN TRUE;
  END IF;

  -- 5. Expanded synonym substring match (reusa v_name já normalizado!)
  IF v_name <> '' AND p_expanded IS NOT NULL THEN
    FOREACH v_n IN ARRAY p_expanded LOOP
      IF v_n IS NOT NULL AND v_n <> '' AND position(v_n IN v_name) > 0 THEN
        RETURN TRUE;
      END IF;
    END LOOP;
  END IF;

  -- 6. Fuzzy trigram fallback (só executa se nada acima casou)
  IF length(p_norm_query) >= 2 THEN
    IF similarity(v_name, p_norm_query) > 0.28
       OR word_similarity(p_norm_query, v_name) > 0.28 THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$function$;

-- ============================================================================
-- 5. `mp_compute_search_rank`: evita re-normalizar `v_name` nos sinônimos
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
    v_fts := LEAST(ts_rank_cd(p_fts, p_tsq, 32)::REAL, 1.0) * 0.72;
  END IF;

  v_category := public.mp_search_category_boost(p_category, p_subcategory, p_expanded);

  -- Reusa v_name já normalizado em vez de chamar mp_search_text_matches_any
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
-- 6. Garantir `search_path` fixo em `search_marketplace_fts` (segurança)
-- ============================================================================

ALTER FUNCTION public.search_marketplace_fts(
  text, text, integer, real, uuid, uuid[], uuid[]
) SET search_path TO 'public', 'extensions', 'pg_temp';

COMMIT;
