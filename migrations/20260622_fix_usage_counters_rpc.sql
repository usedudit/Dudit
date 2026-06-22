-- ============================================================================
-- Fix: restore column whitelist on increment/decrement usage counter RPCs
-- Created: 2026-06-22
--
-- Context:
--   Migration 20260504 removed the column whitelist from both RPCs when it
--   replaced them with simpler EXECUTE format() calls. This re-adds strict
--   column validation to prevent SQL injection or accidental column writes.
--
--   Also ensures service_orders_month_reset column exists (idempotent).
-- ============================================================================

-- Ensure column exists (no-op if already present from 20260505)
ALTER TABLE public.usage_counters
  ADD COLUMN IF NOT EXISTS service_orders_month_reset timestamptz DEFAULT now();

-- ────────────────────────────────────────────────────────────────────────────
-- increment_usage_counter with whitelist validation
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_usage_counter(
  p_partner_id uuid,
  p_column_name text,
  p_amount int DEFAULT 1
)
RETURNS void AS $$
BEGIN
  IF p_column_name NOT IN (
    'images_count',
    'quotes_month_count',
    'orders_month_count',
    'appointments_month_count',
    'service_orders_month_count'
  ) THEN
    RAISE EXCEPTION 'Invalid counter name: %', p_column_name;
  END IF;

  EXECUTE format(
    'INSERT INTO public.usage_counters (partner_id, %I)
     VALUES ($1, $2)
     ON CONFLICT (partner_id)
     DO UPDATE SET %I = usage_counters.%I + $2, updated_at = now()',
    p_column_name, p_column_name, p_column_name
  ) USING p_partner_id, p_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ────────────────────────────────────────────────────────────────────────────
-- decrement_usage_counter with whitelist validation
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION decrement_usage_counter(
  p_partner_id uuid,
  p_column_name text,
  p_amount int DEFAULT 1
)
RETURNS void AS $$
BEGIN
  IF p_column_name NOT IN (
    'images_count',
    'quotes_month_count',
    'orders_month_count',
    'appointments_month_count',
    'service_orders_month_count'
  ) THEN
    RAISE EXCEPTION 'Invalid counter name: %', p_column_name;
  END IF;

  EXECUTE format(
    'UPDATE public.usage_counters SET %I = GREATEST(0, %I - $1), updated_at = now() WHERE partner_id = $2',
    p_column_name, p_column_name
  ) USING p_amount, p_partner_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
