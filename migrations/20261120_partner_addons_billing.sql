-- Migration: Add Mercado Pago subscription billing columns to partner_addons
-- Supports recurring monthly addon subscriptions via Mercado Pago Preapproval

ALTER TABLE public.partner_addons
    ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS mp_preapproval_id TEXT,
    ADD COLUMN IF NOT EXISTS mp_init_point TEXT,
    ADD COLUMN IF NOT EXISTS billing_email TEXT,
    ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_partner_addons_mp_preapproval_id
    ON public.partner_addons(mp_preapproval_id)
    WHERE mp_preapproval_id IS NOT NULL;
