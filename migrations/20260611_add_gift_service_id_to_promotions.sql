-- Add gift_service_id column to promotions table for service-based gifts
ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS gift_service_id uuid NULL REFERENCES public.services(id) ON DELETE SET NULL;

-- Update gift validity constraint to allow either product or service
ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_gift_valid;
ALTER TABLE public.promotions ADD CONSTRAINT promotions_gift_valid CHECK (
  promotion_type <> 'gift' OR (gift_product_id IS NOT NULL OR gift_service_id IS NOT NULL)
);

-- Remove unused promotion_audit_logs table (no code reads from it)
DROP TABLE IF EXISTS public.promotion_audit_logs CASCADE;

-- Remove promotion_subscriptions table (no subscription plans in promotions)
DROP TABLE IF EXISTS public.promotion_subscriptions CASCADE;

-- Remove specific_subscriptions from promotions apply_scope constraint
ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_apply_scope_check;
ALTER TABLE public.promotions ADD CONSTRAINT promotions_apply_scope_check
  CHECK (apply_scope IN ('specific_products', 'category', 'entire_cart', 'specific_services'));

-- Alter promotion_categories to support both product and service categories
ALTER TABLE public.promotion_categories
  DROP CONSTRAINT IF EXISTS promotion_categories_category_id_fkey;
ALTER TABLE public.promotion_categories
  DROP CONSTRAINT IF EXISTS promotion_categories_category_type_check;
ALTER TABLE public.promotion_categories
  ADD COLUMN IF NOT EXISTS category_type text NOT NULL DEFAULT 'product';
ALTER TABLE public.promotion_categories
  ADD CONSTRAINT promotion_categories_category_type_check
  CHECK (category_type IN ('product', 'service'));
ALTER TABLE public.promotion_categories
  DROP CONSTRAINT IF EXISTS promotion_categories_unique;
ALTER TABLE public.promotion_categories
  ADD CONSTRAINT promotion_categories_unique UNIQUE (promotion_id, category_id, category_type);
