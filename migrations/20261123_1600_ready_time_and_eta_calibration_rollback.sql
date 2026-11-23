-- ============================================================================
-- Rollback: 20261123_1600_ready_time_and_eta_calibration_rollback.sql
-- ============================================================================

DROP TRIGGER IF EXISTS trg_update_store_ready_estimate ON public.delivery_assignments;
DROP FUNCTION IF EXISTS public.trg_fn_update_store_ready_estimate();
DROP FUNCTION IF EXISTS public.get_eta_calibration_factor(uuid, text, integer);
DROP FUNCTION IF EXISTS public.get_store_ready_min(uuid, integer);
DROP TABLE IF EXISTS public.eta_calibration;
DROP TABLE IF EXISTS public.store_ready_estimates;
