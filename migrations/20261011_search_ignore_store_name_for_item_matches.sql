-- ============================================================================
-- Fix: buscar pelo nome do vendedor retornava TODOS os itens dele
--
-- products/services.fts inclui o nome da loja com peso 'D' (ver
-- 20260607_marketplace_search_relevance.sql → build_marketplace_tsvector).
-- Como mp_search_row_matches aceitava qualquer match em p_fts @@ p_tsq, uma
-- busca pelo nome do vendedor fazia TODOS os produtos/serviços dele casarem —
-- mesmo quando o nome do item não tinha relação nenhuma com a busca.
--
-- Agora o ramo FTS de mp_search_row_matches ignora termos com peso 'D'
-- (nome da loja denormalizado): ts_rank com pesos {D=0, C=0.1, B=0.4, A=1.0}
-- só retorna > 0 quando o match atingiu nome/categoria/tags/descrição do
-- próprio item. A loja continua encontrável normalmente: em
-- search_marketplace_fts o branch 'loja' passa st.name como p_name (peso A),
-- que continua casando pelos testes de nome (exato/prefixo/similaridade).
-- ============================================================================

BEGIN;

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
SET search_path = public, extensions, pg_temp
AS $$
  SELECT
    public.normalize_search_text(p_name) = p_norm_query
    OR public.normalize_search_text(p_name) LIKE p_norm_query || '%'
    OR EXISTS (
      SELECT 1 FROM unnest(coalesce(p_tokens, ARRAY[]::TEXT[])) t
      WHERE public.normalize_search_text(p_name) LIKE t || '%'
    )
    OR (
      p_tsq IS NOT NULL AND p_tsq <> ''::tsquery AND p_fts @@ p_tsq
      -- Peso 'D' = nome da loja denormalizado no fts do item. Zeramos D no
      -- cálculo do rank para que produto/serviço só case pelo próprio
      -- conteúdo (nome A, categoria A/B, tags B, descrição C).
      AND coalesce(ts_rank('{0,0.1,0.4,1.0}'::float4[], p_fts, p_tsq), 0) > 0
    )
    OR public.mp_search_category_boost(p_category, p_subcategory, p_expanded) > 0
    OR public.mp_search_text_matches_any(p_name, p_expanded)
    OR (
      length(p_norm_query) >= 2 AND (
        similarity(public.normalize_search_text(p_name), p_norm_query) > 0.28
        OR word_similarity(p_norm_query, public.normalize_search_text(p_name)) > 0.28
      )
    );
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
