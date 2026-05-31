-- =============================================================================
-- Recurring Plans & Subscriptions (automation layer over orders/appointments)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) recurring_plans
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recurring_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    frequency_type TEXT NOT NULL CHECK (frequency_type IN ('daily', 'weekly', 'monthly', 'yearly', 'custom')),
    frequency_interval INTEGER NOT NULL DEFAULT 1 CHECK (frequency_interval >= 1),
    weekdays INTEGER[] NULL,
    day_of_month INTEGER NULL CHECK (day_of_month IS NULL OR (day_of_month >= 1 AND day_of_month <= 31)),
    use_last_day BOOLEAN NOT NULL DEFAULT FALSE,
    year_month INTEGER NULL CHECK (year_month IS NULL OR (year_month >= 1 AND year_month <= 12)),
    year_day INTEGER NULL CHECK (year_day IS NULL OR (year_day >= 1 AND year_day <= 31)),
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NULL,
    show_in_marketplace BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_plans_partner_id ON public.recurring_plans(partner_id);
CREATE INDEX IF NOT EXISTS idx_recurring_plans_partner_status ON public.recurring_plans(partner_id, status);
CREATE INDEX IF NOT EXISTS idx_recurring_plans_marketplace ON public.recurring_plans(partner_id, status, show_in_marketplace)
    WHERE status = 'active' AND show_in_marketplace = TRUE;

-- -----------------------------------------------------------------------------
-- 2) recurring_plan_items (products and/or services from existing catalog)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recurring_plan_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES public.recurring_plans(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL CHECK (item_type IN ('product', 'service')),
    product_id UUID NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    variant_id UUID NULL REFERENCES public.product_variants(id) ON DELETE SET NULL,
    service_id UUID NULL REFERENCES public.services(id) ON DELETE RESTRICT,
    quantity NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price NUMERIC(14,2) NULL,
    staff_partner_user_id UUID NULL REFERENCES public.partner_users(id) ON DELETE SET NULL,
    preferred_time TIME NULL,
    duration_minutes INTEGER NULL CHECK (duration_minutes IS NULL OR duration_minutes > 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT recurring_plan_items_product_or_service CHECK (
        (item_type = 'product' AND product_id IS NOT NULL AND service_id IS NULL)
        OR (item_type = 'service' AND service_id IS NOT NULL AND product_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_recurring_plan_items_plan_id ON public.recurring_plan_items(plan_id);

-- -----------------------------------------------------------------------------
-- 3) recurring_subscriptions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recurring_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    recurring_plan_id UUID NOT NULL REFERENCES public.recurring_plans(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled', 'expired')),
    next_execution_at TIMESTAMPTZ NOT NULL,
    last_execution_at TIMESTAMPTZ NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paused_at TIMESTAMPTZ NULL,
    cancelled_at TIMESTAMPTZ NULL,
    delivery_type TEXT NOT NULL DEFAULT 'pickup' CHECK (delivery_type IN ('pickup', 'delivery')),
    delivery_address TEXT NULL,
    finance_account_id UUID NULL REFERENCES public.finance_accounts(id) ON DELETE SET NULL,
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_subscriptions_partner_id ON public.recurring_subscriptions(partner_id);
CREATE INDEX IF NOT EXISTS idx_recurring_subscriptions_customer_id ON public.recurring_subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_recurring_subscriptions_plan_id ON public.recurring_subscriptions(recurring_plan_id);
CREATE INDEX IF NOT EXISTS idx_recurring_subscriptions_status_next ON public.recurring_subscriptions(status, next_execution_at)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_recurring_subscriptions_partner_status_next ON public.recurring_subscriptions(partner_id, status, next_execution_at);

-- -----------------------------------------------------------------------------
-- 4) recurring_executions (audit + idempotency)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recurring_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES public.recurring_subscriptions(id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    scheduled_for TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    order_id UUID NULL REFERENCES public.orders(id) ON DELETE SET NULL,
    appointment_ids UUID[] NULL,
    error_message TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ NULL,
    CONSTRAINT recurring_executions_subscription_scheduled_unique UNIQUE (subscription_id, scheduled_for)
);

CREATE INDEX IF NOT EXISTS idx_recurring_executions_partner_id ON public.recurring_executions(partner_id);
CREATE INDEX IF NOT EXISTS idx_recurring_executions_status ON public.recurring_executions(status, created_at);
CREATE INDEX IF NOT EXISTS idx_recurring_executions_subscription_id ON public.recurring_executions(subscription_id);

-- -----------------------------------------------------------------------------
-- 5) Provenance on orders / appointments
-- -----------------------------------------------------------------------------
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS recurring_subscription_id UUID NULL REFERENCES public.recurring_subscriptions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS recurring_execution_id UUID NULL REFERENCES public.recurring_executions(id) ON DELETE SET NULL;

ALTER TABLE public.appointments
    ADD COLUMN IF NOT EXISTS recurring_subscription_id UUID NULL REFERENCES public.recurring_subscriptions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS recurring_execution_id UUID NULL REFERENCES public.recurring_executions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_recurring_subscription_id ON public.orders(recurring_subscription_id)
    WHERE recurring_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_recurring_subscription_id ON public.appointments(recurring_subscription_id)
    WHERE recurring_subscription_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 5b) Link marketplace users to ERP customers (required for subscription RLS)
-- -----------------------------------------------------------------------------
ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_user_id ON public.customers(user_id)
    WHERE user_id IS NOT NULL;

-- Backfill user_id where customer email matches auth.users
UPDATE public.customers c
SET user_id = au.id
FROM auth.users au
WHERE c.user_id IS NULL
  AND c.email IS NOT NULL
  AND au.email IS NOT NULL
  AND lower(trim(c.email)) = lower(trim(au.email));

-- -----------------------------------------------------------------------------
-- 7) updated_at triggers
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS update_recurring_plans_updated_at ON public.recurring_plans;
CREATE TRIGGER update_recurring_plans_updated_at
    BEFORE UPDATE ON public.recurring_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_recurring_subscriptions_updated_at ON public.recurring_subscriptions;
CREATE TRIGGER update_recurring_subscriptions_updated_at
    BEFORE UPDATE ON public.recurring_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 7) RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.recurring_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recurring_plans_partner ON public.recurring_plans;
CREATE POLICY recurring_plans_partner ON public.recurring_plans FOR ALL USING (
    EXISTS (SELECT 1 FROM public.partner_users pu WHERE pu.partner_id = recurring_plans.partner_id AND pu.user_id = auth.uid())
);

DROP POLICY IF EXISTS recurring_plan_items_partner ON public.recurring_plan_items;
CREATE POLICY recurring_plan_items_partner ON public.recurring_plan_items FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.recurring_plans rp
        JOIN public.partner_users pu ON pu.partner_id = rp.partner_id
        WHERE rp.id = recurring_plan_items.plan_id AND pu.user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS recurring_subscriptions_partner ON public.recurring_subscriptions;
CREATE POLICY recurring_subscriptions_partner ON public.recurring_subscriptions FOR ALL USING (
    EXISTS (SELECT 1 FROM public.partner_users pu WHERE pu.partner_id = recurring_subscriptions.partner_id AND pu.user_id = auth.uid())
);

DROP POLICY IF EXISTS recurring_subscriptions_customer_select ON public.recurring_subscriptions;
CREATE POLICY recurring_subscriptions_customer_select ON public.recurring_subscriptions FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.customers c WHERE c.id = recurring_subscriptions.customer_id AND c.user_id = auth.uid())
);

DROP POLICY IF EXISTS recurring_executions_partner ON public.recurring_executions;
CREATE POLICY recurring_executions_partner ON public.recurring_executions FOR ALL USING (
    EXISTS (SELECT 1 FROM public.partner_users pu WHERE pu.partner_id = recurring_executions.partner_id AND pu.user_id = auth.uid())
);

DROP POLICY IF EXISTS recurring_executions_customer_select ON public.recurring_executions;
CREATE POLICY recurring_executions_customer_select ON public.recurring_executions FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.recurring_subscriptions rs
        JOIN public.customers c ON c.id = rs.customer_id
        WHERE rs.id = recurring_executions.subscription_id AND c.user_id = auth.uid()
    )
);

-- Marketplace: customers can read active plans
DROP POLICY IF EXISTS recurring_plans_marketplace_select ON public.recurring_plans;
CREATE POLICY recurring_plans_marketplace_select ON public.recurring_plans FOR SELECT USING (
    status = 'active' AND show_in_marketplace = TRUE
);

DROP POLICY IF EXISTS recurring_plan_items_marketplace_select ON public.recurring_plan_items;
CREATE POLICY recurring_plan_items_marketplace_select ON public.recurring_plan_items FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.recurring_plans rp
        WHERE rp.id = recurring_plan_items.plan_id AND rp.status = 'active' AND rp.show_in_marketplace = TRUE
    )
);

-- -----------------------------------------------------------------------------
-- 8) Recurrence helpers (reuse financial_next_run_date; custom => daily interval)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recurring_plan_next_execution_at(
    p_frequency_type TEXT,
    p_frequency_interval INTEGER,
    p_current_run TIMESTAMPTZ,
    p_start_date TIMESTAMPTZ,
    p_weekdays INTEGER[],
    p_day_of_month INTEGER,
    p_use_last_day BOOLEAN,
    p_year_month INTEGER,
    p_year_day INTEGER
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_frequency TEXT;
BEGIN
    v_frequency := CASE
        WHEN p_frequency_type = 'custom' THEN 'daily'
        ELSE p_frequency_type
    END;

    RETURN public.financial_next_run_date(
        v_frequency,
        GREATEST(COALESCE(p_frequency_interval, 1), 1),
        p_current_run,
        p_start_date,
        p_weekdays,
        p_day_of_month,
        COALESCE(p_use_last_day, FALSE),
        p_year_month,
        p_year_day
    );
END;
$$;

-- Claim due subscriptions atomically (idempotent, multi-worker safe)
CREATE OR REPLACE FUNCTION public.claim_due_recurring_executions(p_limit INTEGER DEFAULT 100)
RETURNS TABLE(
    execution_id UUID,
    subscription_id UUID,
    partner_id UUID,
    customer_id UUID,
    recurring_plan_id UUID,
    scheduled_for TIMESTAMPTZ,
    delivery_type TEXT,
    delivery_address TEXT,
    finance_account_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sub RECORD;
    v_exec_id UUID;
    v_existing_status TEXT;
BEGIN
    FOR v_sub IN
        SELECT rs.*
        FROM public.recurring_subscriptions rs
        JOIN public.recurring_plans rp ON rp.id = rs.recurring_plan_id
        WHERE rs.status = 'active'
          AND rs.next_execution_at <= NOW()
          AND rp.status = 'active'
          AND (rp.end_date IS NULL OR rs.next_execution_at <= rp.end_date)
        ORDER BY rs.next_execution_at ASC
        LIMIT GREATEST(COALESCE(p_limit, 100), 1)
        FOR UPDATE OF rs SKIP LOCKED
    LOOP
        INSERT INTO public.recurring_executions (
            subscription_id, partner_id, scheduled_for, status
        ) VALUES (
            v_sub.id, v_sub.partner_id, v_sub.next_execution_at, 'pending'
        )
        ON CONFLICT ON CONSTRAINT recurring_executions_subscription_scheduled_unique DO NOTHING
        RETURNING id INTO v_exec_id;

        IF v_exec_id IS NOT NULL THEN
            execution_id := v_exec_id;
            subscription_id := v_sub.id;
            partner_id := v_sub.partner_id;
            customer_id := v_sub.customer_id;
            recurring_plan_id := v_sub.recurring_plan_id;
            scheduled_for := v_sub.next_execution_at;
            delivery_type := v_sub.delivery_type;
            delivery_address := v_sub.delivery_address;
            finance_account_id := v_sub.finance_account_id;
            RETURN NEXT;
        ELSE
            SELECT re.status INTO v_existing_status
            FROM public.recurring_executions re
            WHERE re.subscription_id = v_sub.id
              AND re.scheduled_for = v_sub.next_execution_at
            LIMIT 1;

            IF v_existing_status = 'completed' THEN
                PERFORM public.advance_recurring_subscription(v_sub.id, v_sub.next_execution_at);
            ELSIF v_existing_status IN ('pending', 'failed') THEN
                SELECT re.id INTO v_exec_id
                FROM public.recurring_executions re
                WHERE re.subscription_id = v_sub.id
                  AND re.scheduled_for = v_sub.next_execution_at
                LIMIT 1;

                IF v_exec_id IS NOT NULL THEN
                    execution_id := v_exec_id;
                    subscription_id := v_sub.id;
                    partner_id := v_sub.partner_id;
                    customer_id := v_sub.customer_id;
                    recurring_plan_id := v_sub.recurring_plan_id;
                    scheduled_for := v_sub.next_execution_at;
                    delivery_type := v_sub.delivery_type;
                    delivery_address := v_sub.delivery_address;
                    finance_account_id := v_sub.finance_account_id;
                    RETURN NEXT;
                END IF;
            END IF;
        END IF;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_recurring_subscription(
    p_subscription_id UUID,
    p_executed_at TIMESTAMPTZ
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sub public.recurring_subscriptions%ROWTYPE;
    v_plan public.recurring_plans%ROWTYPE;
    v_next TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_sub FROM public.recurring_subscriptions WHERE id = p_subscription_id FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;

    SELECT * INTO v_plan FROM public.recurring_plans WHERE id = v_sub.recurring_plan_id;
    IF NOT FOUND THEN RETURN; END IF;

    v_next := public.recurring_plan_next_execution_at(
        v_plan.frequency_type,
        v_plan.frequency_interval,
        p_executed_at,
        v_plan.start_date,
        v_plan.weekdays,
        v_plan.day_of_month,
        v_plan.use_last_day,
        v_plan.year_month,
        v_plan.year_day
    );

    IF v_plan.end_date IS NOT NULL AND v_next > v_plan.end_date THEN
        UPDATE public.recurring_subscriptions
        SET status = 'expired',
            last_execution_at = p_executed_at,
            next_execution_at = v_next,
            updated_at = NOW()
        WHERE id = p_subscription_id;
    ELSE
        UPDATE public.recurring_subscriptions
        SET last_execution_at = p_executed_at,
            next_execution_at = v_next,
            updated_at = NOW()
        WHERE id = p_subscription_id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_recurring_execution(
    p_execution_id UUID,
    p_order_id UUID DEFAULT NULL,
    p_appointment_ids UUID[] DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_exec public.recurring_executions%ROWTYPE;
BEGIN
    SELECT * INTO v_exec FROM public.recurring_executions WHERE id = p_execution_id FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;
    IF v_exec.status = 'completed' THEN RETURN; END IF;

    UPDATE public.recurring_executions
    SET status = 'completed',
        order_id = COALESCE(p_order_id, order_id),
        appointment_ids = COALESCE(p_appointment_ids, appointment_ids),
        completed_at = NOW(),
        error_message = NULL
    WHERE id = p_execution_id;

    PERFORM public.advance_recurring_subscription(v_exec.subscription_id, v_exec.scheduled_for);
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_recurring_execution(
    p_execution_id UUID,
    p_error_message TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.recurring_executions
    SET status = 'failed',
        error_message = LEFT(COALESCE(p_error_message, 'unknown error'), 2000),
        completed_at = NOW()
    WHERE id = p_execution_id
      AND status <> 'completed';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_recurring_executions(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_recurring_subscription(UUID, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_recurring_execution(UUID, UUID, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_recurring_execution(UUID, TEXT) FROM PUBLIC;
