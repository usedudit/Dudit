-- Installment groups (parcelado) - independent from recurring templates

CREATE TABLE IF NOT EXISTS public.installment_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    total_amount NUMERIC(14,2) NOT NULL CHECK (total_amount > 0),
    installments_count INTEGER NOT NULL CHECK (installments_count >= 1 AND installments_count <= 48),
    frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
    "interval" INTEGER NOT NULL DEFAULT 1 CHECK ("interval" >= 1),
    interval_value INTEGER NOT NULL DEFAULT 1 CHECK (interval_value >= 1),
    start_date TIMESTAMPTZ NOT NULL,
    category_id UUID NULL REFERENCES public.financial_categories(id) ON DELETE SET NULL,
    subcategory_id UUID NULL REFERENCES public.financial_categories(id) ON DELETE SET NULL,
    account_id UUID NULL REFERENCES public.finance_accounts(id) ON DELETE SET NULL,
    contact_id UUID NULL REFERENCES public.transaction_contacts(id) ON DELETE SET NULL,
    payment_method_id UUID NULL REFERENCES public.payment_methods(id) ON DELETE SET NULL,
    created_by_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS installment_group_id UUID NULL REFERENCES public.installment_groups(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS installment_number INTEGER NULL;

CREATE INDEX IF NOT EXISTS idx_installment_groups_partner_id
    ON public.installment_groups(partner_id);

CREATE INDEX IF NOT EXISTS idx_transactions_installment_group_id
    ON public.transactions(installment_group_id);

ALTER TABLE public.installment_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "installment_groups_select_own" ON public.installment_groups;
CREATE POLICY "installment_groups_select_own" ON public.installment_groups
  FOR SELECT USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "installment_groups_insert_own" ON public.installment_groups;
CREATE POLICY "installment_groups_insert_own" ON public.installment_groups
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
  );
