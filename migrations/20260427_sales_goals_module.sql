-- ============================================================================
-- Sales Goals + Progress (Metas de vendedores)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sales_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  name text NOT NULL,
  period_type text NOT NULL CHECK (period_type IN ('monthly', 'weekly')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  target_amount numeric(12,2) NOT NULL CHECK (target_amount > 0),
  bonus_type text NOT NULL CHECK (bonus_type IN ('fixed', 'percentage')),
  bonus_value numeric(12,2) NOT NULL CHECK (bonus_value >= 0),
  applies_to text NOT NULL CHECK (applies_to IN ('all', 'user')),
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_goals_date_range_check CHECK (end_date >= start_date),
  CONSTRAINT sales_goals_user_scope_check CHECK (
    (applies_to = 'all' AND user_id IS NULL) OR
    (applies_to = 'user' AND user_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.sales_goal_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES public.sales_goals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_amount numeric(12,2) NOT NULL DEFAULT 0,
  achieved boolean NOT NULL DEFAULT false,
  achieved_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_goal_progress_amount_check CHECK (current_amount >= 0),
  CONSTRAINT sales_goal_progress_unique_goal_user UNIQUE (goal_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_sales_goals_partner_created
  ON public.sales_goals(partner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_goals_partner_user
  ON public.sales_goals(partner_id, user_id);

CREATE INDEX IF NOT EXISTS idx_sales_goal_progress_goal
  ON public.sales_goal_progress(goal_id);

CREATE INDEX IF NOT EXISTS idx_sales_goal_progress_user
  ON public.sales_goal_progress(user_id);

ALTER TABLE public.sales_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_goal_progress ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sales_goals' AND policyname = 'sales_goals_select_partner_users'
  ) THEN
    CREATE POLICY sales_goals_select_partner_users
      ON public.sales_goals
      FOR SELECT
      USING (
        partner_id IN (
          SELECT pu.partner_id FROM public.partner_users pu WHERE pu.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sales_goals' AND policyname = 'sales_goals_insert_partner_users'
  ) THEN
    CREATE POLICY sales_goals_insert_partner_users
      ON public.sales_goals
      FOR INSERT
      WITH CHECK (
        partner_id IN (
          SELECT pu.partner_id FROM public.partner_users pu WHERE pu.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sales_goals' AND policyname = 'sales_goals_update_partner_users'
  ) THEN
    CREATE POLICY sales_goals_update_partner_users
      ON public.sales_goals
      FOR UPDATE
      USING (
        partner_id IN (
          SELECT pu.partner_id FROM public.partner_users pu WHERE pu.user_id = auth.uid()
        )
      )
      WITH CHECK (
        partner_id IN (
          SELECT pu.partner_id FROM public.partner_users pu WHERE pu.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sales_goals' AND policyname = 'sales_goals_delete_partner_users'
  ) THEN
    CREATE POLICY sales_goals_delete_partner_users
      ON public.sales_goals
      FOR DELETE
      USING (
        partner_id IN (
          SELECT pu.partner_id FROM public.partner_users pu WHERE pu.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sales_goal_progress' AND policyname = 'sales_goal_progress_select_partner_users'
  ) THEN
    CREATE POLICY sales_goal_progress_select_partner_users
      ON public.sales_goal_progress
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.sales_goals sg
          WHERE sg.id = sales_goal_progress.goal_id
            AND sg.partner_id IN (
              SELECT pu.partner_id FROM public.partner_users pu WHERE pu.user_id = auth.uid()
            )
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sales_goal_progress' AND policyname = 'sales_goal_progress_insert_partner_users'
  ) THEN
    CREATE POLICY sales_goal_progress_insert_partner_users
      ON public.sales_goal_progress
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.sales_goals sg
          WHERE sg.id = sales_goal_progress.goal_id
            AND sg.partner_id IN (
              SELECT pu.partner_id FROM public.partner_users pu WHERE pu.user_id = auth.uid()
            )
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sales_goal_progress' AND policyname = 'sales_goal_progress_update_partner_users'
  ) THEN
    CREATE POLICY sales_goal_progress_update_partner_users
      ON public.sales_goal_progress
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1
          FROM public.sales_goals sg
          WHERE sg.id = sales_goal_progress.goal_id
            AND sg.partner_id IN (
              SELECT pu.partner_id FROM public.partner_users pu WHERE pu.user_id = auth.uid()
            )
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.sales_goals sg
          WHERE sg.id = sales_goal_progress.goal_id
            AND sg.partner_id IN (
              SELECT pu.partner_id FROM public.partner_users pu WHERE pu.user_id = auth.uid()
            )
        )
      );
  END IF;
END $$;
