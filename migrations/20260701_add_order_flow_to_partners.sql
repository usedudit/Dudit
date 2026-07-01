-- Add order_flow column to partners table
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS order_flow VARCHAR(20) DEFAULT 'dudit';
