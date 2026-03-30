-- ============================================
-- PERFORMANCE INDEXES MIGRATION
-- Missing indexes identified during ERP performance audit
-- Execute in Supabase SQL Editor
-- All operations are ADDITIVE (no data loss)
-- ============================================
-- NOTE: Using regular CREATE INDEX (not CONCURRENTLY) because
-- Supabase SQL Editor runs inside a transaction block.
-- For production tables with heavy traffic, run these one-by-one
-- via psql with CONCURRENTLY if needed.

-- 1. Stock movements: composite index for list page
-- Used by getStockMovementsCached: WHERE partner_id = X ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_stock_movements_partner_created
  ON stock_movements(partner_id, created_at DESC);

-- 2. Stock movements: product_id for JOIN with products table
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id
  ON stock_movements(product_id);

-- 3. Products: composite index for ERP list page
-- Used by getCachedProducts: WHERE partner_id = X ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_products_partner_created
  ON products(partner_id, created_at DESC);

-- 4. Product variants: product_id for variant queries and JOINs
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id
  ON product_variants(product_id);

-- 5. Moderation jobs: product lookup + status filtering (used by cron worker)
CREATE INDEX IF NOT EXISTS idx_moderation_jobs_product_status
  ON moderation_jobs(product_id, status);

-- 6. Product metadata tables: partner_id for category/brand/location lookups
CREATE INDEX IF NOT EXISTS idx_product_categories_partner
  ON product_categories(partner_id);

CREATE INDEX IF NOT EXISTS idx_brands_partner
  ON brands(partner_id);

CREATE INDEX IF NOT EXISTS idx_storage_locations_partner
  ON storage_locations(partner_id);

-- ============================================
-- VERIFICATION: Run EXPLAIN ANALYZE on key queries after applying
-- ============================================
-- EXPLAIN ANALYZE SELECT * FROM stock_movements WHERE partner_id = '...' ORDER BY created_at DESC LIMIT 100;
-- EXPLAIN ANALYZE SELECT id, name, price FROM products WHERE partner_id = '...' ORDER BY created_at DESC;
