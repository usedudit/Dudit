-- Drop problematic views que estão causando schema cache bug
DROP VIEW IF EXISTS partners_public_secure CASCADE;
DROP VIEW IF EXISTS partners_checkout_secure CASCADE;

-- Recria partners_public_secure com LEFT JOIN para addresses
-- Mas dessa vez com alias único pra não confundir schema cache
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
  COALESCE(addr.zip_code, '') as zip_code,
  COALESCE(addr.street, '') as street,
  COALESCE(addr.number, '') as number,
  COALESCE(addr.complement, '') as complement,
  COALESCE(addr.neighborhood, '') as neighborhood,
  COALESCE(addr.city, '') as city,
  COALESCE(addr.state, '') as state,
  p.created_at
FROM partners p
LEFT JOIN addresses addr ON addr.partner_id = p.id AND addr.is_default = true
WHERE p.is_active = true;

-- Recreate partners_checkout_secure com LEFT JOIN
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
    COALESCE(addr.street, ''), ', ', COALESCE(addr.number, ''),
    CASE WHEN addr.complement IS NOT NULL AND addr.complement != '' 
         THEN CONCAT(', ', addr.complement) ELSE '' END,
    ' - ', COALESCE(addr.neighborhood, ''), ', ', COALESCE(addr.city, ''), 
    ' - ', COALESCE(addr.state, ''), ', ', COALESCE(addr.zip_code, '')
  ) as full_address
FROM partners p
LEFT JOIN addresses addr ON addr.partner_id = p.id AND addr.is_default = true
WHERE p.is_active = true;
