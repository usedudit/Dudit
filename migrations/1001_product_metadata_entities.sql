-- migration: 1001_product_metadata_entities.sql

-- 1. Categorias e Subcategorias
CREATE TABLE IF NOT EXISTS public.product_categories (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_id UUID NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT product_categories_pkey PRIMARY KEY (id),
    CONSTRAINT product_categories_parent_fkey FOREIGN KEY (parent_id) REFERENCES public.product_categories(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_categories_partner ON public.product_categories(partner_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON public.product_categories(parent_id);

-- 2. Marcas
CREATE TABLE IF NOT EXISTS public.brands (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT brands_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_brands_partner ON public.brands(partner_id);

-- 3. Localização no Estoque
CREATE TABLE IF NOT EXISTS public.storage_locations (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT storage_locations_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_locations_partner ON public.storage_locations(partner_id);

-- 4. Enable Row Level Security
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_locations ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies (Partner Isolation)
-- Product Categories
DROP POLICY IF EXISTS "Partners can manage their own categories" ON public.product_categories;
CREATE POLICY "Partners can manage their own categories" ON public.product_categories
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM partners
            WHERE partners.id = product_categories.partner_id AND partners.user_id = auth.uid()
        )
    );

-- Brands
DROP POLICY IF EXISTS "Partners can manage their own brands" ON public.brands;
CREATE POLICY "Partners can manage their own brands" ON public.brands
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM partners
            WHERE partners.id = brands.partner_id AND partners.user_id = auth.uid()
        )
    );

-- Storage Locations
DROP POLICY IF EXISTS "Partners can manage their own locations" ON public.storage_locations;
CREATE POLICY "Partners can manage their own locations" ON public.storage_locations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM partners
            WHERE partners.id = storage_locations.partner_id AND partners.user_id = auth.uid()
        )
    );

-- 6. Link to products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.product_categories(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES public.product_categories(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.storage_locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_subcategory_id ON public.products(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_products_brand_id ON public.products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_location_id ON public.products(location_id);
