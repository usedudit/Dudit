-- ============================================================================
-- Fix: review triggers still updating partners.rating (column dropped)
--
-- A migration 20260729_clean_partners_schema.sql removeu a coluna
-- partners.rating (o rating foi movido para stores.rating).
-- Porém as triggers `after_review_change` (002_create_triggers.sql) e
-- `update_partner_rating_trigger` (033_add_review_triggers_and_partner_rating.sql)
-- continuam executando `UPDATE partners SET rating = ...`, o que causa:
--   column "rating" of relation "partners" does not exist
-- ao criar/editar/deletar uma avaliação no marketplace.
--
-- Fix: recriar as funções apontando para stores.rating.
-- ============================================================================

BEGIN;

-- ─── 1. Drop broken triggers on reviews ────────────────────────────────────
DROP TRIGGER IF EXISTS after_review_change ON public.reviews;
DROP FUNCTION IF EXISTS public.update_partner_rating();

DROP TRIGGER IF EXISTS update_partner_rating_trigger ON public.reviews;
DROP FUNCTION IF EXISTS public.update_partner_rating_from_all_items();

-- Obs: a trigger `after_review_change_product` (update_product_rating) NÃO é
-- dropada porque products.rating ainda existe.

-- ─── 2. Recreate: update stores.rating instead of partners.rating ──────────
CREATE OR REPLACE FUNCTION public.update_partner_rating_from_all_items()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_partner_id UUID;
  v_store_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_partner_id := OLD.partner_id;
    v_store_id := OLD.store_id;
  ELSE
    v_partner_id := NEW.partner_id;
    v_store_id := NEW.store_id;
  END IF;

  -- Avaliação com store específica → atualiza apenas essa store
  -- (só mostra a média quando a store tem ao menos 3 avaliações)
  IF v_store_id IS NOT NULL THEN
    UPDATE stores
    SET rating = COALESCE((
      SELECT CASE WHEN COUNT(r.rating) >= 3 THEN AVG(r.rating) ELSE 0 END
      FROM reviews r
      WHERE r.store_id = v_store_id
        AND r.rating IS NOT NULL
    ), 0)
    WHERE id = v_store_id;
  ELSE
    -- Avaliação de nível do parceiro → atualiza stores que NÃO têm reviews próprias
    -- (stores com reviews próprias mantêm seu rating individual)
    UPDATE stores
    SET rating = COALESCE((
      SELECT CASE WHEN COUNT(r.rating) >= 3 THEN AVG(r.rating) ELSE 0 END
      FROM reviews r
      WHERE r.store_id IS NULL
        AND r.partner_id = v_partner_id
        AND r.rating IS NOT NULL
    ), 0)
    WHERE partner_id = v_partner_id
      AND NOT EXISTS (
        SELECT 1 FROM reviews r
        WHERE r.store_id = stores.id
          AND r.rating IS NOT NULL
      );
  END IF;

  -- Manter o rating do produto em sincronia
  IF TG_OP = 'DELETE' THEN
    IF OLD.product_id IS NOT NULL THEN
      UPDATE products
      SET rating = COALESCE((
        SELECT AVG(rating)
        FROM reviews
        WHERE product_id = OLD.product_id
          AND rating IS NOT NULL
      ), 0)
      WHERE id = OLD.product_id;
    END IF;
  ELSE
    IF NEW.product_id IS NOT NULL THEN
      UPDATE products
      SET rating = COALESCE((
        SELECT AVG(rating)
        FROM reviews
        WHERE product_id = NEW.product_id
          AND rating IS NOT NULL
      ), 0)
      WHERE id = NEW.product_id;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS update_partner_rating_trigger ON reviews;
CREATE TRIGGER update_partner_rating_trigger
AFTER INSERT OR UPDATE OR DELETE ON reviews
FOR EACH ROW
EXECUTE FUNCTION public.update_partner_rating_from_all_items();

-- ─── 3. Recreate a função simples (mesmo comportamento) ────────────────────
CREATE OR REPLACE FUNCTION public.update_partner_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  new_rating NUMERIC;
  v_partner_id UUID;
  v_store_id UUID;
BEGIN
  v_partner_id := COALESCE(NEW.partner_id, OLD.partner_id);
  v_store_id := COALESCE(NEW.store_id, OLD.store_id);

  IF v_store_id IS NOT NULL THEN
    SELECT CASE WHEN COUNT(rating) >= 3 THEN AVG(rating) ELSE 0 END INTO new_rating
    FROM reviews
    WHERE store_id = v_store_id;

    UPDATE stores
    SET rating = new_rating
    WHERE id = v_store_id;
  ELSE
    -- Avaliação de nível do parceiro → atualiza apenas stores sem reviews próprias
    SELECT COALESCE(
      (SELECT CASE WHEN COUNT(rating) >= 3 THEN AVG(rating) ELSE 0 END
       FROM reviews
       WHERE store_id IS NULL AND partner_id = v_partner_id),
      0
    ) INTO new_rating;

    UPDATE stores
    SET rating = new_rating
    WHERE partner_id = v_partner_id
      AND NOT EXISTS (
        SELECT 1 FROM reviews
        WHERE store_id = stores.id AND rating IS NOT NULL
      );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS after_review_change ON reviews;
CREATE TRIGGER after_review_change
AFTER INSERT OR UPDATE OR DELETE ON reviews
FOR EACH ROW
EXECUTE FUNCTION public.update_partner_rating();

-- ─── 4. Backfill stores.rating a partir das reviews existentes ─────────────
-- 4a. Stores com reviews próprias (média só quando há ao menos 3 avaliações)
UPDATE stores s
SET rating = COALESCE((
  SELECT AVG(r.rating)::numeric(3,2)
  FROM reviews r
  WHERE r.store_id = s.id
    AND r.rating IS NOT NULL
  GROUP BY r.store_id
  HAVING COUNT(r.rating) >= 3
), 0)
WHERE EXISTS (
  SELECT 1 FROM reviews r
  WHERE r.store_id = s.id
    AND r.rating IS NOT NULL
);

-- 4b. Stores sem reviews próprias → média das reviews do parceiro
--     (média só quando há ao menos 3 avaliações)
UPDATE stores s
SET rating = COALESCE((
  SELECT AVG(r.rating)::numeric(3,2)
  FROM reviews r
  WHERE r.store_id IS NULL
    AND r.partner_id = s.partner_id
    AND r.rating IS NOT NULL
  GROUP BY r.partner_id
  HAVING COUNT(r.rating) >= 3
), 0)
WHERE NOT EXISTS (
  SELECT 1 FROM reviews r
  WHERE r.store_id = s.id
    AND r.rating IS NOT NULL
);

-- 4c. Stores sem nenhuma review → rating 0
UPDATE stores s
SET rating = 0
WHERE NOT EXISTS (
  SELECT 1 FROM reviews r
  WHERE (r.store_id = s.id OR r.partner_id = s.partner_id)
    AND r.rating IS NOT NULL
);

COMMIT;

NOTIFY pgrst, 'reload schema';
