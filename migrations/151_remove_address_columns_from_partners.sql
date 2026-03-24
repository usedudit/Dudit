-- Script 151: Remove address columns from partners table
-- This ensures address data is ONLY in the addresses table
-- ============================================================

-- Remove address columns from partners table
ALTER TABLE partners 
DROP COLUMN IF EXISTS zip_code CASCADE,
DROP COLUMN IF EXISTS street CASCADE,
DROP COLUMN IF EXISTS number CASCADE,
DROP COLUMN IF EXISTS complement CASCADE,
DROP COLUMN IF EXISTS neighborhood CASCADE,
DROP COLUMN IF EXISTS city CASCADE,
DROP COLUMN IF EXISTS state CASCADE;

-- Recreate the secure view without referencing non-existent columns
DROP VIEW IF EXISTS partners_public_secure CASCADE;
DROP VIEW IF EXISTS partners_checkout_secure CASCADE;

CREATE OR REPLACE VIEW partners_public_secure AS
SELECT 
  p.id,
  p.user_id,
  p.store_name,
  p.store_description,
  p.store_image_url,
  p.rating,
  p.is_active,
  p.offering_type,
  p.sells_products,
  p.provides_services,
  p.opening_hours,
  COALESCE(a.zip_code, '') as zip_code,
  COALESCE(a.street, '') as street,
  COALESCE(a.number, '') as number,
  COALESCE(a.complement, '') as complement,
  COALESCE(a.neighborhood, '') as neighborhood,
  COALESCE(a.city, '') as city,
  COALESCE(a.state, '') as state,
  p.created_at
FROM partners p
LEFT JOIN addresses a ON a.partner_id = p.id AND a.is_default = true
WHERE p.is_active = true;

CREATE OR REPLACE VIEW partners_checkout_secure AS
SELECT 
  p.id,
  p.user_id,
  p.store_name,
  p.max_installments,
  p.installments_without_interest,
  p.interest_rate_percent,
  p.mp_public_key,
  CONCAT(
    COALESCE(a.street, ''), ', ', COALESCE(a.number, ''),
    CASE WHEN a.complement IS NOT NULL AND a.complement != '' 
         THEN CONCAT(', ', a.complement) ELSE '' END,
    ' - ', COALESCE(a.neighborhood, ''), ', ', COALESCE(a.city, ''), 
    ' - ', COALESCE(a.state, ''), ', ', COALESCE(a.zip_code, '')
  ) as full_address
FROM partners p
LEFT JOIN addresses a ON a.partner_id = p.id AND a.is_default = true
WHERE p.is_active = true;

-- Verify partners table no longer has address columns
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'partners' 
    AND column_name IN ('zip_code', 'street', 'city', 'state')
  ) THEN
    RAISE EXCEPTION 'ERROR: Partners table still has address columns! Address data must be in addresses table only.';
  END IF;
END $$;

-- Success message
SELECT 'SUCCESS: Address columns removed from partners. All address data is now in addresses table with partner_id reference.' as status;
