-- Migration: Performance indexes for product actions
-- Pré-requisito para SKU generation via INSERT + retry (sem N+1 queries)
-- 
-- IMPORTANTE: Executar no Supabase SQL Editor antes do deploy

-- 1. Composite unique index: SKU único por parceiro
-- Permite retry no insert em caso de collision ao invés de N+1 SELECT queries
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_partner_sku_unique
  ON products(partner_id, sku);

-- 2. Index para lookups por store_id (usado em createProductComprehensiveAction)
CREATE INDEX IF NOT EXISTS idx_products_store_id
  ON products(store_id);
