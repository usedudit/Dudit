-- Add bonus_distribution field to sales_goals
ALTER TABLE public.sales_goals
ADD COLUMN IF NOT EXISTS bonus_distribution text NOT NULL DEFAULT 'equal'
CHECK (bonus_distribution IN ('equal', 'proportional'));
