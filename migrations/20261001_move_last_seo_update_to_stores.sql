-- ============================================================================
-- Migrate: last_seo_update_at from partners to stores
--
-- last_seo_update_at was added to partners (outside migrations) to enforce a
-- 15-day cooldown on SEO-sensitive store changes (store name, city, state).
-- It belongs on stores since SEO metadata is per-store (slug, name, address).
--
-- This migration:
--   1. Adds last_seo_update_at to stores
--   2. Copies existing values from partners -> stores (headquarters store)
--   3. Drops the column from partners
-- ============================================================================

-- 1. Add column to stores
ALTER TABLE stores ADD COLUMN IF NOT EXISTS last_seo_update_at TIMESTAMP WITH TIME ZONE;

-- 2. Copy existing values from partners to the headquarters store
UPDATE stores s
SET last_seo_update_at = p.last_seo_update_at
FROM partners p
WHERE s.partner_id = p.id
  AND s.is_headquarters = true
  AND p.last_seo_update_at IS NOT NULL
  AND s.last_seo_update_at IS NULL;

-- 3. Drop column from partners (if it exists - added outside migrations)
ALTER TABLE partners DROP COLUMN IF EXISTS last_seo_update_at;
