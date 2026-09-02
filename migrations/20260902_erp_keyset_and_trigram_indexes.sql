-- ============================================================================
-- Migration: ERP Keyset Pagination & Trigram Search Indexes
-- Data: 2026-09-02
-- Objetivo:
--   1. Criar índices compostos dedicados de keyset (partner_id, created_at DESC, id DESC)
--      para TODOS os módulos paginados do ERP.
--   2. Criar índices Trigram (GIN) em colunas de busca textual (nome, sku, descrição,
--      número de pedido, cliente, telefone) para acelerar qualquer busca ILIKE.
-- ============================================================================

-- Garante que a extensão pg_trgm está ativa
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- 1. ÍNDICES COMPOSTOS DEDICADOS PARA KEYSET PAGINATION (created_at DESC, id DESC)
-- ============================================================================

-- A) Serviços (ERP)
CREATE INDEX IF NOT EXISTS idx_services_partner_created_id_desc
  ON public.services (partner_id, created_at DESC, id DESC);

-- B) Clientes (ERP)
CREATE INDEX IF NOT EXISTS idx_customers_partner_created_id_desc
  ON public.customers (partner_id, created_at DESC, id DESC);

-- C) Ordens de Serviço (ERP)
CREATE INDEX IF NOT EXISTS idx_service_orders_partner_created_id_desc
  ON public.service_orders (partner_id, created_at DESC, id DESC);

-- D) Orçamentos (ERP)
CREATE INDEX IF NOT EXISTS idx_quotes_partner_created_id_desc
  ON public.quotes (partner_id, created_at DESC, id DESC);

-- E) Fornecedores (ERP)
CREATE INDEX IF NOT EXISTS idx_suppliers_partner_created_id_desc
  ON public.suppliers (partner_id, created_at DESC, id DESC);

-- F) Devoluções e Trocas (ERP)
CREATE INDEX IF NOT EXISTS idx_return_requests_partner_created_id_desc
  ON public.return_requests (partner_id, created_at DESC, id DESC);

-- G) Entregas e Despachos (ERP)
CREATE INDEX IF NOT EXISTS idx_deliveries_partner_created_id_desc
  ON public.deliveries (partner_id, created_at DESC, id DESC);

-- H) Linha do Tempo / Auditoria (ERP)
CREATE INDEX IF NOT EXISTS idx_audit_logs_partner_created_id_desc
  ON public.audit_logs (partner_id, created_at DESC, id DESC);


-- ============================================================================
-- 2. ÍNDICES TRIGRAM (GIN) PARA BUSCAS TEXTUAIS RÁPIDAS (ILIKE '%termo%')
-- ============================================================================

-- A) Produtos (Nome e SKU)
CREATE INDEX IF NOT EXISTS trgm_idx_products_name
  ON public.products USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS trgm_idx_products_sku
  ON public.products USING gin (sku gin_trgm_ops);

-- B) Serviços (Nome e SKU)
CREATE INDEX IF NOT EXISTS trgm_idx_services_name
  ON public.services USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS trgm_idx_services_sku
  ON public.services USING gin (sku gin_trgm_ops);

-- C) Clientes (Nome, Email, Telefone)
CREATE INDEX IF NOT EXISTS trgm_idx_customers_name
  ON public.customers USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS trgm_idx_customers_email
  ON public.customers USING gin (email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS trgm_idx_customers_phone
  ON public.customers USING gin (phone gin_trgm_ops);

-- D) Transações Financeiras (Descrição - extrato, contas a pagar/receber)
CREATE INDEX IF NOT EXISTS trgm_idx_transactions_description
  ON public.transactions USING gin (description gin_trgm_ops);

-- E) Pedidos (Nome do Cliente e Número do Pedido)
CREATE INDEX IF NOT EXISTS trgm_idx_orders_customer_name
  ON public.orders USING gin (customer_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS trgm_idx_orders_order_number
  ON public.orders USING gin (order_number gin_trgm_ops);

-- F) Fornecedores (Nome / Razão Social)
CREATE INDEX IF NOT EXISTS trgm_idx_suppliers_name
  ON public.suppliers USING gin (name gin_trgm_ops);

-- G) Ordens de Serviço (Número da OS)
CREATE INDEX IF NOT EXISTS trgm_idx_service_orders_number
  ON public.service_orders USING gin (order_number gin_trgm_ops);

-- H) Orçamentos (Número do Orçamento)
CREATE INDEX IF NOT EXISTS trgm_idx_quotes_number
  ON public.quotes USING gin (quote_number gin_trgm_ops);
