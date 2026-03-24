-- ============================================================================
-- Migration: SaaS Subscription & Plan System
-- Created: 2026-03-17
-- Description: Creates plans, subscriptions, usage_counters, billing_events 
--              tables with RLS, triggers, RPCs, and seed data.
-- ============================================================================

-- ─── Enum Type ──────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM (
    'trialing', 'active', 'past_due', 'cancelled', 'paused', 'pending'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── updated_at trigger function (reusable) ─────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TABLE: plans
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  price numeric(10,2) NOT NULL DEFAULT 0,
  limits_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  features_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- Public can read active plans (pricing page)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'plans' AND policyname = 'plans_select_active') THEN
    CREATE POLICY "plans_select_active" ON public.plans FOR SELECT USING (is_active = true);
  END IF;
END $$;

-- Only service role can insert/update/delete plans
-- (no policies for insert/update/delete = service role only)

DROP TRIGGER IF EXISTS plans_updated_at ON public.plans;
CREATE TRIGGER plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: subscriptions
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  plan_snapshot jsonb,
  mercado_pago_subscription_id text,
  status subscription_status NOT NULL DEFAULT 'pending',
  payment_provider text NOT NULL DEFAULT 'mercado_pago',
  billing_email text,
  trial_end timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  cancelled_at timestamptz,
  ended_at timestamptz,
  pending_plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Partial unique index: only one active/trialing/past_due/pending sub per partner
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_active_partner
  ON public.subscriptions (partner_id)
  WHERE status IN ('active', 'trialing', 'past_due', 'pending');

CREATE INDEX IF NOT EXISTS idx_subscriptions_partner_status
ON public.subscriptions(partner_id, status);

-- Index for lookups by MP subscription ID
CREATE INDEX IF NOT EXISTS idx_subscriptions_mp_id
  ON public.subscriptions (mercado_pago_subscription_id)
  WHERE mercado_pago_subscription_id IS NOT NULL;

-- Index for status-based queries
CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON public.subscriptions (status);

-- Index for cron job: pending plan switches
CREATE INDEX IF NOT EXISTS idx_subscriptions_pending_switch
  ON public.subscriptions (current_period_end)
  WHERE cancel_at_period_end = true AND pending_plan_id IS NOT NULL;

-- Partners can read their own subscriptions
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subscriptions' AND policyname = 'subscriptions_select_own') THEN
    CREATE POLICY "subscriptions_select_own" ON public.subscriptions FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.partners WHERE id = partner_id AND user_id = auth.uid())
    );
  END IF;
END $$;

-- No insert/update/delete policies = service role only

DROP TRIGGER IF EXISTS subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: usage_counters
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.usage_counters (
  partner_id uuid PRIMARY KEY REFERENCES public.partners(id) ON DELETE CASCADE,
  products_count int NOT NULL DEFAULT 0,
  users_count int NOT NULL DEFAULT 0,
  images_count int NOT NULL DEFAULT 0,
  services_count int NOT NULL DEFAULT 0,
  quotes_month_count int NOT NULL DEFAULT 0,
  quotes_month_reset timestamptz DEFAULT now(),
  orders_month_count int NOT NULL DEFAULT 0,
  orders_month_reset timestamptz DEFAULT now(),
  appointments_month_count int NOT NULL DEFAULT 0,
  appointments_month_reset timestamptz DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

-- Partners can read their own counters
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'usage_counters' AND policyname = 'usage_counters_select_own') THEN
    CREATE POLICY "usage_counters_select_own" ON public.usage_counters FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.partners WHERE id = partner_id AND user_id = auth.uid())
    );
  END IF;
END $$;

-- No insert/update/delete policies = service role only

DROP TRIGGER IF EXISTS usage_counters_updated_at ON public.usage_counters;
CREATE TRIGGER usage_counters_updated_at
  BEFORE UPDATE ON public.usage_counters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: billing_events
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  amount numeric(10,2),
  provider text NOT NULL DEFAULT 'mercado_pago',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

-- Index for partner billing history
CREATE INDEX IF NOT EXISTS idx_billing_events_partner
  ON public.billing_events (partner_id, created_at DESC);

-- Partners can read their own billing events
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'billing_events' AND policyname = 'billing_events_select_own') THEN
    CREATE POLICY "billing_events_select_own" ON public.billing_events FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.partners WHERE id = partner_id AND user_id = auth.uid())
    );
  END IF;
END $$;

-- No insert/update/delete policies = service role only

-- ============================================================================
-- TRIGGERS: Auto-increment/decrement usage counters
-- ============================================================================

-- Ensure usage_counters row exists (upsert helper)
CREATE OR REPLACE FUNCTION ensure_usage_counters_exist()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.usage_counters (partner_id)
  VALUES (COALESCE(NEW.partner_id, OLD.partner_id))
  ON CONFLICT (partner_id) DO NOTHING;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─── Products counter triggers ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_products_count()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.usage_counters (partner_id, products_count)
  VALUES (NEW.partner_id, 1)
  ON CONFLICT (partner_id) 
  DO UPDATE SET products_count = usage_counters.products_count + 1,
                updated_at = now();
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION decrement_products_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.usage_counters 
  SET products_count = GREATEST(0, products_count - 1),
      updated_at = now()
  WHERE partner_id = OLD.partner_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_products_increment_count ON public.products;
CREATE TRIGGER trg_products_increment_count
  AFTER INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION increment_products_count();

DROP TRIGGER IF EXISTS trg_products_decrement_count ON public.products;
CREATE TRIGGER trg_products_decrement_count
  AFTER DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION decrement_products_count();

-- ─── Partner users counter triggers ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_users_count()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.usage_counters (partner_id, users_count)
  VALUES (NEW.partner_id, 1)
  ON CONFLICT (partner_id) 
  DO UPDATE SET users_count = usage_counters.users_count + 1,
                updated_at = now();
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION decrement_users_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.usage_counters 
  SET users_count = GREATEST(0, users_count - 1),
      updated_at = now()
  WHERE partner_id = OLD.partner_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_partner_users_increment_count ON public.partner_users;
CREATE TRIGGER trg_partner_users_increment_count
  AFTER INSERT ON public.partner_users
  FOR EACH ROW EXECUTE FUNCTION increment_users_count();

DROP TRIGGER IF EXISTS trg_partner_users_decrement_count ON public.partner_users;
CREATE TRIGGER trg_partner_users_decrement_count
  AFTER DELETE ON public.partner_users
  FOR EACH ROW EXECUTE FUNCTION decrement_users_count();

-- ─── Services counter triggers ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_services_count()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.usage_counters (partner_id, services_count)
  VALUES (NEW.partner_id, 1)
  ON CONFLICT (partner_id) 
  DO UPDATE SET services_count = usage_counters.services_count + 1,
                updated_at = now();
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION decrement_services_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.usage_counters 
  SET services_count = GREATEST(0, services_count - 1),
      updated_at = now()
  WHERE partner_id = OLD.partner_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_services_increment_count ON public.services;
CREATE TRIGGER trg_services_increment_count
  AFTER INSERT ON public.services
  FOR EACH ROW EXECUTE FUNCTION increment_services_count();

DROP TRIGGER IF EXISTS trg_services_decrement_count ON public.services;
CREATE TRIGGER trg_services_decrement_count
  AFTER DELETE ON public.services
  FOR EACH ROW EXECUTE FUNCTION decrement_services_count();

-- ============================================================================
-- RPCs: Manual counter operations (for images, quotes)
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_usage_counter(
  p_partner_id uuid,
  p_counter_name text,
  p_amount int DEFAULT 1
)
RETURNS void AS $$
BEGIN
  -- Validate counter name to prevent SQL injection
  IF p_counter_name NOT IN ('images_count', 'quotes_month_count', 'orders_month_count', 'appointments_month_count', 'products_count', 'users_count', 'services_count') THEN
    RAISE EXCEPTION 'Invalid counter name: %', p_counter_name;
  END IF;

  -- Upsert counter row
  INSERT INTO public.usage_counters (partner_id)
  VALUES (p_partner_id)
  ON CONFLICT (partner_id) DO NOTHING;

  -- Increment using dynamic SQL (counter name validated above)
  EXECUTE format(
    'UPDATE public.usage_counters SET %I = %I + $1, updated_at = now() WHERE partner_id = $2',
    p_counter_name, p_counter_name
  ) USING p_amount, p_partner_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION decrement_usage_counter(
  p_partner_id uuid,
  p_counter_name text,
  p_amount int DEFAULT 1
)
RETURNS void AS $$
BEGIN
  IF p_counter_name NOT IN ('images_count', 'quotes_month_count', 'orders_month_count', 'appointments_month_count', 'products_count', 'users_count', 'services_count') THEN
    RAISE EXCEPTION 'Invalid counter name: %', p_counter_name;
  END IF;

  EXECUTE format(
    'UPDATE public.usage_counters SET %I = GREATEST(0, %I - $1), updated_at = now() WHERE partner_id = $2',
    p_counter_name, p_counter_name
  ) USING p_amount, p_partner_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─── Monthly counters reset ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION reset_monthly_counters()
RETURNS void AS $$
BEGIN
  UPDATE public.usage_counters
  SET quotes_month_count = 0,
      quotes_month_reset = now(),
      orders_month_count = 0,
      orders_month_reset = now(),
      appointments_month_count = 0,
      appointments_month_reset = now(),
      updated_at = now()
  WHERE quotes_month_reset < date_trunc('month', now())
     OR orders_month_reset < date_trunc('month', now())
     OR appointments_month_reset < date_trunc('month', now());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─── Apply pending plan switches (daily cron) ───────────────────────────────

CREATE OR REPLACE FUNCTION apply_pending_plan_switches()
RETURNS void AS $$
DECLARE
  sub RECORD;
  free_plan_id uuid;
BEGIN
  -- Get free plan ID for cancellations without pending plan
  SELECT id INTO free_plan_id FROM public.plans WHERE slug = 'free' LIMIT 1;

  FOR sub IN
    SELECT s.id, s.partner_id, s.pending_plan_id, s.plan_id
    FROM public.subscriptions s
    WHERE s.cancel_at_period_end = true
      AND s.current_period_end < now()
      AND s.status IN ('active', 'past_due')
  LOOP
    -- End the current subscription
    UPDATE public.subscriptions
    SET status = 'cancelled',
        ended_at = now(),
        cancel_at_period_end = false
    WHERE id = sub.id;

    -- If there's a pending plan (downgrade), create new subscription
    IF sub.pending_plan_id IS NOT NULL THEN
      INSERT INTO public.subscriptions (
        partner_id, plan_id, status, 
        plan_snapshot,
        current_period_start, current_period_end
      )
      SELECT 
        sub.partner_id, 
        sub.pending_plan_id, 
        'active',
        row_to_json(p)::jsonb,
        now(), 
        now() + interval '1 month'
      FROM public.plans p WHERE p.id = sub.pending_plan_id;

      -- Log billing event
      INSERT INTO public.billing_events (partner_id, event_type, metadata)
      VALUES (sub.partner_id, 'plan_downgraded', jsonb_build_object(
        'from_plan_id', sub.plan_id,
        'to_plan_id', sub.pending_plan_id
      ));
    ELSE
      -- Pure cancellation: no pending plan, revert to free
      IF free_plan_id IS NOT NULL THEN
        INSERT INTO public.subscriptions (
          partner_id, plan_id, status,
          plan_snapshot,
          current_period_start
        )
        SELECT 
          sub.partner_id,
          free_plan_id,
          'active',
          row_to_json(p)::jsonb,
          now()
        FROM public.plans p WHERE p.id = free_plan_id;
      END IF;

      INSERT INTO public.billing_events (partner_id, event_type, metadata)
      VALUES (sub.partner_id, 'subscription_ended', jsonb_build_object(
        'from_plan_id', sub.plan_id
      ));
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- SEED DATA: Plans
-- ============================================================================

INSERT INTO public.plans (name, slug, price, sort_order, limits_json, features_json)
VALUES
  (
    'Começar',
    'free',
    0,
    0,
    '{
      "products": 15,
      "images_per_product": 2,
      "total_images": 30,
      "users": 1,
      "orders_per_month": 20,
      "appointments_per_month": 20,
      "quotes_per_month": 10
    }'::jsonb,
    '[
      "public_storefront",
      "customer_management",
      "product_management",
      "service_management",
      "category_management",
      "basic_inventory",
      "appointments",
      "quotes",
      "technical_specs",
      "pdv_basic",
      "whatsapp_orders",
      "whatsapp_bookings",
      "qr_code_profile"
    ]'::jsonb
  ),
  (
    'Vendedor',
    'vendedor',
    19.90,
    1,
    '{
      "products": 100,
      "images_per_product": 5,
      "total_images": 500,
      "users": 3,
      "orders_per_month": 150,
      "appointments_per_month": 150,
      "quotes_per_month": 30
    }'::jsonb,
    '[
      "public_storefront",
      "customer_management",
      "product_management",
      "service_management",
      "category_management",
      "basic_inventory",
      "appointments",
      "quotes",
      "technical_specs",
      "pdv_basic",
      "whatsapp_orders",
      "whatsapp_bookings",
      "qr_code_profile",
      "mercado_pago_checkout",
      "system_orders",
      "system_bookings",
      "product_variants",
      "product_complements",
      "promotions_and_coupons",
      "local_shipping_config",
      "supplier_management",
      "financial_categories",
      "xml_import",
      "basic_financial",
      "basic_reports"
    ]'::jsonb
  ),
  (
    'Crescer',
    'crescer',
    49.90,
    2,
    '{
      "products": 500,
      "images_per_product": 8,
      "total_images": "unlimited",
      "users": 5,
      "orders_per_month": "unlimited",
      "appointments_per_month": "unlimited",
      "quotes_per_month": "unlimited"
    }'::jsonb,
    '[
      "public_storefront",
      "customer_management",
      "product_management",
      "service_management",
      "category_management",
      "basic_inventory",
      "appointments",
      "quotes",
      "technical_specs",
      "pdv_basic",
      "whatsapp_orders",
      "whatsapp_bookings",
      "qr_code_profile",
      "mercado_pago_checkout",
      "system_orders",
      "system_bookings",
      "product_variants",
      "product_complements",
      "promotions_and_coupons",
      "local_shipping_config",
      "supplier_management",
      "financial_categories",
      "xml_import",
      "basic_financial",
      "basic_reports",
      "national_shipping",
      "full_shipping_management",
      "advanced_financial",
      "cash_flow",
      "dre_report",
      "advanced_reports",
      "service_orders",
      "returns_and_exchanges",
      "product_kits"
    ]'::jsonb
  ),
  (
    'Profissional',
    'profissional',
    79.90,
    3,
    '{
      "products": "unlimited",
      "images_per_product": 10,
      "total_images": "unlimited",
      "users": 10,
      "orders_per_month": "unlimited",
      "appointments_per_month": "unlimited",
      "quotes_per_month": "unlimited"
    }'::jsonb,
    '[
      "public_storefront",
      "customer_management",
      "product_management",
      "service_management",
      "category_management",
      "basic_inventory",
      "appointments",
      "quotes",
      "technical_specs",
      "pdv_basic",
      "whatsapp_orders",
      "whatsapp_bookings",
      "qr_code_profile",
      "mercado_pago_checkout",
      "system_orders",
      "system_bookings",
      "product_variants",
      "product_complements",
      "promotions_and_coupons",
      "local_shipping_config",
      "supplier_management",
      "financial_categories",
      "xml_import",
      "basic_financial",
      "basic_reports",
      "national_shipping",
      "full_shipping_management",
      "advanced_financial",
      "cash_flow",
      "dre_report",
      "advanced_reports",
      "service_orders",
      "returns_and_exchanges",
      "product_kits",
      "marketplace_highlight",
      "search_priority",
      "complete_reports",
      "subscriptions_recurring",
      "multistore",
      "invoice_integration"
    ]'::jsonb
  )
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  price = EXCLUDED.price,
  limits_json = EXCLUDED.limits_json,
  features_json = EXCLUDED.features_json,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
