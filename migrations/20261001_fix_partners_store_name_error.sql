-- ============================================================================
-- Fix: column partners.store_name does not exist
--
-- The column `store_name` was removed from the `partners` table by migration
-- 20260729_clean_partners_schema.sql (data moved to `stores.name`).
--
-- Several legacy views still select `p.store_name`, `p.store_description`,
-- `p.store_image_url`, `p.rating`, etc. — all dropped columns — which causes
-- PostgreSQL/PostgREST to throw:
--   "column partners.store_name does not exist"
-- whenever those views are queried (e.g. via RLS policy triggers or direct
-- select).
--
-- This migration drops any remaining legacy views and triggers that reference
-- those removed columns, ensuring a clean schema.
-- ============================================================================

BEGIN;

-- ─── 1. Drop legacy secure views that reference dropped partners columns ─────
DROP VIEW IF EXISTS public.partners_public_secure CASCADE;
DROP VIEW IF EXISTS public.partners_checkout_secure CASCADE;
DROP VIEW IF EXISTS public.partners_public CASCADE;
DROP VIEW IF EXISTS public.partners_checkout CASCADE;

-- ─── 2. Drop legacy triggers that reference dropped partners columns ─────────
-- trg_partners_refresh_product_fts referenced NEW.store_name (dropped)
-- Was created by 20260607_marketplace_search_relevance.sql
DROP TRIGGER IF EXISTS trg_partners_refresh_product_fts ON public.partners;
DROP FUNCTION IF EXISTS public.trg_partners_refresh_product_fts();

-- trg_partners_marketplace_fts referenced NEW.store_name, NEW.store_description (dropped)
-- Was created by 20260607_marketplace_search_relevance.sql
DROP TRIGGER IF EXISTS trg_partners_marketplace_fts ON public.partners;
DROP FUNCTION IF EXISTS public.trg_partners_marketplace_fts();

-- trigger_create_initial_store referenced NEW.store_name, NEW.store_image_url (dropped)
-- Was created by 03_create_initial_store_for_partners.sql, re-created by f1_migrate_partner_data_to_stores.sql
DROP TRIGGER IF EXISTS trigger_create_initial_store ON public.partners;
DROP FUNCTION IF EXISTS public.create_initial_store_for_partner();

-- ─── 3. Recreate trigger to watch stores.name instead of partners.store_name ─
-- This trigger refreshes product FTS when the store name changes (the new source
-- of truth for store_name), replacing the dropped trg_partners_refresh_product_fts.
CREATE OR REPLACE FUNCTION public.trg_stores_refresh_product_fts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.name IS DISTINCT FROM OLD.name THEN
    PERFORM public.refresh_product_marketplace_fts(p.id)
    FROM public.products p
    WHERE p.partner_id = NEW.partner_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stores_refresh_product_fts ON public.stores;
CREATE TRIGGER trg_stores_refresh_product_fts
  AFTER UPDATE OF name ON public.stores
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_stores_refresh_product_fts();

-- ─── 4. Recreate partner marketplace FTS trigger to watch stores instead ──────
-- trg_partners_marketplace_fts was dropping because it watched store_name.
-- Now we watch stores.name changes instead.
CREATE OR REPLACE FUNCTION public.trg_stores_marketplace_fts()
RETURNS TRIGGER AS $$
BEGIN
  -- Refresh FTS for all products/services under this partner's stores
  PERFORM public.refresh_product_marketplace_fts(NULL);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stores_marketplace_fts ON public.stores;
CREATE TRIGGER trg_stores_marketplace_fts
  AFTER INSERT OR UPDATE OF name, description, partner_id ON public.stores
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_stores_marketplace_fts();

-- ─── 5. Reload PostgREST schema ───────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

COMMIT;
