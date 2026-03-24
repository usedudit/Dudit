-- Script para remover cache e regenerar views
-- Problema: Views e funções referem colunas que não existem mais

-- Drop todas as views que possam ter referências erradas
DROP VIEW IF EXISTS partners_public_secure CASCADE;
DROP VIEW IF EXISTS partners_checkout_secure CASCADE;

-- Recriar view partners_public_secure CORRETA (usando JOINs para addresses)
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
  COALESCE(a.zip_code, '')::text as zip_code,
  COALESCE(a.street, '')::text as street,
  COALESCE(a.number, '')::text as number,
  COALESCE(a.complement, '')::text as complement,
  COALESCE(a.neighborhood, '')::text as neighborhood,
  COALESCE(a.city, '')::text as city,
  COALESCE(a.state, '')::text as state,
  p.created_at
FROM partners p
LEFT JOIN addresses a ON a.partner_id = p.id AND a.is_default = true
WHERE p.is_active = true;

-- Recriar view partners_checkout_secure CORRETA (usando JOINs para addresses)
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

-- Clear qualquer coluna de endereço que possa estar na tabela user_profiles
ALTER TABLE user_profiles DROP COLUMN IF EXISTS address CASCADE;
ALTER TABLE user_profiles DROP COLUMN IF EXISTS city CASCADE;
ALTER TABLE user_profiles DROP COLUMN IF EXISTS state CASCADE;
ALTER TABLE user_profiles DROP COLUMN IF EXISTS zip_code CASCADE;
