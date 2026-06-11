-- Add is_gift and original_price columns to order_items
ALTER TABLE public.order_items 
  ADD COLUMN IF NOT EXISTS is_gift boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_price numeric(14,2) NULL;
