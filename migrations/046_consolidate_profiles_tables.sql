-- ⚠️ DEPRECATED: Este script está removido pois tenta usar colunas que não existem
-- O script original tenta adicionar colunas de endereço em user_profiles
-- Mas endereços devem SEMPRE estar apenas na tabela addresses

-- Script antigo removido - NÃO EXECUTAR
BEGIN;
  -- Consolidação de profiles foi feita, mas SEM colunas de endereço
  -- Endereços estão em tabela separada (addresses) com user_id
END;

-- Nota: Se você ainda tem a tabela profiles, remova com:
-- DROP TABLE IF EXISTS profiles CASCADE;
