-- ==============================================================================
-- ROLLBACK MIGRATION 6: RESTAURAÇÃO DE ÍNDICES CIRÚRGICOS
-- Data: 2026-08-01 | Projeto: Dudit
-- Descrição: Remove os 9 índices cirúrgicos criados na Migration 6.
-- ==============================================================================

BEGIN;

-- Tabela: return_requests
DROP INDEX IF EXISTS public."idx_return_requests_partner_created";

-- Tabela: addresses
DROP INDEX IF EXISTS public."idx_addresses_customer_id";

-- Tabela: addresses
DROP INDEX IF EXISTS public."idx_addresses_supplier_id";

-- Tabela: addresses
DROP INDEX IF EXISTS public."idx_addresses_partner_id";

-- Tabela: product_variants
DROP INDEX IF EXISTS public."idx_product_variants_product_id";

-- Tabela: user_profiles
DROP INDEX IF EXISTS public."idx_user_profiles_user_id";

-- Tabela: products
DROP INDEX IF EXISTS public."idx_products_partner_status_active";

-- Tabela: return_items
DROP INDEX IF EXISTS public."idx_return_items_request_id";

-- Tabela: order_items
DROP INDEX IF EXISTS public."idx_order_items_order_id";

COMMIT;
