-- ============================================================================
-- Script de Criação: Sistema de Reembolsos de Assinaturas e Faturas (Dudit)
-- ============================================================================
-- Execute este script no SQL Editor do Supabase para criar a estrutura
-- de solicitações de reembolso de assinaturas/faturas.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.billing_refund_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
    purchase_id UUID NOT NULL REFERENCES public.billing_purchases(id) ON DELETE CASCADE,
    payment_id UUID REFERENCES public.billing_payments(id) ON DELETE SET NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    refunded_amount NUMERIC(12, 2) DEFAULT 0 CHECK (refunded_amount >= 0),
    reason_category TEXT NOT NULL CHECK (
        reason_category IN (
            'repentance_7_days',
            'double_charge',
            'technical_issue',
            'commercial_agreement',
            'unsatisfied',
            'other'
        )
    ),
    reason_description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'under_review', 'approved', 'rejected', 'cancelled')
    ),
    images JSONB NOT NULL DEFAULT '[]'::jsonb,
    documents JSONB NOT NULL DEFAULT '[]'::jsonb,
    admin_response TEXT,
    admin_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
    admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    mp_refund_id TEXT,
    is_within_7_days BOOLEAN NOT NULL DEFAULT false,
    token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
    grace_period_ends_at TIMESTAMPTZ,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comentários
COMMENT ON TABLE public.billing_refund_requests IS 'Solicitações de reembolso de assinaturas e faturas com evidências e controle de estorno.';
COMMENT ON COLUMN public.billing_refund_requests.token IS 'Token seguro para acesso ao portal de acompanhamento público /reembolso/[token].';
COMMENT ON COLUMN public.billing_refund_requests.is_within_7_days IS 'Indica se a solicitação foi feita dentro do prazo legal de 7 dias do CDC.';
COMMENT ON COLUMN public.billing_refund_requests.grace_period_ends_at IS 'Data/hora de término da carência de 24h após aprovação do reembolso antes do rebaixamento para o Plano Gratuito.';

-- Índices
CREATE INDEX IF NOT EXISTS idx_billing_refund_requests_partner ON public.billing_refund_requests(partner_id);
CREATE INDEX IF NOT EXISTS idx_billing_refund_requests_purchase ON public.billing_refund_requests(purchase_id);
CREATE INDEX IF NOT EXISTS idx_billing_refund_requests_status ON public.billing_refund_requests(status);
CREATE INDEX IF NOT EXISTS idx_billing_refund_requests_token ON public.billing_refund_requests(token);
CREATE INDEX IF NOT EXISTS idx_billing_refund_requests_created ON public.billing_refund_requests(created_at DESC);

-- Habilitar RLS
ALTER TABLE public.billing_refund_requests ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
DROP POLICY IF EXISTS "billing_refund_requests_partner_select" ON public.billing_refund_requests;
CREATE POLICY "billing_refund_requests_partner_select"
    ON public.billing_refund_requests
    FOR SELECT
    USING (
        partner_id IN (
            SELECT id FROM public.partners WHERE user_id = auth.uid()
            UNION
            SELECT partner_id FROM public.partner_users WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "billing_refund_requests_partner_insert" ON public.billing_refund_requests;
CREATE POLICY "billing_refund_requests_partner_insert"
    ON public.billing_refund_requests
    FOR INSERT
    WITH CHECK (
        partner_id IN (
            SELECT id FROM public.partners WHERE user_id = auth.uid()
            UNION
            SELECT partner_id FROM public.partner_users WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "billing_refund_requests_service_all" ON public.billing_refund_requests;
CREATE POLICY "billing_refund_requests_service_all"
    ON public.billing_refund_requests
    FOR ALL
    TO service_role
    USING (true);
