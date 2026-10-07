BEGIN;

ALTER TABLE public.recurring_plans
  DROP CONSTRAINT IF EXISTS recurring_plans_fulfillment_modes_check;

ALTER TABLE public.recurring_plans
  DROP COLUMN IF EXISTS fulfillment_modes;

COMMIT;
