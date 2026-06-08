-- Extend search_marketplace RPC with blended relevance + popularity ranking
-- 70% FTS relevance, 10% popularity, 10% freshness, 5% seller reputation, 5% rating

CREATE OR REPLACE FUNCTION public.search_marketplace(
  p_tsquery TEXT,
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
  v_tsq tsquery;
BEGIN
  IF coalesce(trim(p_tsquery), '') = '' THEN
    RETURN;
  END IF;

  BEGIN
    v_tsq := to_tsquery('portuguese', p_tsquery);
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;

  IF v_tsq IS NULL OR v_tsq = ''::tsquery THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH combined AS (
    SELECT
      'produto'::TEXT AS item_type,
      p.id,
      ts_rank_cd(p.fts, v_tsq, 32)::REAL AS fts_rank,
      p.created_at,
      p.marketplace_score,
      p.rating,
      ptr.marketplace_reputation,
      public.mp_freshness_factor(p.created_at) AS freshness
    FROM public.products p
    INNER JOIN public.partners ptr ON ptr.id = p.partner_id
    WHERE (p_type IN ('tudo', 'produtos'))
      AND p.is_active = true
      AND p.show_in_marketplace = true
      AND p.fts @@ v_tsq
      AND (p_partner_ids IS NULL OR p.partner_id = ANY(p_partner_ids))

    UNION ALL

    SELECT
      'servico'::TEXT,
      s.id,
      ts_rank_cd(s.fts, v_tsq, 32)::REAL,
      s.created_at,
      s.marketplace_score,
      s.rating,
      ptr.marketplace_reputation,
      public.mp_freshness_factor(s.created_at)
    FROM public.services s
    INNER JOIN public.partners ptr ON ptr.id = s.partner_id
    WHERE (p_type IN ('tudo', 'servicos'))
      AND s.is_active = true
      AND s.show_in_marketplace = true
      AND s.fts @@ v_tsq
      AND (p_partner_ids IS NULL OR s.partner_id = ANY(p_partner_ids))

    UNION ALL

    SELECT
      'loja'::TEXT,
      pt.id,
      ts_rank_cd(pt.fts, v_tsq, 32)::REAL,
      pt.created_at,
      pt.marketplace_reputation,
      pt.rating,
      pt.marketplace_reputation,
      public.mp_freshness_factor(pt.created_at)
    FROM public.partners pt
    WHERE (p_type IN ('tudo', 'vitrines'))
      AND pt.is_active = true
      AND pt.fts @@ v_tsq
      AND (p_partner_ids IS NULL OR pt.id = ANY(p_partner_ids))

    UNION ALL

    SELECT
      'plano'::TEXT,
      rp.id,
      ts_rank_cd(rp.fts, v_tsq, 32)::REAL,
      rp.created_at,
      rp.marketplace_score,
      0::numeric,
      ptr.marketplace_reputation,
      public.mp_freshness_factor(rp.created_at)
    FROM public.recurring_plans rp
    INNER JOIN public.partners ptr ON ptr.id = rp.partner_id
    WHERE (p_type IN ('tudo', 'planos'))
      AND rp.status = 'active'
      AND rp.show_in_marketplace = true
      AND rp.fts @@ v_tsq
      AND (p_partner_ids IS NULL OR rp.partner_id = ANY(p_partner_ids))
  ),
  scored AS (
    SELECT
      c.item_type,
      c.id,
      c.created_at,
      (
        0.70 * c.fts_rank +
        0.10 * LEAST(coalesce(c.marketplace_score, 0), 1)::real +
        0.10 * LEAST(coalesce(c.freshness, 1), 1.25)::real / 1.25 +
        0.05 * LEAST(coalesce(c.marketplace_reputation, 0), 1)::real +
        0.05 * LEAST(coalesce(c.rating, 0), 5)::real / 5.0
      )::REAL AS rank
    FROM combined c
  )
  SELECT s.item_type, s.id, s.rank, s.created_at
  FROM scored s
  WHERE
    p_cursor_rank IS NULL
    OR p_cursor_id IS NULL
    OR (s.rank < p_cursor_rank OR (s.rank = p_cursor_rank AND s.id < p_cursor_id))
  ORDER BY s.rank DESC, s.id DESC
  LIMIT greatest(p_limit, 1);
END;
$$;

-- Browse-by-score RPC for category/homepage (no FTS)
CREATE OR REPLACE FUNCTION public.browse_marketplace_by_score(
  p_type TEXT DEFAULT 'produtos',
  p_limit INT DEFAULT 20,
  p_cursor_score REAL DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL,
  p_partner_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  item_type TEXT,
  id UUID,
  score REAL,
  created_at TIMESTAMPTZ,
  partner_id UUID
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
      p.marketplace_score::REAL AS score,
      p.created_at,
      p.partner_id
    FROM public.products p
    WHERE p_type IN ('tudo', 'produtos')
      AND p.is_active = true
      AND p.show_in_marketplace = true
      AND (p_partner_ids IS NULL OR p.partner_id = ANY(p_partner_ids))

    UNION ALL

    SELECT
      'servico'::TEXT,
      s.id,
      s.marketplace_score::REAL,
      s.created_at,
      s.partner_id
    FROM public.services s
    WHERE p_type IN ('tudo', 'servicos')
      AND s.is_active = true
      AND s.show_in_marketplace = true
      AND (p_partner_ids IS NULL OR s.partner_id = ANY(p_partner_ids))

    UNION ALL

    SELECT
      'plano'::TEXT,
      rp.id,
      rp.marketplace_score::REAL,
      rp.created_at,
      rp.partner_id
    FROM public.recurring_plans rp
    WHERE p_type IN ('tudo', 'planos')
      AND rp.status = 'active'
      AND rp.show_in_marketplace = true
      AND (p_partner_ids IS NULL OR rp.partner_id = ANY(p_partner_ids))
  )
  SELECT c.item_type, c.id, c.score, c.created_at, c.partner_id
  FROM combined c
  WHERE
    p_cursor_score IS NULL
    OR p_cursor_id IS NULL
    OR (c.score < p_cursor_score OR (c.score = p_cursor_score AND c.id < p_cursor_id))
  ORDER BY c.score DESC, c.id DESC
  LIMIT greatest(p_limit, 1);
END;
$$;
