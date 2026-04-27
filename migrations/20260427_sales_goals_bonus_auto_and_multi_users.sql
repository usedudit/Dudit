ALTER TABLE public.sales_goals
  ADD COLUMN IF NOT EXISTS assigned_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS auto_launch_bonus boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bonus_account_id uuid NULL REFERENCES public.finance_accounts(id) ON DELETE SET NULL;

UPDATE public.sales_goals
SET assigned_user_ids = ARRAY[user_id]
WHERE user_id IS NOT NULL
  AND (assigned_user_ids IS NULL OR cardinality(assigned_user_ids) = 0);

CREATE INDEX IF NOT EXISTS idx_sales_goals_partner_assigned_users
  ON public.sales_goals USING gin (assigned_user_ids);
