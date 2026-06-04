-- Phase 2: Commerce capabilities (fulfillment per line, payment requirement)
-- Backward compatible: defaults preserve current behavior.

-- -----------------------------------------------------------------------------
-- Catalog: fulfillment_modes + service payment_requirement
-- -----------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS fulfillment_modes TEXT[] NOT NULL
    DEFAULT ARRAY['delivery', 'pickup']::TEXT[];

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS fulfillment_modes TEXT[] NOT NULL
    DEFAULT ARRAY['on_site']::TEXT[];

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS payment_requirement TEXT NOT NULL DEFAULT 'full_payment'
    CHECK (payment_requirement IN ('full_payment', 'deposit_only', 'pay_on_service'));

-- -----------------------------------------------------------------------------
-- Cart / order lines: per-line fulfillment
-- -----------------------------------------------------------------------------
ALTER TABLE public.cart_items
  ADD COLUMN IF NOT EXISTS fulfillment_mode TEXT NULL
    CHECK (
      fulfillment_mode IS NULL
      OR fulfillment_mode IN ('delivery', 'pickup', 'on_site', 'customer_location')
    );

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS line_type TEXT NULL
    CHECK (
      line_type IS NULL
      OR line_type IN ('product', 'service_booking', 'subscription')
    );

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS fulfillment_mode TEXT NULL
    CHECK (
      fulfillment_mode IS NULL
      OR fulfillment_mode IN ('delivery', 'pickup', 'on_site', 'customer_location')
    );

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS service_id UUID NULL REFERENCES public.services(id) ON DELETE SET NULL;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS recurring_plan_id UUID NULL REFERENCES public.recurring_plans(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- Appointments: fulfillment + reschedule flag (slot conflict after payment)
-- -----------------------------------------------------------------------------
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS fulfillment_mode TEXT NULL
    CHECK (
      fulfillment_mode IS NULL
      OR fulfillment_mode IN ('on_site', 'customer_location')
    );

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS needs_reschedule BOOLEAN NOT NULL DEFAULT FALSE;

-- -----------------------------------------------------------------------------
-- Subscriptions: track vitrine origin for reporting (not fulfillment on plan)
-- -----------------------------------------------------------------------------
ALTER TABLE public.recurring_subscriptions
  ADD COLUMN IF NOT EXISTS sales_channel TEXT NOT NULL DEFAULT 'booking'
    CHECK (sales_channel IN ('booking', 'online_storefront'));

-- -----------------------------------------------------------------------------
-- Backfill product fulfillment defaults
-- -----------------------------------------------------------------------------
UPDATE public.products
SET fulfillment_modes = ARRAY['pickup']::TEXT[]
WHERE product_type = 'Digital'
  AND fulfillment_modes = ARRAY['delivery', 'pickup']::TEXT[];

UPDATE public.products
SET fulfillment_modes = ARRAY['delivery', 'pickup']::TEXT[]
WHERE (product_type = 'Físico' OR product_type IS NULL)
  AND fulfillment_modes IS NOT NULL;

COMMENT ON COLUMN public.products.fulfillment_modes IS 'Allowed modes: delivery, pickup';
COMMENT ON COLUMN public.services.fulfillment_modes IS 'Allowed modes: on_site, customer_location';
COMMENT ON COLUMN public.services.payment_requirement IS 'full_payment | deposit_only | pay_on_service';
COMMENT ON COLUMN public.cart_items.fulfillment_mode IS 'Buyer-selected mode for this line';
COMMENT ON COLUMN public.recurring_subscriptions.sales_channel IS 'online_storefront when sold via vitrine';
