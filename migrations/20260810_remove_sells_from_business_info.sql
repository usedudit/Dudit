-- Remove "sells" key from business_info in partners and stores tables
UPDATE partners
SET business_info = business_info - 'sells'
WHERE business_info ? 'sells';

UPDATE stores
SET business_info = business_info - 'sells'
WHERE business_info ? 'sells';

-- Update default constraint for business_info column
ALTER TABLE partners 
ALTER COLUMN business_info SET DEFAULT '{"mode": "erp", "activeResources": ["orders", "products", "services"]}'::jsonb;

ALTER TABLE stores 
ALTER COLUMN business_info SET DEFAULT '{"mode": "erp", "activeResources": ["orders", "products", "services"]}'::jsonb;
