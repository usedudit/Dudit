-- Add diagnosis column to service_orders table
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS diagnosis TEXT;
