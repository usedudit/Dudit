-- ============================================================================
-- Employee commissions (seller + delivery)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.employee_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.partner_users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('seller', 'delivery')),
  commission_type text NOT NULL,
  value numeric(10,2) NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_commissions_value_non_negative CHECK (value >= 0)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employee_commissions_type_role_check'
  ) THEN
    ALTER TABLE public.employee_commissions
      ADD CONSTRAINT employee_commissions_type_role_check CHECK (
        (role = 'seller' AND commission_type IN ('none', 'percentage_sale', 'fixed_per_sale'))
        OR
        (role = 'delivery' AND commission_type IN ('fixed_per_delivery', 'percentage_delivery_fee', 'distance_based'))
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_commissions_partner_user_role
  ON public.employee_commissions(partner_id, user_id, role);

CREATE INDEX IF NOT EXISTS idx_employee_commissions_partner_role
  ON public.employee_commissions(partner_id, role);

ALTER TABLE public.employee_commissions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'employee_commissions' AND policyname = 'employee_commissions_select_partner_users'
  ) THEN
    CREATE POLICY employee_commissions_select_partner_users
      ON public.employee_commissions
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
    WHERE schemaname = 'public' AND tablename = 'employee_commissions' AND policyname = 'employee_commissions_insert_partner_users'
  ) THEN
    CREATE POLICY employee_commissions_insert_partner_users
      ON public.employee_commissions
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
    WHERE schemaname = 'public' AND tablename = 'employee_commissions' AND policyname = 'employee_commissions_update_partner_users'
  ) THEN
    CREATE POLICY employee_commissions_update_partner_users
      ON public.employee_commissions
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
    WHERE schemaname = 'public' AND tablename = 'employee_commissions' AND policyname = 'employee_commissions_delete_partner_users'
  ) THEN
    CREATE POLICY employee_commissions_delete_partner_users
      ON public.employee_commissions
      FOR DELETE
      USING (
        partner_id IN (
          SELECT pu.partner_id
          FROM public.partner_users pu
          WHERE pu.user_id = auth.uid()
        )
      );
  END IF;
END $$;
