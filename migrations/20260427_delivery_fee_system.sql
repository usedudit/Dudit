-- Delivery fee system: settings, time rules, and fee persistence.

CREATE TABLE IF NOT EXISTS public.delivery_settings (
  partner_id uuid PRIMARY KEY REFERENCES public.partners(id) ON DELETE CASCADE,
  base_fee numeric(10,2) NOT NULL DEFAULT 0,
  included_km numeric(10,2) NOT NULL DEFAULT 0,
  extra_km_price numeric(10,2) NOT NULL DEFAULT 0,
  max_delivery_km numeric(10,2) NULL,
  is_delivery_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.delivery_fee_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  start_time time NOT NULL,
  end_time time NOT NULL,
  type text NOT NULL CHECK (type IN ('fixed', 'multiplier')),
  value numeric(10,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_fee_rules_partner_active
  ON public.delivery_fee_rules(partner_id, is_active, start_time, end_time);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_fee numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS distance_km numeric(10,2),
  ADD COLUMN IF NOT EXISTS delivery_breakdown jsonb;

ALTER TABLE public.pre_sales
  ADD COLUMN IF NOT EXISTS distance_km numeric(10,2),
  ADD COLUMN IF NOT EXISTS delivery_breakdown jsonb;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS delivery_fee numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS distance_km numeric(10,2),
  ADD COLUMN IF NOT EXISTS delivery_breakdown jsonb;

ALTER TABLE public.delivery_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_fee_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'delivery_settings' AND policyname = 'delivery_settings_partner_rw'
  ) THEN
    CREATE POLICY delivery_settings_partner_rw
      ON public.delivery_settings
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'delivery_fee_rules' AND policyname = 'delivery_fee_rules_partner_rw'
  ) THEN
    CREATE POLICY delivery_fee_rules_partner_rw
      ON public.delivery_fee_rules
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
