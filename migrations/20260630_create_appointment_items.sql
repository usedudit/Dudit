-- Create appointment_items table for tracking items used in appointments
CREATE TABLE IF NOT EXISTS public.appointment_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
    service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    usage_type TEXT NOT NULL DEFAULT 'consumed' CHECK (usage_type IN ('consumed', 'returnable', 'reference')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup by appointment
CREATE INDEX IF NOT EXISTS idx_appointment_items_appointment_id ON public.appointment_items(appointment_id);

-- Enable RLS
ALTER TABLE public.appointment_items ENABLE ROW LEVEL SECURITY;

-- RLS: users can view items for appointments in their partner
CREATE POLICY "Users can view appointment items" ON public.appointment_items
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.appointments a
            JOIN public.partner_users pu ON pu.partner_id = a.partner_id
            WHERE a.id = appointment_items.appointment_id
            AND pu.user_id = auth.uid()
        )
    );

-- RLS: users can insert items for appointments in their partner
CREATE POLICY "Users can insert appointment items" ON public.appointment_items
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.appointments a
            JOIN public.partner_users pu ON pu.partner_id = a.partner_id
            WHERE a.id = appointment_items.appointment_id
            AND pu.user_id = auth.uid()
        )
    );

-- RLS: users can update items for appointments in their partner
CREATE POLICY "Users can update appointment items" ON public.appointment_items
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.appointments a
            JOIN public.partner_users pu ON pu.partner_id = a.partner_id
            WHERE a.id = appointment_items.appointment_id
            AND pu.user_id = auth.uid()
        )
    );

-- RLS: users can delete items for appointments in their partner
CREATE POLICY "Users can delete appointment items" ON public.appointment_items
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.appointments a
            JOIN public.partner_users pu ON pu.partner_id = a.partner_id
            WHERE a.id = appointment_items.appointment_id
            AND pu.user_id = auth.uid()
        )
    );

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_appointment_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_appointment_items_updated_at ON public.appointment_items;
CREATE TRIGGER trg_appointment_items_updated_at
    BEFORE UPDATE ON public.appointment_items
    FOR EACH ROW
    EXECUTE FUNCTION public.update_appointment_items_updated_at();
