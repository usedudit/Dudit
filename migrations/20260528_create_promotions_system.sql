-- ============================================================================
-- Campaigns / Promotions / Discounts system
-- ============================================================================

-- Campaigns Table (Metadata & Audience)
CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NULL,
  customer_scope text NOT NULL DEFAULT 'all' CHECK (customer_scope IN ('all', 'specific')),
  starts_at timestamptz NULL,
  ends_at timestamptz NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Target Customers for Specific Campaigns
CREATE TABLE IF NOT EXISTS public.campaign_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_customers_unique UNIQUE (campaign_id, customer_id)
);

-- Promotions Table (Rules & Actions)
CREATE TABLE IF NOT EXISTS public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NULL,
  promotion_type text NOT NULL CHECK (promotion_type IN ('gift', 'buy_x_pay_y', 'discount', 'free_shipping')),
  discount_type text NULL CHECK (discount_type IS NULL OR discount_type IN ('percentage', 'fixed')),
  discount_value numeric(14,2) NULL CHECK (discount_value IS NULL OR discount_value > 0),
  max_discount_amount numeric(14,2) NULL CHECK (max_discount_amount IS NULL OR max_discount_amount >= 0),
  min_spend_amount numeric(14,2) NULL CHECK (min_spend_amount IS NULL OR min_spend_amount >= 0),
  gift_product_id uuid NULL REFERENCES public.products(id) ON DELETE SET NULL,
  buy_quantity integer NULL CHECK (buy_quantity IS NULL OR buy_quantity > 0),
  pay_quantity integer NULL CHECK (pay_quantity IS NULL OR pay_quantity > 0),
  priority integer NOT NULL DEFAULT 0,
  apply_scope text NOT NULL CHECK (apply_scope IN ('specific_products', 'category', 'entire_cart')),
  allow_coupon_combination boolean NOT NULL DEFAULT false,
  usage_limit integer NULL CHECK (usage_limit IS NULL OR usage_limit >= 0),
  usage_limit_per_customer integer NULL CHECK (usage_limit_per_customer IS NULL OR usage_limit_per_customer >= 0),
  usage_count integer NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotions_buy_pay_valid CHECK (
    promotion_type <> 'buy_x_pay_y' OR (buy_quantity IS NOT NULL AND pay_quantity IS NOT NULL AND buy_quantity > pay_quantity)
  ),
  CONSTRAINT promotions_gift_valid CHECK (
    promotion_type <> 'gift' OR gift_product_id IS NOT NULL
  ),
  CONSTRAINT promotions_discount_valid CHECK (
    promotion_type <> 'discount' OR (discount_type IS NOT NULL AND discount_value IS NOT NULL)
  )
);

-- Target Products for Specific Promotions
CREATE TABLE IF NOT EXISTS public.promotion_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotion_products_unique UNIQUE (promotion_id, product_id)
);

-- Target Categories for Specific Promotions
CREATE TABLE IF NOT EXISTS public.promotion_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.product_categories(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotion_categories_unique UNIQUE (promotion_id, category_id)
);

-- Promotion Usages Log
CREATE TABLE IF NOT EXISTS public.promotion_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  customer_id uuid NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  order_id uuid NULL REFERENCES public.orders(id) ON DELETE SET NULL,
  used_at timestamptz NOT NULL DEFAULT now()
);

-- Promotion Audit Logs
CREATE TABLE IF NOT EXISTS public.promotion_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  customer_id uuid NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  order_id uuid NULL REFERENCES public.orders(id) ON DELETE SET NULL,
  action text NOT NULL, -- 'applied', 'removed', 'conflict', 'coupon_rejected'
  details jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Alter orders and order_items
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS promotions_applied jsonb NULL;

ALTER TABLE public.order_items 
  ADD COLUMN IF NOT EXISTS is_promotional boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promotion_id uuid NULL REFERENCES public.promotions(id) ON DELETE SET NULL;

-- Enable RLS and add policies
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_usages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_audit_logs ENABLE ROW LEVEL SECURITY;

-- Add RLS policies filtering by partner_id linked to partner_users
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'campaigns' AND policyname = 'campaigns_partner_users') THEN
    CREATE POLICY campaigns_partner_users ON public.campaigns FOR ALL USING (partner_id IN (SELECT pu.partner_id FROM public.partner_users pu WHERE pu.user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'campaign_customers' AND policyname = 'campaign_customers_partner_users') THEN
    CREATE POLICY campaign_customers_partner_users ON public.campaign_customers FOR ALL USING (EXISTS (SELECT 1 FROM public.campaigns c JOIN public.partner_users pu ON pu.partner_id = c.partner_id WHERE c.id = campaign_customers.campaign_id AND pu.user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'promotions' AND policyname = 'promotions_partner_users') THEN
    CREATE POLICY promotions_partner_users ON public.promotions FOR ALL USING (partner_id IN (SELECT pu.partner_id FROM public.partner_users pu WHERE pu.user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'promotion_products' AND policyname = 'promotion_products_partner_users') THEN
    CREATE POLICY promotion_products_partner_users ON public.promotion_products FOR ALL USING (EXISTS (SELECT 1 FROM public.promotions p JOIN public.partner_users pu ON pu.partner_id = p.partner_id WHERE p.id = promotion_products.promotion_id AND pu.user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'promotion_categories' AND policyname = 'promotion_categories_partner_users') THEN
    CREATE POLICY promotion_categories_partner_users ON public.promotion_categories FOR ALL USING (EXISTS (SELECT 1 FROM public.promotions p JOIN public.partner_users pu ON pu.partner_id = p.partner_id WHERE p.id = promotion_categories.promotion_id AND pu.user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'promotion_usages' AND policyname = 'promotion_usages_partner_users') THEN
    CREATE POLICY promotion_usages_partner_users ON public.promotion_usages FOR ALL USING (EXISTS (SELECT 1 FROM public.promotions p JOIN public.partner_users pu ON pu.partner_id = p.partner_id WHERE p.id = promotion_usages.promotion_id AND pu.user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'promotion_audit_logs' AND policyname = 'promotion_audit_logs_partner_users') THEN
    CREATE POLICY promotion_audit_logs_partner_users ON public.promotion_audit_logs FOR ALL USING (partner_id IN (SELECT pu.partner_id FROM public.partner_users pu WHERE pu.user_id = auth.uid()));
  END IF;
END $$;
