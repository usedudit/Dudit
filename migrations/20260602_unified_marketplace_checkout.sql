-- Unified marketplace checkout: multi-type cart, booking metadata, fulfillment idempotency

-- -----------------------------------------------------------------------------
-- 1) Extend cart_items for products, service bookings, subscriptions
-- -----------------------------------------------------------------------------
ALTER TABLE public.cart_items
  ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'product'
    CHECK (item_type IN ('product', 'service_booking', 'subscription'));

ALTER TABLE public.cart_items
  ADD COLUMN IF NOT EXISTS service_id UUID NULL REFERENCES public.services(id) ON DELETE CASCADE;

ALTER TABLE public.cart_items
  ADD COLUMN IF NOT EXISTS recurring_plan_id UUID NULL REFERENCES public.recurring_plans(id) ON DELETE CASCADE;

ALTER TABLE public.cart_items
  ADD COLUMN IF NOT EXISTS booking_metadata JSONB NULL;

ALTER TABLE public.cart_items
  ADD COLUMN IF NOT EXISTS pay_deposit_only BOOLEAN NOT NULL DEFAULT FALSE;

-- product_id was NOT NULL — relax for non-product lines
ALTER TABLE public.cart_items ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE public.cart_items
  ADD CONSTRAINT cart_items_type_refs_check CHECK (
    (item_type = 'product' AND product_id IS NOT NULL)
    OR (item_type = 'service_booking' AND service_id IS NOT NULL AND booking_metadata IS NOT NULL)
    OR (item_type = 'subscription' AND recurring_plan_id IS NOT NULL)
  );

DROP INDEX IF EXISTS cart_items_user_product_variant_key;

CREATE UNIQUE INDEX IF NOT EXISTS cart_items_user_product_variant_key
  ON public.cart_items (user_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'))
  WHERE item_type = 'product' AND product_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cart_items_user_service_booking_key
  ON public.cart_items (
    user_id,
    service_id,
    md5(COALESCE(booking_metadata::text, ''))
  )
  WHERE item_type = 'service_booking';

CREATE UNIQUE INDEX IF NOT EXISTS cart_items_user_subscription_key
  ON public.cart_items (user_id, recurring_plan_id)
  WHERE item_type = 'subscription';

CREATE INDEX IF NOT EXISTS idx_cart_items_item_type ON public.cart_items(item_type);
CREATE INDEX IF NOT EXISTS idx_cart_items_service_id ON public.cart_items(service_id) WHERE service_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cart_items_recurring_plan_id ON public.cart_items(recurring_plan_id) WHERE recurring_plan_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2) Service scheduling + partner deposit settings
-- -----------------------------------------------------------------------------
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS scheduling_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS service_deposit_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS service_deposit_type TEXT NOT NULL DEFAULT 'percentage'
    CHECK (service_deposit_type IN ('percentage')),
  ADD COLUMN IF NOT EXISTS service_deposit_percentage INTEGER NOT NULL DEFAULT 50
    CHECK (service_deposit_percentage IN (10, 20, 30, 50));

-- -----------------------------------------------------------------------------
-- 3) Appointments: payment status + sales channel for reporting
-- -----------------------------------------------------------------------------
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'partially_paid', 'paid', 'refunded'));

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS sales_channel TEXT NOT NULL DEFAULT 'booking';

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS marketplace_order_id UUID NULL REFERENCES public.orders(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.appointments.sales_channel IS 'online_storefront for vitrine checkout; booking for ERP/internal';

-- -----------------------------------------------------------------------------
-- 4) Orders: pending fulfillment payload (created after payment)
-- -----------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS checkout_fulfillment JSONB NULL,
  ADD COLUMN IF NOT EXISTS order_source TEXT NULL;

-- Backfill marketplace orders without explicit source
UPDATE public.orders
SET order_source = COALESCE(order_source, 'Vitrine Online')
WHERE order_source IS NULL AND buyer_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 5) Idempotent post-payment fulfillment ledger
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.checkout_fulfillments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed')),
  result JSONB NULL,
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL,
  CONSTRAINT checkout_fulfillments_idempotency_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_checkout_fulfillments_order_id ON public.checkout_fulfillments(order_id);

ALTER TABLE public.checkout_fulfillments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS checkout_fulfillments_partner ON public.checkout_fulfillments;
CREATE POLICY checkout_fulfillments_partner ON public.checkout_fulfillments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.partner_users pu
      WHERE pu.partner_id = checkout_fulfillments.partner_id AND pu.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- 6) Coupon applicability: subscriptions
-- -----------------------------------------------------------------------------
ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS coupons_apply_scope_check;
ALTER TABLE public.coupons ADD CONSTRAINT coupons_apply_scope_check
  CHECK (apply_scope IN ('all', 'categories', 'products', 'services', 'subscriptions'));

CREATE TABLE IF NOT EXISTS public.coupon_subscriptions (
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  recurring_plan_id UUID NOT NULL REFERENCES public.recurring_plans(id) ON DELETE CASCADE,
  CONSTRAINT coupon_subscriptions_unique UNIQUE (coupon_id, recurring_plan_id)
);

ALTER TABLE public.coupon_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coupon_subscriptions_manage_partner_users ON public.coupon_subscriptions;
CREATE POLICY coupon_subscriptions_manage_partner_users ON public.coupon_subscriptions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.coupons c
      JOIN public.partner_users pu ON pu.partner_id = c.partner_id
      WHERE c.id = coupon_subscriptions.coupon_id AND pu.user_id = auth.uid()
    )
  );

-- Promotion scope for subscription plans
CREATE TABLE IF NOT EXISTS public.promotion_subscriptions (
  promotion_id UUID NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  recurring_plan_id UUID NOT NULL REFERENCES public.recurring_plans(id) ON DELETE CASCADE,
  CONSTRAINT promotion_subscriptions_unique UNIQUE (promotion_id, recurring_plan_id)
);

ALTER TABLE public.promotion_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS promotion_subscriptions_manage_partner_users ON public.promotion_subscriptions;
CREATE POLICY promotion_subscriptions_manage_partner_users ON public.promotion_subscriptions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.promotions p
      JOIN public.campaigns cam ON cam.id = p.campaign_id
      JOIN public.partner_users pu ON pu.partner_id = cam.partner_id
      WHERE p.id = promotion_subscriptions.promotion_id AND pu.user_id = auth.uid()
    )
  );

ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_apply_scope_check;
ALTER TABLE public.promotions ADD CONSTRAINT promotions_apply_scope_check
  CHECK (apply_scope IN (
    'specific_products', 'category', 'entire_cart', 'specific_services', 'specific_subscriptions'
  ));
