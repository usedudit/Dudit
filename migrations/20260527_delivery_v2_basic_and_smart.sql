-- ============================================================================
-- Delivery v2 (Basic + Smart groundwork)
-- Goals:
-- - Keep backward compatibility with existing deliveries/delivery_orders
-- - Add delivery numbering, departure/completion timestamps, creator, notes, type
-- - Add order-level delivery timestamps
-- - Add route suggestion cache metadata + coordinates cache table
-- - Add delivery audit log support (uses existing audit_logs timeline service)
-- ============================================================================

-- 1) Deliveries: add missing columns (non-destructive)
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS delivery_number bigint,
  ADD COLUMN IF NOT EXISTS departure_time timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_type text,
  ADD COLUMN IF NOT EXISTS delivery_order jsonb,
  ADD COLUMN IF NOT EXISTS route_suggestion_generated_at timestamptz;

-- Best-effort backfill from legacy columns
UPDATE public.deliveries
SET
  departure_time = COALESCE(departure_time, started_at),
  completed_at = COALESCE(completed_at, delivered_at)
WHERE departure_time IS NULL
   OR completed_at IS NULL;

-- 2) Per-partner delivery number sequencing (safe defaults)
-- Use a simple (partner_id, delivery_number) uniqueness when present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_deliveries_partner_delivery_number_unique'
  ) THEN
    CREATE UNIQUE INDEX idx_deliveries_partner_delivery_number_unique
      ON public.deliveries(partner_id, delivery_number)
      WHERE delivery_number IS NOT NULL;
  END IF;
END $$;

-- 3) Orders: delivery timestamps (requested fields)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_departure_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_arrived_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_completed_at timestamptz;

-- 4) Address coordinates cache (avoid repeated geocoding)
-- This is intentionally simple: keyed by normalized address text + partner scope.
CREATE TABLE IF NOT EXISTS public.address_coordinates_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  address_text text NOT NULL,
  latitude numeric(10,7) NOT NULL,
  longitude numeric(10,7) NOT NULL,
  provider text NOT NULL DEFAULT 'nominatim',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_address_coordinates_cache_partner_address_unique
  ON public.address_coordinates_cache(partner_id, address_text);

ALTER TABLE public.address_coordinates_cache ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'address_coordinates_cache' AND policyname = 'address_coordinates_cache_partner_rw'
  ) THEN
    CREATE POLICY address_coordinates_cache_partner_rw
      ON public.address_coordinates_cache
      FOR ALL
      USING (
        partner_id IN (
          SELECT pu.partner_id
          FROM public.partner_users pu
          WHERE pu.user_id = auth.uid()
        )
      )
      WITH CHECK (
        partner_id IN (
          SELECT pu.partner_id
          FROM public.partner_users pu
          WHERE pu.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- 5) Helpful indexes for dashboards and joins
CREATE INDEX IF NOT EXISTS idx_deliveries_partner_status_created
  ON public.deliveries(partner_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_partner_delivery_timestamps
  ON public.orders(partner_id, delivery_departure_at DESC, delivery_completed_at DESC);

DO $$
BEGIN
  RAISE NOTICE '✅ delivery v2 migration applied.';
END $$;

