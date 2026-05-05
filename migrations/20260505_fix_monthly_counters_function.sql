-- ============================================================================
-- Fix: conditional monthly counters reset
-- Created: 2026-05-05
--
-- Goal:
-- - Ensure quotes_month_count / orders_month_count / appointments_month_count
--   reset only when their *_month_reset timestamps are from previous month.
-- - Prevent accidental frequent resets that would make monthly counters appear
--   to never increase.
-- ============================================================================

ALTER TABLE public.usage_counters
  ADD COLUMN IF NOT EXISTS service_orders_month_reset timestamptz DEFAULT now();

CREATE OR REPLACE FUNCTION reset_monthly_counters()
RETURNS void AS $$
BEGIN
  UPDATE public.usage_counters
  SET
    quotes_month_count = 0,
    quotes_month_reset = now(),

    orders_month_count = 0,
    orders_month_reset = now(),

    appointments_month_count = 0,
    appointments_month_reset = now(),

    service_orders_month_count = 0,
    service_orders_month_reset = now(),

    updated_at = now()
  WHERE
    (quotes_month_reset IS NULL OR quotes_month_reset < date_trunc('month', now()))
    OR (orders_month_reset IS NULL OR orders_month_reset < date_trunc('month', now()))
    OR (appointments_month_reset IS NULL OR appointments_month_reset < date_trunc('month', now()))
    OR (service_orders_month_reset IS NULL OR service_orders_month_reset < date_trunc('month', now()));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

