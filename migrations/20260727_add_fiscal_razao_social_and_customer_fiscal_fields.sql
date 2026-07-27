-- Migration: Add razao_social / nome_fantasia to stores, ie_isento / inscricao_municipal to customers
-- Description: Completa dados fiscais de PJ nas stores e adiciona campos faltantes nos customers

-- 1. Stores: add razao_social and nome_fantasia
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS razao_social TEXT,
  ADD COLUMN IF NOT EXISTS nome_fantasia TEXT;

COMMENT ON COLUMN stores.razao_social IS 'Razão Social da empresa (apenas PJ)';
COMMENT ON COLUMN stores.nome_fantasia IS 'Nome fantasia da empresa (apenas PJ)';

-- 2. Customers: add ie_isento and inscricao_municipal (campos que só existiam em stores)
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS ie_isento BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS inscricao_municipal TEXT;

COMMENT ON COLUMN customers.ie_isento IS 'Indica se o cliente é Isento de Inscrição Estadual';
COMMENT ON COLUMN customers.inscricao_municipal IS 'Inscrição Municipal do cliente';
