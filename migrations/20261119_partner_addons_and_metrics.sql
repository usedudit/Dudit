-- Migration: Add partner_addons and partner_addon_events tables
-- Dudit App Store / Monetization Addons
-- (Carrinho Abandonado, Order Bump, Retorno de Serviços, Aniversário de Clientes)

CREATE TABLE IF NOT EXISTS public.partner_addons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    addon_slug TEXT NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(partner_id, addon_slug)
);

CREATE INDEX IF NOT EXISTS idx_partner_addons_partner_slug 
ON public.partner_addons(partner_id, addon_slug);

CREATE TABLE IF NOT EXISTS public.partner_addon_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    addon_slug TEXT NOT NULL,
    event_type TEXT NOT NULL, -- 'sent', 'viewed', 'clicked', 'converted'
    entity_type TEXT,        -- 'cart', 'order', 'appointment', 'customer'
    entity_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_addon_events_lookup 
ON public.partner_addon_events(partner_id, addon_slug, created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.partner_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_addon_events ENABLE ROW LEVEL SECURITY;

-- Service Role policies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'partner_addons' AND policyname = 'Allow service_role full access to partner_addons'
    ) THEN
        CREATE POLICY "Allow service_role full access to partner_addons"
        ON public.partner_addons
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'partner_addon_events' AND policyname = 'Allow service_role full access to partner_addon_events'
    ) THEN
        CREATE POLICY "Allow service_role full access to partner_addon_events"
        ON public.partner_addon_events
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
    END IF;
END $$;
