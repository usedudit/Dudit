-- ============================================================================
-- Rollback: 20261123_1000_dispatch_fase0_radius_and_eligibility_rollback.sql
-- Reverte as colunas adicionadas na Fase 0.
-- Para restaurar a versão anterior de get_available_delivery_offers, reaplique:
--   migrations/20261112_delivery_offers_privacy_hardening.sql
-- ============================================================================

ALTER TABLE public.delivery_drivers
  DROP CONSTRAINT IF EXISTS delivery_drivers_capacity_orders_check,
  DROP CONSTRAINT IF EXISTS delivery_drivers_max_pickup_km_check,
  DROP COLUMN IF EXISTS reject_streak,
  DROP COLUMN IF EXISTS cooldown_until,
  DROP COLUMN IF EXISTS capacity_orders,
  DROP COLUMN IF EXISTS has_thermal_bag,
  DROP COLUMN IF EXISTS max_pickup_km;

ALTER TABLE public.orders
  DROP COLUMN IF EXISTS package_weight_kg,
  DROP COLUMN IF EXISTS package_volume_l;

ALTER TABLE public.delivery_assignments
  DROP COLUMN IF EXISTS dimensions_unknown;
