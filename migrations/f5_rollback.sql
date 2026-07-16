-- ============================================================================
-- Fase 5 - Rollback
-- ============================================================================
-- Reverte todas as alterações da Fase 5 (Store Products).
-- Perde os dados de store_products.
-- ============================================================================

BEGIN;

DROP TABLE IF EXISTS store_products CASCADE;

COMMIT;
