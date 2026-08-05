-- ==============================================================================
-- ROLLBACK — DROP RECEIVABLES (recria a tabela exatamente como criada na Fase 1)
-- Data: 2026-08-05 | Projeto: Dudit
-- Descrição: Restaura public.receivables com a mesma DDL da migration
-- 20260804_create_payments_and_receivables.sql (idempotente). A tabela fica
-- vazia; o rollback só deve ser usado se a decisão de remoção for revertida.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.receivables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Relacionamentos (loose coupling: todas opcionais exceto partner)
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    account_id UUID REFERENCES public.finance_accounts(id) ON DELETE SET NULL,
    received_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Parcelamento
    installment_number INTEGER NOT NULL DEFAULT 1 CHECK (installment_number >= 1),
    installment_count INTEGER NOT NULL DEFAULT 1 CHECK (installment_count >= 1),

    -- Valores
    gross_amount NUMERIC(14,2) NOT NULL CHECK (gross_amount >= 0),
    fee_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
    net_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (net_amount >= 0),

    -- Liquidação
    expected_settlement_date DATE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'scheduled', 'received', 'anticipated',
        'charged_back', 'cancelled'
    )),
    received_at TIMESTAMPTZ,

    -- Antecipação
    anticipated_at TIMESTAMPTZ,
    anticipation_fee NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (anticipation_fee >= 0),
    anticipation_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (anticipation_amount >= 0),

    -- Chargeback
    chargeback_at TIMESTAMPTZ,
    chargeback_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (chargeback_amount >= 0),
    chargeback_reason TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receivables_partner_status
    ON public.receivables (partner_id, status);
CREATE INDEX IF NOT EXISTS idx_receivables_order_id
    ON public.receivables (order_id)
    WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_receivables_payment_id
    ON public.receivables (payment_id)
    WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_receivables_partner_settlement
    ON public.receivables (partner_id, expected_settlement_date)
    WHERE expected_settlement_date IS NOT NULL;

DROP TRIGGER IF EXISTS trg_receivables_updated_at ON public.receivables;
CREATE TRIGGER trg_receivables_updated_at
    BEFORE UPDATE ON public.receivables
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.receivables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS receivables_partner_select ON public.receivables;
CREATE POLICY receivables_partner_select ON public.receivables
    FOR SELECT USING (partner_id IN (SELECT public.get_user_partner_ids()));

DROP POLICY IF EXISTS receivables_partner_insert ON public.receivables;
CREATE POLICY receivables_partner_insert ON public.receivables
    FOR INSERT WITH CHECK (partner_id IN (SELECT public.get_user_partner_ids()));

DROP POLICY IF EXISTS receivables_partner_update ON public.receivables;
CREATE POLICY receivables_partner_update ON public.receivables
    FOR UPDATE USING (partner_id IN (SELECT public.get_user_partner_ids()))
    WITH CHECK (partner_id IN (SELECT public.get_user_partner_ids()));

DROP POLICY IF EXISTS receivables_partner_delete ON public.receivables;
CREATE POLICY receivables_partner_delete ON public.receivables
    FOR DELETE USING (partner_id IN (SELECT public.get_user_partner_ids()));

DROP POLICY IF EXISTS receivables_service_all ON public.receivables;
CREATE POLICY receivables_service_all ON public.receivables
    FOR ALL TO service_role USING (true);