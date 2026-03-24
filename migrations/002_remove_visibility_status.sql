-- Remove visibility_status column and index
DROP INDEX IF EXISTS idx_products_visibility;
ALTER TABLE products DROP COLUMN IF EXISTS visibility_status CASCADE;
