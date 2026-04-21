-- ============================================================================
-- Coupons / Discounts system
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  code text NOT NULL,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage', 'fixed', 'free_shipping')),
  discount_value numeric(14,2) NULL,
  apply_scope text NOT NULL CHECK (apply_scope IN ('all', 'categories', 'products', 'services')),
  allow_combination boolean NOT NULL DEFAULT true,
  min_cart_value numeric(14,2) NOT NULL DEFAULT 0 CHECK (min_cart_value >= 0),
  max_discount_value numeric(14,2) NULL CHECK (max_discount_value IS NULL OR max_discount_value >= 0),
  usage_limit integer NULL CHECK (usage_limit IS NULL OR usage_limit >= 0),
  usage_per_customer integer NULL CHECK (usage_per_customer IS NULL OR usage_per_customer >= 0),
  first_purchase_only boolean NOT NULL DEFAULT false,
  starts_at timestamptz NULL,
  ends_at timestamptz NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupons_partner_code_unique UNIQUE (partner_id, code),
  CONSTRAINT coupons_discount_value_valid CHECK (
    (discount_type = 'free_shipping' AND discount_value IS NULL)
    OR (discount_type IN ('percentage', 'fixed') AND discount_value IS NOT NULL AND discount_value > 0)
  ),
  CONSTRAINT coupons_percentage_max CHECK (
    discount_type <> 'percentage' OR discount_value <= 100
  ),
  CONSTRAINT coupons_dates_valid CHECK (
    starts_at IS NULL OR ends_at IS NULL OR starts_at <= ends_at
  )
);

CREATE TABLE IF NOT EXISTS public.coupon_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupon_products_unique UNIQUE (coupon_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.coupon_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.product_categories(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupon_categories_unique UNIQUE (coupon_id, category_id)
);

CREATE TABLE IF NOT EXISTS public.coupon_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupon_services_unique UNIQUE (coupon_id, service_id)
);

CREATE TABLE IF NOT EXISTS public.coupon_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  customer_id uuid NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  order_id uuid NULL REFERENCES public.orders(id) ON DELETE SET NULL,
  used_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupons_partner_code
  ON public.coupons(partner_id, code);

CREATE INDEX IF NOT EXISTS idx_coupon_usages_coupon
  ON public.coupon_usages(coupon_id);

CREATE INDEX IF NOT EXISTS idx_coupon_usages_customer
  ON public.coupon_usages(customer_id);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS coupon_id uuid NULL REFERENCES public.coupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_usages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'coupons' AND policyname = 'coupons_select_partner_users'
  ) THEN
    CREATE POLICY coupons_select_partner_users
      ON public.coupons
      FOR SELECT
      USING (
        partner_id IN (
          SELECT pu.partner_id FROM public.partner_users pu WHERE pu.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'coupons' AND policyname = 'coupons_insert_partner_users'
  ) THEN
    CREATE POLICY coupons_insert_partner_users
      ON public.coupons
      FOR INSERT
      WITH CHECK (
        partner_id IN (
          SELECT pu.partner_id FROM public.partner_users pu WHERE pu.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'coupons' AND policyname = 'coupons_update_partner_users'
  ) THEN
    CREATE POLICY coupons_update_partner_users
      ON public.coupons
      FOR UPDATE
      USING (
        partner_id IN (
          SELECT pu.partner_id FROM public.partner_users pu WHERE pu.user_id = auth.uid()
        )
      )
      WITH CHECK (
        partner_id IN (
          SELECT pu.partner_id FROM public.partner_users pu WHERE pu.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'coupons' AND policyname = 'coupons_delete_partner_users'
  ) THEN
    CREATE POLICY coupons_delete_partner_users
      ON public.coupons
      FOR DELETE
      USING (
        partner_id IN (
          SELECT pu.partner_id FROM public.partner_users pu WHERE pu.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'coupon_products' AND policyname = 'coupon_products_manage_partner_users'
  ) THEN
    CREATE POLICY coupon_products_manage_partner_users
      ON public.coupon_products
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM public.coupons c
          JOIN public.partner_users pu ON pu.partner_id = c.partner_id
          WHERE c.id = coupon_products.coupon_id AND pu.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.coupons c
          JOIN public.partner_users pu ON pu.partner_id = c.partner_id
          WHERE c.id = coupon_products.coupon_id AND pu.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'coupon_categories' AND policyname = 'coupon_categories_manage_partner_users'
  ) THEN
    CREATE POLICY coupon_categories_manage_partner_users
      ON public.coupon_categories
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM public.coupons c
          JOIN public.partner_users pu ON pu.partner_id = c.partner_id
          WHERE c.id = coupon_categories.coupon_id AND pu.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.coupons c
          JOIN public.partner_users pu ON pu.partner_id = c.partner_id
          WHERE c.id = coupon_categories.coupon_id AND pu.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'coupon_services' AND policyname = 'coupon_services_manage_partner_users'
  ) THEN
    CREATE POLICY coupon_services_manage_partner_users
      ON public.coupon_services
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM public.coupons c
          JOIN public.partner_users pu ON pu.partner_id = c.partner_id
          WHERE c.id = coupon_services.coupon_id AND pu.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.coupons c
          JOIN public.partner_users pu ON pu.partner_id = c.partner_id
          WHERE c.id = coupon_services.coupon_id AND pu.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'coupon_usages' AND policyname = 'coupon_usages_manage_partner_users'
  ) THEN
    CREATE POLICY coupon_usages_manage_partner_users
      ON public.coupon_usages
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM public.coupons c
          JOIN public.partner_users pu ON pu.partner_id = c.partner_id
          WHERE c.id = coupon_usages.coupon_id AND pu.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.coupons c
          JOIN public.partner_users pu ON pu.partner_id = c.partner_id
          WHERE c.id = coupon_usages.coupon_id AND pu.user_id = auth.uid()
        )
      );
  END IF;
END $$;
