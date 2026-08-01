-- ==============================================================================
-- MIGRATION 5: CLEANUP DE ÍNDICES DUPLICADOS (PERFORMANCE & ARMAZENAMENTO)
-- Data: 2026-08-01 | Projeto: Dudit
-- Descrição: 
--   Remoção de 39 índices secundários não-únicos 100% duplicados.
--   Preserva 100% dos índices UNIQUE, PRIMARY KEYs e CONSTRAINTS.
-- ==============================================================================

BEGIN;

-- Tabela: product_logistics | Mantido: product_logistics_pkey | Removendo duplicata: idx_product_logistics_product_id
DROP INDEX IF EXISTS public."idx_product_logistics_product_id";

-- Tabela: product_variants | Mantido: product_variants_sku_key | Removendo duplicata: idx_product_variants_sku
DROP INDEX IF EXISTS public."idx_product_variants_sku";

-- Tabela: promotion_products | Mantido: promotion_products_unique | Removendo duplicata: idx_promotion_products_promotion_product
DROP INDEX IF EXISTS public."idx_promotion_products_promotion_product";

-- Tabela: promotion_usages | Mantido: idx_promotion_usages_customer_promo | Removendo duplicata: idx_promotion_usages_customer
DROP INDEX IF EXISTS public."idx_promotion_usages_customer";

-- Tabela: orders | Mantido: orders_order_number_key | Removendo duplicata: idx_orders_order_number
DROP INDEX IF EXISTS public."idx_orders_order_number";

-- Tabela: orders | Mantido: unique_mp_payment_id | Removendo duplicata: idx_orders_mp_payment_id
DROP INDEX IF EXISTS public."idx_orders_mp_payment_id";

-- Tabela: orders | Mantido: idx_orders_partner_id_situation | Removendo duplicata: idx_orders_partner_situation
DROP INDEX IF EXISTS public."idx_orders_partner_situation";

-- Tabela: quotes | Mantido: quotes_quote_number_key | Removendo duplicata: idx_quotes_number
DROP INDEX IF EXISTS public."idx_quotes_number";

-- Tabela: partners | Mantido: idx_partners_active | Removendo duplicata: idx_partners_active_fts
DROP INDEX IF EXISTS public."idx_partners_active_fts";

-- Tabela: partners | Mantido: idx_partners_user_id_unique | Removendo duplicata: idx_partners_user_id
DROP INDEX IF EXISTS public."idx_partners_user_id";

-- Tabela: order_items | Mantido: idx_order_items_order_id | Removendo duplicata: idx_order_items_order
DROP INDEX IF EXISTS public."idx_order_items_order";

-- Tabela: customers | Mantido: idx_customers_partner | Removendo duplicata: idx_customers_partner_id
DROP INDEX IF EXISTS public."idx_customers_partner_id";

-- Tabela: transactions | Mantido: idx_transactions_partner_reference_note | Removendo duplicata: idx_transactions_reference_note
DROP INDEX IF EXISTS public."idx_transactions_reference_note";

-- Tabela: return_items | Mantido: idx_return_items_request | Removendo duplicata: idx_return_items_return_request_id
DROP INDEX IF EXISTS public."idx_return_items_return_request_id";

-- Tabela: return_items | Mantido: idx_return_items_order_item | Removendo duplicata: idx_return_items_order_item_id
DROP INDEX IF EXISTS public."idx_return_items_order_item_id";

-- Tabela: promotion_services | Mantido: promotion_services_unique | Removendo duplicata: idx_promotion_services_promotion_service
DROP INDEX IF EXISTS public."idx_promotion_services_promotion_service";

-- Tabela: pre_sales | Mantido: idx_pre_sales_partner_status | Removendo duplicata: idx_pre_sales_partner_status_created
DROP INDEX IF EXISTS public."idx_pre_sales_partner_status_created";

-- Tabela: coupons | Mantido: coupons_partner_code_unique | Removendo duplicata: idx_coupons_partner_code
DROP INDEX IF EXISTS public."idx_coupons_partner_code";

-- Tabela: partner_users | Mantido: partner_users_unique | Removendo duplicata: idx_partner_users_partner_id_user_id
DROP INDEX IF EXISTS public."idx_partner_users_partner_id_user_id";

-- Tabela: product_categories | Mantido: idx_categories_partner | Removendo duplicata: idx_product_categories_partner
DROP INDEX IF EXISTS public."idx_product_categories_partner";

-- Tabela: storage_locations | Mantido: idx_locations_partner | Removendo duplicata: idx_storage_locations_partner
DROP INDEX IF EXISTS public."idx_storage_locations_partner";

-- Tabela: stock_movements | Mantido: idx_stock_movements_partner | Removendo duplicata: idx_stock_movements_partner_id
DROP INDEX IF EXISTS public."idx_stock_movements_partner_id";

-- Tabela: products | Mantido: idx_products_partner_id | Removendo duplicata: idx_products_partner_id_user
DROP INDEX IF EXISTS public."idx_products_partner_id_user";

-- Tabela: products | Mantido: idx_products_subcategory | Removendo duplicata: idx_products_subcategory_id
DROP INDEX IF EXISTS public."idx_products_subcategory_id";

-- Tabela: products | Mantido: trgm_idx_products_name | Removendo duplicata: idx_products_name_trgm
DROP INDEX IF EXISTS public."idx_products_name_trgm";

-- Tabela: products | Mantido: trgm_idx_products_sku | Removendo duplicata: idx_products_sku_trgm
DROP INDEX IF EXISTS public."idx_products_sku_trgm";

-- Tabela: products | Mantido: products_deleted_at_idx | Removendo duplicata: idx_products_deleted_at
DROP INDEX IF EXISTS public."idx_products_deleted_at";

-- Tabela: payment_method_installment_fees | Mantido: payment_method_installment_fe_payment_method_id_installment_key | Removendo duplicata: idx_payment_method_installment_fees_method
DROP INDEX IF EXISTS public."idx_payment_method_installment_fees_method";

-- Tabela: service_orders | Mantido: service_orders_public_token_key | Removendo duplicata: idx_service_orders_public_token
DROP INDEX IF EXISTS public."idx_service_orders_public_token";

-- Tabela: billing_invoices | Mantido: billing_invoices_invoice_number_key | Removendo duplicata: idx_billing_invoices_number
DROP INDEX IF EXISTS public."idx_billing_invoices_number";

-- Tabela: billing_invoices | Mantido: billing_invoices_verification_hash_key | Removendo duplicata: idx_billing_invoices_hash
DROP INDEX IF EXISTS public."idx_billing_invoices_hash";

-- Tabela: audit_logs | Mantido: idx_audit_logs_entity_fast | Removendo duplicata: idx_audit_logs_partner_timeline
DROP INDEX IF EXISTS public."idx_audit_logs_partner_timeline";

-- Tabela: audit_logs | Mantido: idx_audit_logs_entity_fast | Removendo duplicata: idx_audit_timeline_entity
DROP INDEX IF EXISTS public."idx_audit_timeline_entity";

-- Tabela: audit_logs | Mantido: idx_audit_logs_partner_created | Removendo duplicata: idx_audit_logs_partner_id
DROP INDEX IF EXISTS public."idx_audit_logs_partner_id";

-- Tabela: audit_logs | Mantido: idx_audit_logs_partner_created | Removendo duplicata: idx_audit_timeline_partner
DROP INDEX IF EXISTS public."idx_audit_timeline_partner";

-- Tabela: audit_logs | Mantido: idx_audit_logs_partner_id | Removendo duplicata: idx_audit_timeline_partner
DROP INDEX IF EXISTS public."idx_audit_timeline_partner";

-- Tabela: audit_logs | Mantido: idx_audit_logs_partner_timeline | Removendo duplicata: idx_audit_timeline_entity
DROP INDEX IF EXISTS public."idx_audit_timeline_entity";

-- Tabela: services | Mantido: services_sku_key | Removendo duplicata: idx_services_sku
DROP INDEX IF EXISTS public."idx_services_sku";

-- Tabela: services | Mantido: services_deleted_at_idx | Removendo duplicata: idx_services_deleted_at
DROP INDEX IF EXISTS public."idx_services_deleted_at";

COMMIT;
