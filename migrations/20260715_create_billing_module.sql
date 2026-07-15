-- ============================================================================
-- BILLING MODULE — Generic purchase/payment/invoice system
-- ============================================================================
-- This module is the CENTRAL purchase entity for EVERY financial transaction
-- within Dudit. It is NOT subscription-specific. Any current or future
-- purchasable item (subscriptions, addons, credits, featured products,
-- integrations, etc.) flows through billing_purchases.
--
-- Architecture:
--   Purchase (1) ──→ Payments (N)
--   Purchase (1) ──→ Invoice (1)   (snapshot, frozen at generation)
--   Purchase (N) ──→ Partner (1)
--   Purchase (N) ──→ User (1)      (who made the purchase, nullable)
--
-- Relationships to existing tables (loose coupling via polymorphic FK):
--   purchase.purchaseable_type = 'plan'        → purchaseable_id = plans.id
--   purchase.purchaseable_type = 'recurring'   → purchaseable_id = recurring_plans.id
--   purchase.subscription_id                  → subscriptions.id
--   purchase.order_id                         → orders.id
-- ============================================================================

-- ─── BILLING PURCHASES (central entity) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.billing_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Type system: extensible, NOT coupled to subscriptions.
    -- Add new types as needed without schema changes.
    purchase_type TEXT NOT NULL CHECK (purchase_type IN (
        'subscription',
        'addon',
        'marketplace_feature',
        'credit_pack',
        'service',
        'order_payment',
        'future'
    )),

    -- Polymorphic reference to what was purchased (loose coupling).
    purchaseable_type TEXT,
    purchaseable_id UUID,

    -- Financial (prices are validated server-side, never trusted from client)
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'BRL',
    discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),

    -- Status machine
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'completed', 'failed', 'refunded', 'cancelled', 'partially_refunded'
    )),

    -- Gateway abstraction (never reference MP-specific fields here)
    gateway TEXT NOT NULL DEFAULT 'mercado_pago',
    gateway_payment_id TEXT,
    gateway_status TEXT,

    -- Optional relationships to existing systems (nullable, loose coupling)
    subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
    recurring_subscription_id UUID REFERENCES public.recurring_subscriptions(id) ON DELETE SET NULL,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,

    -- Metadata (flexible payload for any purchase type)
    metadata JSONB NOT NULL DEFAULT '{}',
    description TEXT,

    -- Auto-generated invoice reference (set after invoice creation)
    invoice_id UUID,

    -- Audit trail
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique index: only one active purchase per partner per purchaseable
-- This prevents duplicate purchases for the same item (e.g. double subscription)
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_purchases_active_unique
    ON public.billing_purchases (partner_id, purchaseable_type, purchaseable_id)
    WHERE status IN ('pending', 'completed');

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_billing_purchases_partner_created
    ON public.billing_purchases (partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_purchases_type_status
    ON public.billing_purchases (purchase_type, status);
CREATE INDEX IF NOT EXISTS idx_billing_purchases_gateway
    ON public.billing_purchases (gateway, gateway_payment_id)
    WHERE gateway_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_billing_purchases_subscription
    ON public.billing_purchases (subscription_id)
    WHERE subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_billing_purchases_order
    ON public.billing_purchases (order_id)
    WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_billing_purchases_user
    ON public.billing_purchases (user_id)
    WHERE user_id IS NOT NULL;

-- ─── BILLING PAYMENTS (individual payment transactions) ─────────────────────
-- One purchase can have multiple payments (e.g., retry, installment, split)

CREATE TABLE IF NOT EXISTS public.billing_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID NOT NULL REFERENCES public.billing_purchases(id) ON DELETE CASCADE,

    -- Financial
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'BRL',
    fee_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
    net_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (net_amount >= 0),

    -- Status machine
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'processing', 'approved', 'rejected',
        'refunded', 'cancelled', 'chargeback'
    )),

    -- Gateway abstraction
    gateway TEXT NOT NULL DEFAULT 'mercado_pago',
    gateway_payment_id TEXT,
    gateway_status TEXT,
    gateway_response JSONB,

    -- Payment method details
    payment_method_type TEXT,   -- 'pix', 'credit_card', 'boleto', 'account_money', etc.
    payment_method_details JSONB,

    -- PIX / Boleto specific fields
    qr_code TEXT,
    qr_code_base64 TEXT,
    boleto_url TEXT,
    barcode TEXT,
    checkout_url TEXT,          -- redirect URL for gateway checkout

    -- Timing
    paid_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,

    -- Retry logic
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_retry_at TIMESTAMPTZ,

    -- Webhook idempotency
    webhook_id TEXT,
    webhook_processed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_payments_purchase
    ON public.billing_payments (purchase_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_payments_gateway
    ON public.billing_payments (gateway, gateway_payment_id)
    WHERE gateway_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_billing_payments_status
    ON public.billing_payments (status);
CREATE INDEX IF NOT EXISTS idx_billing_payments_webhook
    ON public.billing_payments (webhook_id)
    WHERE webhook_id IS NOT NULL;

-- ─── BILLING INVOICES (snapshot-based, immutable after generation) ──────────
-- The invoice stores a COMPLETE SNAPSHOT of the purchase data at generation
-- time. It NEVER reflects the current DB state. Even if the plan, product,
-- or user is later modified or deleted, the invoice remains unchanged.

CREATE TABLE IF NOT EXISTS public.billing_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID NOT NULL REFERENCES public.billing_purchases(id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,

    -- Human-readable invoice number: INV-2026-XXXXXXXX
    invoice_number TEXT NOT NULL UNIQUE,

    -- SHA-256 verification hash for future public validation endpoint
    -- (/verify/invoice/[code])
    verification_hash TEXT NOT NULL UNIQUE,

    -- COMPLETE SNAPSHOT of invoice data at generation time.
    -- This JSONB payload is the SINGLE SOURCE OF TRUTH for display/print/PDF.
    -- Structure defined by the application, NOT the database.
    invoice_data JSONB NOT NULL,

    -- Status
    status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN (
        'issued', 'cancelled', 'refunded'
    )),

    -- Tracking
    download_count INTEGER NOT NULL DEFAULT 0,
    last_downloaded_at TIMESTAMPTZ,
    viewed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_purchase
    ON public.billing_invoices (purchase_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_partner
    ON public.billing_invoices (partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_number
    ON public.billing_invoices (invoice_number);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_hash
    ON public.billing_invoices (verification_hash);

-- ─── UPDATED AT TRIGGERS ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_billing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_billing_purchases_updated_at
    BEFORE UPDATE ON public.billing_purchases
    FOR EACH ROW EXECUTE FUNCTION public.update_billing_updated_at();

CREATE TRIGGER trg_billing_payments_updated_at
    BEFORE UPDATE ON public.billing_payments
    FOR EACH ROW EXECUTE FUNCTION public.update_billing_updated_at();

CREATE TRIGGER trg_billing_invoices_updated_at
    BEFORE UPDATE ON public.billing_invoices
    FOR EACH ROW EXECUTE FUNCTION public.update_billing_updated_at();

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────────────────────

ALTER TABLE public.billing_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;

-- Partners can view their own purchases
CREATE POLICY billing_purchases_partner_select
    ON public.billing_purchases FOR SELECT
    USING (partner_id IN (SELECT get_user_partner_ids()));

-- Service role can do everything (admin bypass)
CREATE POLICY billing_purchases_service_all
    ON public.billing_purchases FOR ALL
    TO service_role USING (true);

-- Partners can view their own payments (via purchase)
CREATE POLICY billing_payments_partner_select
    ON public.billing_payments FOR SELECT
    USING (purchase_id IN (
        SELECT id FROM public.billing_purchases
        WHERE partner_id IN (SELECT get_user_partner_ids())
    ));

CREATE POLICY billing_payments_service_all
    ON public.billing_payments FOR ALL
    TO service_role USING (true);

-- Partners can view their own invoices
CREATE POLICY billing_invoices_partner_select
    ON public.billing_invoices FOR SELECT
    USING (partner_id IN (SELECT get_user_partner_ids()));

CREATE POLICY billing_invoices_service_all
    ON public.billing_invoices FOR ALL
    TO service_role USING (true);

-- ─── INVOICE NUMBER SEQUENCE ────────────────────────────────────────────────
-- Yearly sequence for invoice numbering: INV-2026-000001

CREATE SEQUENCE IF NOT EXISTS public.billing_invoice_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
