-- ============================================================================
-- Rollback: 20261123_1500_tier_accept_decline_rollback.sql
-- Para restaurar get_available_delivery_offers e accept_delivery_offer da Fase 1,
-- reaplique migrations/20261123_1200_offer_eta_and_vehicle_compat.sql e
-- migrations/20261123_1000_dispatch_fase0_radius_and_eligibility.sql.
-- ============================================================================

DROP FUNCTION IF EXISTS public.authorize_delivery_bonus(uuid, numeric, text, uuid);
DROP FUNCTION IF EXISTS public.decline_delivery_offer(uuid, uuid);
