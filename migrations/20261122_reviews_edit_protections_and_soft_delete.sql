-- =============================================================================
-- MIGRATION: Reviews Edit Protections, Audit History & Soft Delete
-- Date: 2026-11-22
-- Description:
--   1. Adds updated_at, edit_count, deleted_at, and edit_history to public.reviews.
--   2. Updates public.reviews_public view to exclude soft-deleted/hidden reviews
--      and expose updated_at.
--   3. Updates rating trigger functions so soft-deleted and hidden reviews are
--      excluded from store, product, and service averages.
-- =============================================================================

BEGIN;

-- 1. Columns & constraints on public.reviews
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edit_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edit_history JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.reviews
  DROP CONSTRAINT IF EXISTS reviews_edit_count_non_negative;

ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_edit_count_non_negative CHECK (edit_count >= 0);

CREATE INDEX IF NOT EXISTS idx_reviews_active_deleted_at
  ON public.reviews (deleted_at)
  WHERE deleted_at IS NULL;

-- 2. Update public.reviews_public view (preserve security_barrier and grants)
DROP VIEW IF EXISTS public.reviews_public;
CREATE VIEW public.reviews_public
WITH (security_barrier = true)
AS
SELECT
  rating,
  comment,
  created_at,
  updated_at,
  product_id,
  service_id,
  store_id
FROM public.reviews
WHERE deleted_at IS NULL
  AND COALESCE(is_hidden, false) = false;

REVOKE ALL ON public.reviews_public FROM PUBLIC;
REVOKE ALL ON public.reviews_public FROM anon, authenticated;
GRANT SELECT ON public.reviews_public TO anon, authenticated;

-- 3. Update rating trigger functions to exclude soft-deleted and hidden reviews
CREATE OR REPLACE FUNCTION public.update_partner_rating_from_all_items()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_partner_id UUID;
  v_store_id UUID;
  v_product_id UUID;
  v_service_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_partner_id := OLD.partner_id;
    v_store_id := OLD.store_id;
    v_product_id := OLD.product_id;
    v_service_id := OLD.service_id;
  ELSE
    v_partner_id := NEW.partner_id;
    v_store_id := NEW.store_id;
    v_product_id := NEW.product_id;
    v_service_id := NEW.service_id;
  END IF;

  -- Store-specific reviews (only show average when >= 3 active reviews)
  IF v_store_id IS NOT NULL THEN
    UPDATE stores
    SET rating = COALESCE((
      SELECT CASE WHEN COUNT(r.rating) >= 3 THEN AVG(r.rating) ELSE 0 END
      FROM reviews r
      WHERE r.store_id = v_store_id
        AND r.rating IS NOT NULL
        AND r.deleted_at IS NULL
        AND COALESCE(r.is_hidden, false) = false
    ), 0)
    WHERE id = v_store_id;
  ELSE
    -- Partner-level reviews -> update stores without their own active reviews
    UPDATE stores
    SET rating = COALESCE((
      SELECT CASE WHEN COUNT(r.rating) >= 3 THEN AVG(r.rating) ELSE 0 END
      FROM reviews r
      WHERE r.store_id IS NULL
        AND r.partner_id = v_partner_id
        AND r.rating IS NOT NULL
        AND r.deleted_at IS NULL
        AND COALESCE(r.is_hidden, false) = false
    ), 0)
    WHERE partner_id = v_partner_id
      AND NOT EXISTS (
        SELECT 1 FROM reviews r
        WHERE r.store_id = stores.id
          AND r.rating IS NOT NULL
          AND r.deleted_at IS NULL
          AND COALESCE(r.is_hidden, false) = false
      );
  END IF;

  -- Keep product rating in sync
  IF v_product_id IS NOT NULL THEN
    UPDATE products
    SET rating = COALESCE((
      SELECT AVG(rating)
      FROM reviews
      WHERE product_id = v_product_id
        AND rating IS NOT NULL
        AND deleted_at IS NULL
        AND COALESCE(is_hidden, false) = false
    ), 0)
    WHERE id = v_product_id;
  END IF;

  -- Keep service rating in sync
  IF v_service_id IS NOT NULL THEN
    UPDATE services
    SET rating = COALESCE((
      SELECT AVG(rating)
      FROM reviews
      WHERE service_id = v_service_id
        AND rating IS NOT NULL
        AND deleted_at IS NULL
        AND COALESCE(is_hidden, false) = false
    ), 0)
    WHERE id = v_service_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

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
    WHERE store_id = v_store_id
      AND rating IS NOT NULL
      AND deleted_at IS NULL
      AND COALESCE(is_hidden, false) = false;

    UPDATE stores
    SET rating = COALESCE(new_rating, 0)
    WHERE id = v_store_id;
  ELSE
    SELECT COALESCE(
      (SELECT CASE WHEN COUNT(rating) >= 3 THEN AVG(rating) ELSE 0 END
       FROM reviews
       WHERE store_id IS NULL
         AND partner_id = v_partner_id
         AND rating IS NOT NULL
         AND deleted_at IS NULL
         AND COALESCE(is_hidden, false) = false),
      0
    ) INTO new_rating;

    UPDATE stores
    SET rating = new_rating
    WHERE partner_id = v_partner_id
      AND NOT EXISTS (
        SELECT 1 FROM reviews
        WHERE store_id = stores.id
          AND rating IS NOT NULL
          AND deleted_at IS NULL
          AND COALESCE(is_hidden, false) = false
      );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_product_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  new_rating NUMERIC;
  v_product_id UUID;
BEGIN
  v_product_id := COALESCE(NEW.product_id, OLD.product_id);

  IF v_product_id IS NOT NULL THEN
    SELECT COALESCE(AVG(rating), 0) INTO new_rating
    FROM reviews
    WHERE product_id = v_product_id
      AND rating IS NOT NULL
      AND deleted_at IS NULL
      AND COALESCE(is_hidden, false) = false;

    UPDATE products
    SET rating = new_rating
    WHERE id = v_product_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMIT;
