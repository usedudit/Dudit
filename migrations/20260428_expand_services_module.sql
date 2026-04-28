-- Expand services module

ALTER TABLE public.services ADD COLUMN IF NOT EXISTS sku TEXT UNIQUE;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'Serviço';
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS show_in_marketplace BOOLEAN DEFAULT false;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS price_type TEXT DEFAULT 'fixed'; -- fixed, starting_at, free
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS billing_unit TEXT DEFAULT 'per_service'; -- per_service, per_hour, per_day, per_week, per_month, per_year
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS subcategory TEXT;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS resources JSONB DEFAULT '[]'::jsonb; -- { id/name, quantity, usage_type }
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS service_type TEXT DEFAULT 'in_person'; -- in_person, online, hybrid
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS warranty TEXT;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS technical_details JSONB;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS highlight_service BOOLEAN DEFAULT false;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS assigned_staff JSONB DEFAULT '{"all": true, "staff_ids": []}'::jsonb;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS buffer_minutes INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_services_partner_id ON public.services(partner_id);
CREATE INDEX IF NOT EXISTS idx_services_store_id_created ON public.services(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_services_sku ON public.services(sku);

-- RLS for services is mostly set in 001_create_database_schema.sql 
-- Ensure the updated_at trigger exists
CREATE OR REPLACE FUNCTION public.set_services_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_services_updated_at ON public.services;
CREATE TRIGGER trg_services_updated_at
BEFORE UPDATE ON public.services
FOR EACH ROW
EXECUTE FUNCTION public.set_services_updated_at();
