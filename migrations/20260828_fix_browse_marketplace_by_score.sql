-- Migration: Fix browse_marketplace_by_score return type matching
-- Date: 2026-08-28
-- Description:
-- 1. Drops any conflicting overloaded signatures of public.browse_marketplace_by_score.
-- 2. Explicitly casts all score calculations to ::REAL to match RETURNS TABLE (score REAL).
-- 3. Ensures both p_partner_ids and p_store_ids are handled gracefully.

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
