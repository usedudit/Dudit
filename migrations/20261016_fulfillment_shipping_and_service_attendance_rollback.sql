-- Rollback: 20261016_fulfillment_shipping_and_service_attendance
BEGIN;

DROP TABLE IF EXISTS public.service_attendance_settings;

ALTER TABLE public.services
  DROP CONSTRAINT IF EXISTS services_service_travel_fee_mode_check;
ALTER TABLE public.services
  DROP COLUMN IF EXISTS service_max_km,
  DROP COLUMN IF EXISTS service_travel_fee_mode,
  DROP COLUMN IF EXISTS service_free_travel_km,
  DROP COLUMN IF EXISTS service_travel_flat_fee,
  DROP COLUMN IF EXISTS service_travel_per_km,
  DROP COLUMN IF EXISTS service_enforce_area;

ALTER TABLE public.services
  DROP CONSTRAINT IF EXISTS services_fulfillment_modes_check;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_fulfillment_modes_check;

ALTER TABLE public.recurring_plans
  DROP CONSTRAINT IF EXISTS recurring_plans_fulfillment_modes_check;
ALTER TABLE public.recurring_plans
  ADD CONSTRAINT recurring_plans_fulfillment_modes_check
  CHECK (
    fulfillment_modes <@ ARRAY['delivery', 'pickup']::TEXT[]
    AND array_length(fulfillment_modes, 1) >= 1
  );

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_fulfillment_mode_check;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_fulfillment_mode_check
  CHECK (
    fulfillment_mode IS NULL
    OR fulfillment_mode IN ('delivery', 'pickup', 'on_site', 'customer_location')
  );

ALTER TABLE public.cart_items
  DROP CONSTRAINT IF EXISTS cart_items_fulfillment_mode_check;
ALTER TABLE public.cart_items
  ADD CONSTRAINT cart_items_fulfillment_mode_check
  CHECK (
    fulfillment_mode IS NULL
    OR fulfillment_mode IN ('delivery', 'pickup', 'on_site', 'customer_location')
  );

-- Colunas de delivery_settings: mantidas (já existem no banco de runtime).

COMMIT;
