-- migration: 1002_add_status_to_metadata.sql

ALTER TABLE public.product_categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.storage_locations ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
