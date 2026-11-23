-- ============================================================================
-- Rollback: 20261123_1200_offer_eta_and_vehicle_compat_rollback.sql
-- Para restaurar get_available_delivery_offers da Fase 0, reaplique:
--   migrations/20261123_1000_dispatch_fase0_radius_and_eligibility.sql
-- ============================================================================

DROP FUNCTION IF EXISTS public.vehicle_compatible(text, numeric, numeric);
DROP FUNCTION IF EXISTS public.estimate_travel_min(numeric, text, integer);
DROP FUNCTION IF EXISTS public.estimate_road_km(numeric, numeric);
DROP TABLE IF EXISTS public.delivery_vehicle_speeds;
