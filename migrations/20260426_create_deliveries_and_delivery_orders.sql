-- ============================================================================
-- Delivery system (MVP UX + future-ready backend)
-- - deliveries (global delivery)
-- - delivery_orders (per-order link/status)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  delivery_person_id uuid NULL REFERENCES public.partner_users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  distance_km numeric(10,2) NULL,
  estimated_duration_minutes integer NULL,
  started_at timestamptz NULL,
  delivered_at timestamptz NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS partner_id uuid,
  ADD COLUMN IF NOT EXISTS delivery_person_id uuid,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS distance_km numeric(10,2),
  ADD COLUMN IF NOT EXISTS estimated_duration_minutes integer,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

ALTER TABLE public.deliveries
  ALTER COLUMN status SET DEFAULT 'pending';

UPDATE public.deliveries SET status = 'pending' WHERE status IS NULL;
UPDATE public.deliveries SET created_at = now() WHERE created_at IS NULL;

ALTER TABLE public.deliveries
  ALTER COLUMN partner_id SET NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'deliveries_partner_id_fkey'
      AND conrelid = 'public.deliveries'::regclass
  ) THEN
    ALTER TABLE public.deliveries
      ADD CONSTRAINT deliveries_partner_id_fkey
      FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'deliveries_delivery_person_id_fkey'
      AND conrelid = 'public.deliveries'::regclass
  ) THEN
    ALTER TABLE public.deliveries
      ADD CONSTRAINT deliveries_delivery_person_id_fkey
      FOREIGN KEY (delivery_person_id) REFERENCES public.partner_users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.delivery_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  position integer NULL,
  status text NOT NULL DEFAULT 'pending',
  delivered_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Backfill legacy deliveries.order_id into delivery_orders when needed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deliveries' AND column_name = 'order_id'
  ) THEN
    INSERT INTO public.delivery_orders (delivery_id, order_id, position, status, delivered_at, created_at)
    SELECT
      d.id,
      d.order_id,
      1,
      CASE WHEN d.status = 'delivered' THEN 'delivered' ELSE 'pending' END,
      d.delivered_at,
      COALESCE(d.created_at, now())
    FROM public.deliveries d
    WHERE d.order_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.delivery_orders do2
        WHERE do2.delivery_id = d.id
          AND do2.order_id = d.order_id
      );

    ALTER TABLE public.deliveries DROP COLUMN IF EXISTS order_id;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_orders_unique
  ON public.delivery_orders(delivery_id, order_id);

CREATE INDEX IF NOT EXISTS idx_deliveries_partner
  ON public.deliveries(partner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_delivery_orders_delivery
  ON public.delivery_orders(delivery_id);

CREATE INDEX IF NOT EXISTS idx_delivery_orders_order
  ON public.delivery_orders(order_id);

ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'deliveries' AND policyname = 'deliveries_select_partner_users'
  ) THEN
    CREATE POLICY deliveries_select_partner_users
      ON public.deliveries
      FOR SELECT
      USING (
        partner_id IN (
          SELECT pu.partner_id
          FROM public.partner_users pu
          WHERE pu.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'deliveries' AND policyname = 'deliveries_insert_partner_users'
  ) THEN
    CREATE POLICY deliveries_insert_partner_users
      ON public.deliveries
      FOR INSERT
      WITH CHECK (
        partner_id IN (
          SELECT pu.partner_id
          FROM public.partner_users pu
          WHERE pu.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'deliveries' AND policyname = 'deliveries_update_partner_users'
  ) THEN
    CREATE POLICY deliveries_update_partner_users
      ON public.deliveries
      FOR UPDATE
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'delivery_orders' AND policyname = 'delivery_orders_select_partner_users'
  ) THEN
    CREATE POLICY delivery_orders_select_partner_users
      ON public.delivery_orders
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.deliveries d
          WHERE d.id = delivery_orders.delivery_id
            AND d.partner_id IN (
              SELECT pu.partner_id
              FROM public.partner_users pu
              WHERE pu.user_id = auth.uid()
            )
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'delivery_orders' AND policyname = 'delivery_orders_insert_partner_users'
  ) THEN
    CREATE POLICY delivery_orders_insert_partner_users
      ON public.delivery_orders
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.deliveries d
          WHERE d.id = delivery_orders.delivery_id
            AND d.partner_id IN (
              SELECT pu.partner_id
              FROM public.partner_users pu
              WHERE pu.user_id = auth.uid()
            )
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'delivery_orders' AND policyname = 'delivery_orders_update_partner_users'
  ) THEN
    CREATE POLICY delivery_orders_update_partner_users
      ON public.delivery_orders
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1
          FROM public.deliveries d
          WHERE d.id = delivery_orders.delivery_id
            AND d.partner_id IN (
              SELECT pu.partner_id
              FROM public.partner_users pu
              WHERE pu.user_id = auth.uid()
            )
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.deliveries d
          WHERE d.id = delivery_orders.delivery_id
            AND d.partner_id IN (
              SELECT pu.partner_id
              FROM public.partner_users pu
              WHERE pu.user_id = auth.uid()
            )
        )
      );
  END IF;
END $$;
