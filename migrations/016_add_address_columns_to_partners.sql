-- ⚠️ DEPRECATED: Este script não deve ser executado mais
-- As colunas de endereço foram removidas da tabela partners
-- Os endereços agora estão consolidados na tabela addresses com referência partner_id
-- Este arquivo é mantido apenas para referência histórica

-- Script antigo (não executar):
-- Adiciona colunas de endereço separadas para a tabela partners
-- ALTER TABLE partners
-- ADD COLUMN IF NOT EXISTS zip_code TEXT,
-- ADD COLUMN IF NOT EXISTS street TEXT,
-- ADD COLUMN IF NOT EXISTS number TEXT,
-- ADD COLUMN IF NOT EXISTS complement TEXT,
-- ADD COLUMN IF NOT EXISTS neighborhood TEXT,
-- ADD COLUMN IF NOT EXISTS city TEXT,
-- ADD COLUMN IF NOT EXISTS state TEXT;

-- Removido: as colunas acima não devem existir na tabela partners
-- Use a tabela addresses com partner_id para dados de endereço
