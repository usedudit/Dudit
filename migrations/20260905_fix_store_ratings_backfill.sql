-- ============================================================================
-- Fix: backfill stores.rating after fixing trigger logic
--
-- O bug anterior causava que reviews com store_id específicas sobrescreviam
-- o rating de todas as stores do parceiro com a média geral.
-- Esta migration recalcula os ratings corretamente.
-- ============================================================================

BEGIN;

-- 1. Stores com reviews próprias → média das reviews da própria store (>= 3)
UPDATE stores s
SET rating = COALESCE((
  SELECT CASE WHEN COUNT(r.rating) >= 3 THEN AVG(r.rating) ELSE 0 END
  FROM reviews r
  WHERE r.store_id = s.id
    AND r.rating IS NOT NULL
), 0)
WHERE EXISTS (
  SELECT 1 FROM reviews r
  WHERE r.store_id = s.id
    AND r.rating IS NOT NULL
);

-- 2. Stores sem reviews próprias → média das reviews do parceiro (store_id IS NULL, >= 3)
UPDATE stores s
SET rating = COALESCE((
  SELECT CASE WHEN COUNT(r.rating) >= 3 THEN AVG(r.rating) ELSE 0 END
  FROM reviews r
  WHERE r.store_id IS NULL
    AND r.partner_id = s.partner_id
    AND r.rating IS NOT NULL
), 0)
WHERE NOT EXISTS (
  SELECT 1 FROM reviews r
  WHERE r.store_id = s.id
    AND r.rating IS NOT NULL
);

-- 3. Stores sem nenhuma review relevante → rating 0
UPDATE stores s
SET rating = 0
WHERE NOT EXISTS (
  SELECT 1 FROM reviews r
  WHERE (r.store_id = s.id OR (r.store_id IS NULL AND r.partner_id = s.partner_id))
    AND r.rating IS NOT NULL
);

COMMIT;

NOTIFY pgrst, 'reload schema';
