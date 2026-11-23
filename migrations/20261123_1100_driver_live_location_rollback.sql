-- ============================================================================
-- Rollback: 20261123_1100_driver_live_location_rollback.sql
-- ============================================================================

DROP FUNCTION IF EXISTS public.upsert_my_driver_location(numeric, numeric, numeric, numeric, numeric, text);
DROP VIEW IF EXISTS public.delivery_driver_presence;
DROP TABLE IF EXISTS public.delivery_driver_locations;
