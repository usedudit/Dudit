-- Remove visibility_status column from products table
-- This cleanup removes the deprecated visibility_status column
-- and the index associated with it

DROP INDEX IF EXISTS idx_products_visibility;
ALTER TABLE products DROP COLUMN IF EXISTS visibility_status CASCADE;
