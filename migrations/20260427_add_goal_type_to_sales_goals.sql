-- Add goal_type to sales_goals table
ALTER TABLE public.sales_goals 
ADD COLUMN IF NOT EXISTS goal_type text NOT NULL DEFAULT 'sales' 
CHECK (goal_type IN ('sales', 'service_orders', 'both'));

COMMENT ON COLUMN public.sales_goals.goal_type IS 'Define se a meta conta apenas vendas, apenas ordens de serviço ou ambos.';
