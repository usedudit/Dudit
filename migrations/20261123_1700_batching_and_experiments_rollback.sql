-- ============================================================================
-- Rollback: 20261123_1700_batching_and_experiments_rollback.sql
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_dispatch_health_metrics(integer, text);
DROP FUNCTION IF EXISTS public.get_dispatch_experiment_variant(text, uuid);
DROP TABLE IF EXISTS public.dispatch_experiments;
DROP FUNCTION IF EXISTS public.find_batch_candidate(uuid);
