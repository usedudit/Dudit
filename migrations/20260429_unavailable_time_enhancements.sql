-- Migration: Add recurrence support and dedicated storage for unavailable time types
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS recurrence_rule TEXT;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS recurrence_group_id UUID;

-- 1. Support via Services Table (as requested for integration with services catalog)
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS is_unavailable_type BOOLEAN DEFAULT FALSE;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS icon_name TEXT;

-- 2. Dedicated Table for Unavailable Types (Templates)
CREATE TABLE IF NOT EXISTS public.unavailable_types (
    id uuid primary key default gen_random_uuid(),
    partner_id uuid not null references public.partners(id) on delete cascade,
    name text not null,
    default_duration integer not null default 60,
    icon_name text null,
    color_hex text null,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- RLS for unavailable_types
ALTER TABLE public.unavailable_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY unavailable_types_select ON public.unavailable_types
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.partner_users pu
    WHERE pu.partner_id = unavailable_types.partner_id
      AND pu.user_id = auth.uid()
  )
);

CREATE POLICY unavailable_types_modify ON public.unavailable_types
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.partner_users pu
    WHERE pu.partner_id = unavailable_types.partner_id
      AND pu.user_id = auth.uid()
  )
);

-- Updated at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_unavailable_types_updated_at ON public.unavailable_types;
CREATE TRIGGER trg_unavailable_types_updated_at
BEFORE UPDATE ON public.unavailable_types
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_appointments_recurrence_group ON public.appointments(recurrence_group_id);
CREATE INDEX IF NOT EXISTS idx_unavailable_types_partner_id ON public.unavailable_types(partner_id);
CREATE INDEX IF NOT EXISTS idx_services_is_unavailable ON public.services(partner_id, is_unavailable_type);
