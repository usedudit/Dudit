-- ==============================================================================
-- ROLLBACK MIGRATION 5: RESTAURAÇÃO DOS ÍNDICES DUPLICADOS
-- Data: 2026-08-01 | Projeto: Dudit
-- Descrição: Recria os 39 índices com suas definições originais exatas.
-- ==============================================================================

BEGIN;

-- Tabela: product_logistics | Restaurando duplicata: idx_product_logistics_product_id
CREATE INDEX idx_product_logistics_product_id ON public.product_logistics USING btree (product_id);

-- Tabela: product_variants | Restaurando duplicata: idx_product_variants_sku
CREATE INDEX idx_product_variants_sku ON public.product_variants USING btree (sku);

-- Tabela: promotion_products | Restaurando duplicata: idx_promotion_products_promotion_product
CREATE INDEX idx_promotion_products_promotion_product ON public.promotion_products USING btree (promotion_id, product_id);

-- Tabela: promotion_usages | Restaurando duplicata: idx_promotion_usages_customer
CREATE INDEX idx_promotion_usages_customer ON public.promotion_usages USING btree (customer_id, promotion_id);

-- Tabela: orders | Restaurando duplicata: idx_orders_order_number
CREATE INDEX idx_orders_order_number ON public.orders USING btree (order_number);

-- Tabela: orders | Restaurando duplicata: idx_orders_mp_payment_id
CREATE INDEX idx_orders_mp_payment_id ON public.orders USING btree (mp_payment_id);

-- Tabela: orders | Restaurando duplicata: idx_orders_partner_situation
CREATE INDEX idx_orders_partner_situation ON public.orders USING btree (partner_id, situation);

-- Tabela: quotes | Restaurando duplicata: idx_quotes_number
CREATE INDEX idx_quotes_number ON public.quotes USING btree (quote_number);

-- Tabela: partners | Restaurando duplicata: idx_partners_active_fts
CREATE INDEX idx_partners_active_fts ON public.partners USING btree (is_active) WHERE (is_active = true);

-- Tabela: partners | Restaurando duplicata: idx_partners_user_id
CREATE INDEX idx_partners_user_id ON public.partners USING btree (user_id);

-- Tabela: order_items | Restaurando duplicata: idx_order_items_order
CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id);

-- Tabela: customers | Restaurando duplicata: idx_customers_partner_id
CREATE INDEX idx_customers_partner_id ON public.customers USING btree (partner_id);

-- Tabela: transactions | Restaurando duplicata: idx_transactions_reference_note
CREATE INDEX idx_transactions_reference_note ON public.transactions USING btree (partner_id, reference_note) WHERE (reference_note IS NOT NULL);

-- Tabela: return_items | Restaurando duplicata: idx_return_items_return_request_id
CREATE INDEX idx_return_items_return_request_id ON public.return_items USING btree (return_request_id);

-- Tabela: return_items | Restaurando duplicata: idx_return_items_order_item_id
CREATE INDEX idx_return_items_order_item_id ON public.return_items USING btree (order_item_id);

-- Tabela: promotion_services | Restaurando duplicata: idx_promotion_services_promotion_service
CREATE INDEX idx_promotion_services_promotion_service ON public.promotion_services USING btree (promotion_id, service_id);

-- Tabela: pre_sales | Restaurando duplicata: idx_pre_sales_partner_status_created
CREATE INDEX idx_pre_sales_partner_status_created ON public.pre_sales USING btree (partner_id, status, created_at DESC);

-- Tabela: coupons | Restaurando duplicata: idx_coupons_partner_code
CREATE INDEX idx_coupons_partner_code ON public.coupons USING btree (partner_id, code);

-- Tabela: partner_users | Restaurando duplicata: idx_partner_users_partner_id_user_id
CREATE INDEX idx_partner_users_partner_id_user_id ON public.partner_users USING btree (partner_id, user_id);

-- Tabela: product_categories | Restaurando duplicata: idx_product_categories_partner
CREATE INDEX idx_product_categories_partner ON public.product_categories USING btree (partner_id);

-- Tabela: storage_locations | Restaurando duplicata: idx_storage_locations_partner
CREATE INDEX idx_storage_locations_partner ON public.storage_locations USING btree (partner_id);

-- Tabela: stock_movements | Restaurando duplicata: idx_stock_movements_partner_id
CREATE INDEX idx_stock_movements_partner_id ON public.stock_movements USING btree (partner_id);

-- Tabela: products | Restaurando duplicata: idx_products_partner_id_user
CREATE INDEX idx_products_partner_id_user ON public.products USING btree (partner_id);

-- Tabela: products | Restaurando duplicata: idx_products_subcategory_id
CREATE INDEX idx_products_subcategory_id ON public.products USING btree (subcategory_id);

-- Tabela: products | Restaurando duplicata: idx_products_name_trgm
CREATE INDEX idx_products_name_trgm ON public.products USING gin (name gin_trgm_ops);

-- Tabela: products | Restaurando duplicata: idx_products_sku_trgm
CREATE INDEX idx_products_sku_trgm ON public.products USING gin (sku gin_trgm_ops);

-- Tabela: products | Restaurando duplicata: idx_products_deleted_at
CREATE INDEX idx_products_deleted_at ON public.products USING btree (partner_id, deleted_at) WHERE (deleted_at IS NULL);

-- Tabela: payment_method_installment_fees | Restaurando duplicata: idx_payment_method_installment_fees_method
CREATE INDEX idx_payment_method_installment_fees_method ON public.payment_method_installment_fees USING btree (payment_method_id, installment_number);

-- Tabela: service_orders | Restaurando duplicata: idx_service_orders_public_token
CREATE INDEX idx_service_orders_public_token ON public.service_orders USING btree (public_token);

-- Tabela: billing_invoices | Restaurando duplicata: idx_billing_invoices_number
CREATE INDEX idx_billing_invoices_number ON public.billing_invoices USING btree (invoice_number);

-- Tabela: billing_invoices | Restaurando duplicata: idx_billing_invoices_hash
CREATE INDEX idx_billing_invoices_hash ON public.billing_invoices USING btree (verification_hash);

-- Tabela: audit_logs | Restaurando duplicata: idx_audit_logs_partner_timeline
CREATE INDEX idx_audit_logs_partner_timeline ON public.audit_logs USING btree (partner_id, entity_type, entity_id, created_at DESC);

-- Tabela: audit_logs | Restaurando duplicata: idx_audit_timeline_entity
CREATE INDEX idx_audit_timeline_entity ON public.audit_logs USING btree (partner_id, entity_type, entity_id, created_at DESC);

-- Tabela: audit_logs | Restaurando duplicata: idx_audit_logs_partner_id
CREATE INDEX idx_audit_logs_partner_id ON public.audit_logs USING btree (partner_id, created_at DESC);

-- Tabela: audit_logs | Restaurando duplicata: idx_audit_timeline_partner
CREATE INDEX idx_audit_timeline_partner ON public.audit_logs USING btree (partner_id, created_at DESC);

-- Tabela: audit_logs | Restaurando duplicata: idx_audit_timeline_partner
CREATE INDEX idx_audit_timeline_partner ON public.audit_logs USING btree (partner_id, created_at DESC);

-- Tabela: audit_logs | Restaurando duplicata: idx_audit_timeline_entity
CREATE INDEX idx_audit_timeline_entity ON public.audit_logs USING btree (partner_id, entity_type, entity_id, created_at DESC);

-- Tabela: services | Restaurando duplicata: idx_services_sku
CREATE INDEX idx_services_sku ON public.services USING btree (sku);

-- Tabela: services | Restaurando duplicata: idx_services_deleted_at
CREATE INDEX idx_services_deleted_at ON public.services USING btree (partner_id, deleted_at) WHERE (deleted_at IS NULL);

COMMIT;
