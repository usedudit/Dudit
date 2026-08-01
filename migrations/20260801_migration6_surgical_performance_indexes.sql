-- ==============================================================================
-- MIGRATION 6: ÍNDICES CIRÚRGICOS DE PERFORMANCE DE ALTO IMPACTO (FASE A)
-- Data: 2026-08-01 | Projeto: Dudit
-- Descrição: 
--   Criação isolada de 9 índices cirúrgicos direcionados baseados em evidência real
--   de Seq Scan e análise de Bitmap OR Scan para RLS Policies (addresses, return_requests, etc.).
-- ==============================================================================

BEGIN;

-- Tabela: return_requests | Flow: Relatório de Trocas/Devoluções & Filtro por Período no ERP
CREATE INDEX IF NOT EXISTS "idx_return_requests_partner_created" ON public."return_requests" USING btree (partner_id, created_at DESC);

-- Tabela: addresses | Flow: RLS Policy addresses_select_own (Bitmap OR Scan em customer_id)
CREATE INDEX IF NOT EXISTS "idx_addresses_customer_id" ON public."addresses" USING btree (customer_id) WHERE customer_id IS NOT NULL;

-- Tabela: addresses | Flow: RLS Policy addresses_select_own (Bitmap OR Scan em supplier_id)
CREATE INDEX IF NOT EXISTS "idx_addresses_supplier_id" ON public."addresses" USING btree (supplier_id) WHERE supplier_id IS NOT NULL;

-- Tabela: addresses | Flow: RLS Policy addresses_select_own (Bitmap OR Scan em partner_id)
CREATE INDEX IF NOT EXISTS "idx_addresses_partner_id" ON public."addresses" USING btree (partner_id) WHERE partner_id IS NOT NULL;

-- Tabela: product_variants | Flow: Seleção de Opções de Variantes/SKUs no PDV & Marketplace
CREATE INDEX IF NOT EXISTS "idx_product_variants_product_id" ON public."product_variants" USING btree (product_id);

-- Tabela: user_profiles | Flow: Validação de Sessão e Permissões do Usuário (requirePermission / requireUser)
CREATE INDEX IF NOT EXISTS "idx_user_profiles_user_id" ON public."user_profiles" USING btree (user_id);

-- Tabela: products | Flow: Listagem de Produtos Ativos no ERP, PDV e Marketplace
CREATE INDEX IF NOT EXISTS "idx_products_partner_status_active" ON public."products" USING btree (partner_id, status) WHERE status = 'ativo';

-- Tabela: return_items | Flow: Detalhamento de Itens de Devolução na Central de Trocas
CREATE INDEX IF NOT EXISTS "idx_return_items_request_id" ON public."return_items" USING btree (return_request_id);

-- Tabela: order_items | Flow: Detalhamento de Itens de Pedido no Checkout, PDV e Histórico
CREATE INDEX IF NOT EXISTS "idx_order_items_order_id" ON public."order_items" USING btree (order_id);

COMMIT;
