-- Adiciona suporte a especificações técnicas na OS
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS specifications JSONB DEFAULT '[]'::jsonb;
