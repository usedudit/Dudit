-- Script final para remover o erro de schema cache
-- Drop views problemáticas
DROP VIEW IF EXISTS partners_public_secure CASCADE;
DROP VIEW IF EXISTS partners_checkout_secure CASCADE;

-- Recreate views SEM NENHUMA COLUNA DE ENDEREÇO NA SELECT da tabela partners
-- As colunas vêm apenas do LEFT JOIN com addresses

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

-- Remover RLS policies da view (não precisa)
ALTER VIEW partners_public_secure OWNER TO postgres;
ALTER VIEW partners_checkout_secure OWNER TO postgres;

-- Done
SELECT 'Schema cache fix complete' as status;
