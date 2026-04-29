-- Criação da tabela de categorias de serviços e alteração na tabela de serviços

CREATE TABLE IF NOT EXISTS public.service_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    name text NOT NULL,
    parent_id uuid REFERENCES public.service_categories(id) ON DELETE CASCADE,
    is_active boolean DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_categories_partner_id ON public.service_categories(partner_id);

ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partner service categories are viewable by invited users" 
ON public.service_categories FOR SELECT 
USING (
  partner_id IN (
    SELECT id FROM public.partners WHERE user_id = auth.uid()
    UNION
    SELECT partner_id FROM public.partner_users WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Partner service categories are manageable by invited users"
ON public.service_categories FOR ALL 
USING (
  partner_id IN (
    SELECT id FROM public.partners WHERE user_id = auth.uid()
    UNION
    SELECT partner_id FROM public.partner_users WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  partner_id IN (
    SELECT id FROM public.partners WHERE user_id = auth.uid()
    UNION
    SELECT partner_id FROM public.partner_users WHERE user_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.set_service_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_service_categories_updated_at ON public.service_categories;
CREATE TRIGGER trg_service_categories_updated_at
BEFORE UPDATE ON public.service_categories
FOR EACH ROW
EXECUTE FUNCTION public.set_service_categories_updated_at();

-- Alteração na tabela de serviços
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.service_categories(id) ON DELETE SET NULL;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS subcategory_id uuid REFERENCES public.service_categories(id) ON DELETE SET NULL;

-- Remove the old TEXT columns (or we can just leave them in case of rollback, but usually it's fine to drop if it was recent)
-- Using IF EXISTS to be safe
ALTER TABLE public.services DROP COLUMN IF EXISTS category;
ALTER TABLE public.services DROP COLUMN IF EXISTS subcategory;
