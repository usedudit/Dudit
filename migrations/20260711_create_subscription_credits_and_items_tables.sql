-- Migração SQL: Evolução das assinaturas recorrentes com snapshots de itens e gestão de créditos

-- 1) Adicionar colunas na tabela de planos (recurring_plans)
ALTER TABLE public.recurring_plans
    ADD COLUMN IF NOT EXISTS billing_mode TEXT NOT NULL DEFAULT 'manual' CHECK (billing_mode IN ('manual', 'auto_mercado_pago')),
    ADD COLUMN IF NOT EXISTS credit_expiration_policy TEXT NOT NULL DEFAULT 'end_of_cycle' CHECK (credit_expiration_policy IN ('never', 'end_of_cycle', 'fixed_days')),
    ADD COLUMN IF NOT EXISTS credit_expiration_days INTEGER NULL;

-- 2) Adicionar colunas na tabela de assinaturas (recurring_subscriptions)
ALTER TABLE public.recurring_subscriptions
    ADD COLUMN IF NOT EXISTS billing_mode TEXT NULL CHECK (billing_mode IN ('manual', 'auto_mercado_pago'));

-- Atualizar constraint de status em recurring_subscriptions
-- Remove a constraint antiga se existir
ALTER TABLE public.recurring_subscriptions DROP CONSTRAINT IF EXISTS recurring_subscriptions_status_check;
-- Adiciona a constraint atualizada contendo 'awaiting_restock'
ALTER TABLE public.recurring_subscriptions
    ADD CONSTRAINT recurring_subscriptions_status_check CHECK (status IN ('active', 'paused', 'cancelled', 'expired', 'awaiting_restock'));

-- 3) Adicionar coluna de déficit em recurring_executions
ALTER TABLE public.recurring_executions
    ADD COLUMN IF NOT EXISTS restock_deficit JSONB NULL;

-- 4) Criar a tabela de snapshot dos itens da assinatura (recurring_subscription_items)
CREATE TABLE IF NOT EXISTS public.recurring_subscription_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES public.recurring_subscriptions(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL CHECK (item_type IN ('product', 'service')),
    product_id UUID NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    variant_id UUID NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
    service_id UUID NULL REFERENCES public.services(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
    staff_partner_user_id UUID NULL REFERENCES public.partner_users(id) ON DELETE SET NULL,
    preferred_time TIME NULL,
    duration_minutes INTEGER NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT recurring_subscription_items_only_one_type CHECK (
        (product_id IS NOT NULL AND service_id IS NULL) OR
        (product_id IS NULL AND service_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_recurring_sub_items_sub_id ON public.recurring_subscription_items(subscription_id);

-- 5) Criar a tabela de saldo de créditos (subscription_item_credits)
CREATE TABLE IF NOT EXISTS public.subscription_item_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    subscription_id UUID NULL REFERENCES public.recurring_subscriptions(id) ON DELETE SET NULL,
    subscription_item_id UUID NOT NULL REFERENCES public.recurring_subscription_items(id) ON DELETE CASCADE,
    service_id UUID NULL REFERENCES public.services(id) ON DELETE RESTRICT,
    product_id UUID NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    consumed INTEGER NOT NULL DEFAULT 0 CHECK (consumed <= quantity),
    expires_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_item_credits_lookup ON public.subscription_item_credits(customer_id, service_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_sub_item_credits_partner ON public.subscription_item_credits(partner_id);

-- 6) Criar a tabela do ledger de transações de crédito (subscription_item_credit_ledger)
CREATE TABLE IF NOT EXISTS public.subscription_item_credit_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    service_id UUID NULL REFERENCES public.services(id) ON DELETE RESTRICT,
    product_id UUID NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('grant', 'consume', 'expire', 'refund')),
    credit_id UUID NULL REFERENCES public.subscription_item_credits(id) ON DELETE SET NULL,
    appointment_id UUID NULL REFERENCES public.appointments(id) ON DELETE SET NULL,
    order_id UUID NULL REFERENCES public.orders(id) ON DELETE SET NULL,
    execution_id UUID NULL REFERENCES public.recurring_executions(id) ON DELETE SET NULL,
    idempotency_key TEXT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_credit_ledger_lookup ON public.subscription_item_credit_ledger(customer_id, service_id);
CREATE INDEX IF NOT EXISTS idx_sub_credit_ledger_partner ON public.subscription_item_credit_ledger(partner_id);

-- 7) Habilitar RLS e criar Políticas
ALTER TABLE public.recurring_subscription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_item_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_item_credit_ledger ENABLE ROW LEVEL SECURITY;

-- Políticas para recurring_subscription_items
DROP POLICY IF EXISTS recurring_subscription_items_partner ON public.recurring_subscription_items;
CREATE POLICY recurring_subscription_items_partner ON public.recurring_subscription_items FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.recurring_subscriptions rs
        JOIN public.partner_users pu ON pu.partner_id = rs.partner_id
        WHERE rs.id = recurring_subscription_items.subscription_id AND pu.user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS recurring_subscription_items_customer_select ON public.recurring_subscription_items;
CREATE POLICY recurring_subscription_items_customer_select ON public.recurring_subscription_items FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.recurring_subscriptions rs
        JOIN public.customers c ON c.id = rs.customer_id
        WHERE rs.id = recurring_subscription_items.subscription_id AND c.user_id = auth.uid()
    )
);

-- Políticas para subscription_item_credits
DROP POLICY IF EXISTS subscription_item_credits_partner ON public.subscription_item_credits;
CREATE POLICY subscription_item_credits_partner ON public.subscription_item_credits FOR ALL USING (
    EXISTS (SELECT 1 FROM public.partner_users pu WHERE pu.partner_id = subscription_item_credits.partner_id AND pu.user_id = auth.uid())
);

DROP POLICY IF EXISTS subscription_item_credits_customer_select ON public.subscription_item_credits;
CREATE POLICY subscription_item_credits_customer_select ON public.subscription_item_credits FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.customers c WHERE c.id = subscription_item_credits.customer_id AND c.user_id = auth.uid())
);

-- Políticas para subscription_item_credit_ledger
DROP POLICY IF EXISTS subscription_item_credit_ledger_partner ON public.subscription_item_credit_ledger;
CREATE POLICY subscription_item_credit_ledger_partner ON public.subscription_item_credit_ledger FOR ALL USING (
    EXISTS (SELECT 1 FROM public.partner_users pu WHERE pu.partner_id = subscription_item_credit_ledger.partner_id AND pu.user_id = auth.uid())
);

DROP POLICY IF EXISTS subscription_item_credit_ledger_customer_select ON public.subscription_item_credit_ledger;
CREATE POLICY subscription_item_credit_ledger_customer_select ON public.subscription_item_credit_ledger FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.customers c WHERE c.id = subscription_item_credit_ledger.customer_id AND c.user_id = auth.uid())
);

-- 8) Trigger de updated_at para subscription_item_credits
DROP TRIGGER IF EXISTS update_sub_item_credits_updated_at ON public.subscription_item_credits;
CREATE TRIGGER update_sub_item_credits_updated_at
    BEFORE UPDATE ON public.subscription_item_credits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
