-- Preparation-time support for pickup/delivery order estimates
-- Adds persistent fields used by marketplace, POS and manual ERP order creation.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS preparation_time_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_ready_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS pickup_window_start timestamptz NULL,
  ADD COLUMN IF NOT EXISTS pickup_window_end timestamptz NULL,
  ADD COLUMN IF NOT EXISTS estimated_delivery_at timestamptz NULL;

-- Safety: preparation time must never be negative.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_preparation_time_minutes_non_negative'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_preparation_time_minutes_non_negative
      CHECK (preparation_time_minutes >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.orders.preparation_time_minutes IS
  'Maximum preparation time in minutes considering all order items.';

COMMENT ON COLUMN public.orders.estimated_ready_at IS
  'Estimated datetime when order is ready, adjusted to business hours.';

COMMENT ON COLUMN public.orders.pickup_window_start IS
  'Optional pickup window start datetime.';

COMMENT ON COLUMN public.orders.pickup_window_end IS
  'Optional pickup window end datetime.';

COMMENT ON COLUMN public.orders.estimated_delivery_at IS
  'Optional estimated delivery datetime (ready_at + delivery estimate).';

-- Useful for upcoming dashboards/filters and operational queues.
CREATE INDEX IF NOT EXISTS idx_orders_estimated_ready_at
  ON public.orders (estimated_ready_at DESC)
  WHERE estimated_ready_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_pickup_window_start
  ON public.orders (pickup_window_start DESC)
  WHERE pickup_window_start IS NOT NULL;
