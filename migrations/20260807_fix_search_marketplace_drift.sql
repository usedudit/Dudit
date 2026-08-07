-- Fase 1: alinhar search_marketplace ao contrato atualmente usado pelo app.
--
-- A funcao historica referenciava partners.risk_score, removido pela
-- migracao 20260729_clean_partners_schema.sql. A implementacao canonica
-- vigente e search_marketplace_fts, que usa stores.risk_score.
-- Mantemos search_marketplace como alias compativel para evitar dois corpos
-- de ranking divergentes.

BEGIN;

DROP FUNCTION IF EXISTS public.search_marketplace(
  TEXT, TEXT, INT, REAL, UUID, UUID[]
);

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
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions, pg_temp
AS $function$
  SELECT *
  FROM public.search_marketplace_fts(
    p_query,
    p_type,
    p_limit,
    p_cursor_rank,
    p_cursor_id,
    p_partner_ids,
    p_store_ids
  );
$function$;

COMMENT ON FUNCTION public.search_marketplace(
  TEXT, TEXT, INT, REAL, UUID, UUID[], UUID[]
) IS 'Compatibility wrapper for the canonical marketplace FTS search function.';

NOTIFY pgrst, 'reload schema';

COMMIT;
