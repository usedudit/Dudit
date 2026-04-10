-- Financial categories and subcategories (same shape as product_categories)

CREATE TABLE IF NOT EXISTS public.financial_categories (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_id UUID NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT financial_categories_pkey PRIMARY KEY (id),
    CONSTRAINT financial_categories_parent_fkey FOREIGN KEY (parent_id) REFERENCES public.financial_categories(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_financial_categories_partner ON public.financial_categories(partner_id);
CREATE INDEX IF NOT EXISTS idx_financial_categories_parent ON public.financial_categories(parent_id);

ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Partners can manage their own financial categories" ON public.financial_categories;
CREATE POLICY "Partners can manage their own financial categories" ON public.financial_categories
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM partners
            WHERE partners.id = financial_categories.partner_id AND partners.user_id = auth.uid()
        )
    );
