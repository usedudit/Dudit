-- ============================================================================
-- PAYMENTS & RECEIVABLES — Nova camada financeira (Fase 1)
-- Data: 2026-08-04 | Projeto: Dudit
-- ----------------------------------------------------------------------------
-- Aditivo e idempotente. NÃO altera tabelas existentes, NÃO recalcula saldos,
-- NÃO toca em transactions/relatórios/dashboards. Cria apenas a nova camada:
--
--   payments   (1) ──→ receivables (N)
--
--   payments   = 1 registro por pagamento/aprovação de uma venda
--                (bruto, juros, desconto, taxa do gateway, líquido, cartão,
--                 status do ciclo de vida, idempotência de webhook/gateway)
--   receivables = 1 linha por parcela de DINHEIRO DO VENDEDOR
--                (regime de liquidação da adquirente: expected_settlement_date,
--                 baixa manual, antecipação, chargeback)
--
-- Convenções seguidas (idênticas aos módulos mais recentes):
--   - RLS: partner_id IN (SELECT public.get_user_partner_ids())
--   - Índices: CREATE INDEX IF NOT EXISTS idx_<tabela>_<coluna>
--   - updated_at via função compartilhada update_updated_at_column()
-- ============================================================================

-- ─── PAYMENTS ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Relacionamentos (loose coupling: todas opcionais exceto partner)
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    payment_method_id UUID REFERENCES public.payment_methods(id) ON DELETE SET NULL,
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Provedor (quem processou/processa o pagamento)
    provider TEXT NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual', 'mercado_pago')),
    provider_payment_id TEXT,
    provider_status TEXT,
    provider_payment_type TEXT,

    -- Financeiro (valores validados no servidor, nunca confiados ao cliente)
    amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),          -- bruto pago pelo cliente
    base_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (base_amount >= 0),
    interest_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (interest_amount >= 0), -- juros ao cliente
    discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    fee_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),           -- taxa % do gateway
    fixed_fee_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (fixed_fee_amount >= 0), -- taxa fixa do gateway
    net_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (net_amount >= 0),           -- líquido (após taxas)
    fee_details JSONB NOT NULL DEFAULT '{}',

    -- Parcelamento
    installment_count INTEGER NOT NULL DEFAULT 1 CHECK (installment_count BETWEEN 1 AND 48),
    installments_selected INTEGER NOT NULL DEFAULT 1 CHECK (installments_selected BETWEEN 1 AND 48),

    -- Ciclo de vida
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'approved', 'rejected', 'refunded',
        'charged_back', 'cancelled', 'expired'
    )),
    amount_refunded NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount_refunded >= 0),
    refunded_at TIMESTAMPTZ,
    refund_reason TEXT,

    -- Dados do cartão (somente rastreio, nunca CVC/token completo)
    card_last_digits TEXT,
    card_brand TEXT,
    cardholder_name TEXT,

    -- Timing
    approved_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,

    -- Idempotência (webhook/gateway: retry seguro)
    idempotency_key TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_partner_id
    ON public.payments (partner_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id
    ON public.payments (order_id)
    WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_partner_created
    ON public.payments (partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_provider_payment
    ON public.payments (provider_payment_id)
    WHERE provider_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_status
    ON public.payments (status);
CREATE INDEX IF NOT EXISTS idx_payments_partner_status
    ON public.payments (partner_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency_key
    ON public.payments (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- ─── RECEIVABLES ─────────────────────────────────────────────────────────────
-- 1 linha = 1 parcela do dinheiro do VENDEDOR (recebimento da adquirente),
-- não a dívida do cliente. Para cartão, a dívida é da adquirente.

CREATE TABLE IF NOT EXISTS public.receivables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Relacionamentos (loose coupling: todas opcionais exceto partner)
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    account_id UUID REFERENCES public.finance_accounts(id) ON DELETE SET NULL,
    received_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL, -- preenchido na Fase 3
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Parcelamento
    installment_number INTEGER NOT NULL DEFAULT 1 CHECK (installment_number >= 1),
    installment_count INTEGER NOT NULL DEFAULT 1 CHECK (installment_count >= 1),

    -- Valores
    gross_amount NUMERIC(14,2) NOT NULL CHECK (gross_amount >= 0),
    fee_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
    net_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (net_amount >= 0),

    -- Liquidação (regime da adquirente: quando o dinheiro entra de fato)
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

-- ─── UPDATED AT TRIGGERS ─────────────────────────────────────────────────────
-- Reutiliza a função compartilhada update_updated_at_column() (já existente,
-- usada por finance_accounts, transactions, etc.)

DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
CREATE TRIGGER trg_payments_updated_at
    BEFORE UPDATE ON public.payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_receivables_updated_at ON public.receivables;
CREATE TRIGGER trg_receivables_updated_at
    BEFORE UPDATE ON public.receivables
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
-- Padrão atual do projeto (billing module 20260715, f12/f15):
--   partner_id IN (SELECT public.get_user_partner_ids())

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payments_partner_select ON public.payments;
CREATE POLICY payments_partner_select ON public.payments
    FOR SELECT USING (partner_id IN (SELECT public.get_user_partner_ids()));

DROP POLICY IF EXISTS payments_partner_insert ON public.payments;
CREATE POLICY payments_partner_insert ON public.payments
    FOR INSERT WITH CHECK (partner_id IN (SELECT public.get_user_partner_ids()));

DROP POLICY IF EXISTS payments_partner_update ON public.payments;
CREATE POLICY payments_partner_update ON public.payments
    FOR UPDATE USING (partner_id IN (SELECT public.get_user_partner_ids()))
    WITH CHECK (partner_id IN (SELECT public.get_user_partner_ids()));

DROP POLICY IF EXISTS payments_partner_delete ON public.payments;
CREATE POLICY payments_partner_delete ON public.payments
    FOR DELETE USING (partner_id IN (SELECT public.get_user_partner_ids()));

DROP POLICY IF EXISTS payments_service_all ON public.payments;
CREATE POLICY payments_service_all ON public.payments
    FOR ALL TO service_role USING (true);

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
