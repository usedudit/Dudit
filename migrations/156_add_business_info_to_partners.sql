-- Migration: Add business_info to partners table and drop legacy columns
-- Description: Consolidates business characteristics into a single JSONB column, migrating existing data and removing old columns.

BEGIN;

-- 1. Add the new JSONB column
ALTER TABLE partners ADD COLUMN IF NOT EXISTS business_info JSONB DEFAULT '{"sells": ["products"], "mode": "erp"}'::jsonb;

-- 2. Migrate existing data
UPDATE partners
SET business_info = jsonb_build_object(
    'sells', 
    CASE 
        WHEN sells_products = true AND provides_services = true THEN '["products", "services"]'::jsonb
        WHEN provides_services = true AND sells_products = false THEN '["services"]'::jsonb
        ELSE '["products"]'::jsonb
    END,
    'mode', '"erp"'::jsonb
);

-- 3. Drop legacy columns
ALTER TABLE partners
    DROP COLUMN IF EXISTS sells_products,
    DROP COLUMN IF EXISTS provides_services,
    DROP COLUMN IF EXISTS offering_type;

COMMIT;
