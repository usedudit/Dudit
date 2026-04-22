-- =============================================================================
-- MIGRATION: Advanced Coupon Features
-- Date: 2026-04-21
-- Description: Adds customer-specific coupons, automatic coupons, coupon
--              tracking on pre-sales, and duplicate-usage prevention.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1A) CUSTOMER SCOPE — restrict coupons to specific customers
-- ---------------------------------------------------------------------------
ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS customer_scope text NOT NULL DEFAULT 'all';

-- Add CHECK constraint (safe: only adds if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'coupons_customer_scope_check'
  ) THEN
    ALTER TABLE public.coupons
      ADD CONSTRAINT coupons_customer_scope_check
        CHECK (customer_scope IN ('all', 'specific'));
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 1B) AUTOMATIC COUPONS — auto-applied at checkout when valid
-- ---------------------------------------------------------------------------
ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS is_automatic boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 2) COUPON–CUSTOMER ASSIGNMENTS TABLE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coupon_customers (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id  uuid        NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  customer_id uuid       NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupon_customers_unique UNIQUE (coupon_id, customer_id)
);

-- Index for fast lookups by coupon
CREATE INDEX IF NOT EXISTS idx_coupon_customers_coupon_id
  ON public.coupon_customers(coupon_id);

-- Index for fast lookups by customer
CREATE INDEX IF NOT EXISTS idx_coupon_customers_customer_id
  ON public.coupon_customers(customer_id);

-- ---------------------------------------------------------------------------
-- 3) PREVENT DUPLICATE COUPON USAGE PER ORDER
-- ---------------------------------------------------------------------------
-- If the constraint already exists, skip gracefully
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'coupon_usages_order_unique'
  ) THEN
    ALTER TABLE public.coupon_usages
      ADD CONSTRAINT coupon_usages_order_unique UNIQUE (coupon_id, order_id);
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 4) PRE-SALES COUPON TRACKING (for POS flow)
-- ---------------------------------------------------------------------------
ALTER TABLE public.pre_sales
  ADD COLUMN IF NOT EXISTS coupon_id uuid NULL REFERENCES public.coupons(id) ON DELETE SET NULL;

ALTER TABLE public.pre_sales
  ADD COLUMN IF NOT EXISTS coupon_code text NULL;

ALTER TABLE public.pre_sales
  ADD COLUMN IF NOT EXISTS coupon_discount_amount numeric(14,2) NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 5) RLS POLICIES FOR coupon_customers
-- ---------------------------------------------------------------------------
ALTER TABLE public.coupon_customers ENABLE ROW LEVEL SECURITY;

-- Partners can manage their own coupon-customer assignments through the
-- coupons table's partner_id. We use a subselect for the policy.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'coupon_customers' AND policyname = 'coupon_customers_partner_access'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY coupon_customers_partner_access ON public.coupon_customers
        FOR ALL
        USING (
          EXISTS (
            SELECT 1 FROM public.coupons c
            JOIN public.partner_users pu ON pu.partner_id = c.partner_id
            WHERE c.id = coupon_customers.coupon_id
              AND pu.user_id = auth.uid()
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.coupons c
            JOIN public.partner_users pu ON pu.partner_id = c.partner_id
            WHERE c.id = coupon_customers.coupon_id
              AND pu.user_id = auth.uid()
          )
        );
    $policy$;
  END IF;
END$$;
