-- POS variant support: explicit item shape fields on sale_items

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS variant_name TEXT NULL;

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS total_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_price >= 0);

UPDATE public.sale_items
SET total_price = COALESCE(subtotal, unit_price * quantity)
WHERE total_price IS NULL OR total_price = 0;
