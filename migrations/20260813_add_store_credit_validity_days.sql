-- Migration: Add store credit validity days to partner return policies
ALTER TABLE public.partner_return_policies
  ADD COLUMN IF NOT EXISTS store_credit_validity_days INTEGER NOT NULL DEFAULT 180;

COMMENT ON COLUMN public.partner_return_policies.store_credit_validity_days IS
  'Validity period for store credits (vales-compra) in days. 0 means no expiration (nunca expira). Default is 180 days.';
