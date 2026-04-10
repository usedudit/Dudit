-- Contas financeiras (caixa, banco, carteira) por parceiro

CREATE TABLE IF NOT EXISTS public.finance_accounts (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    initial_balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
    current_balance NUMERIC(14, 2),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT finance_accounts_pkey PRIMARY KEY (id),
    CONSTRAINT finance_accounts_type_check CHECK (type IN ('cash', 'bank', 'wallet'))
);

CREATE INDEX IF NOT EXISTS idx_finance_accounts_partner ON public.finance_accounts(partner_id);
CREATE INDEX IF NOT EXISTS idx_finance_accounts_type ON public.finance_accounts(partner_id, type);

ALTER TABLE public.finance_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Partners can manage their own finance accounts" ON public.finance_accounts;
CREATE POLICY "Partners can manage their own finance accounts" ON public.finance_accounts
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM partners
            WHERE partners.id = finance_accounts.partner_id AND partners.user_id = auth.uid()
        )
    );

DROP TRIGGER IF EXISTS update_finance_accounts_updated_at ON public.finance_accounts;
CREATE TRIGGER update_finance_accounts_updated_at
    BEFORE UPDATE ON public.finance_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
