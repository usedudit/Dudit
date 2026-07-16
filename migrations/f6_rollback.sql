-- ============================================================================
-- Fase 6 - Rollback
-- ============================================================================
-- Reverte todas as alterações da Fase 6 (Store Services).
-- Perde os dados de store_services.
-- ============================================================================

BEGIN;

DROP TABLE IF EXISTS store_services CASCADE;

COMMIT;
