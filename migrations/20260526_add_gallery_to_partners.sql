-- Add gallery column to partners table if not exists
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS gallery jsonb DEFAULT '[]'::jsonb;
