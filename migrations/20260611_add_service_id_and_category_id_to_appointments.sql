-- Add service_id and category_id columns to appointments table
ALTER TABLE public.appointments 
  ADD COLUMN IF NOT EXISTS service_id UUID NULL REFERENCES public.services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_id UUID NULL REFERENCES public.service_categories(id) ON DELETE SET NULL;
