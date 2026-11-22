-- =============================================================================
-- MIGRATION: Coupon Online Storefront Visibility (Vitrine Online)
-- Date: 2026-11-22
-- Description: Adds show_in_marketplace column (default true) to public.coupons,
--              creates the corresponding index, and drops the legacy
--              is_automatic column and index.
-- =============================================================================

ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS show_in_marketplace boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_coupons_partner_active_marketplace
  ON public.coupons (partner_id, is_active, show_in_marketplace);

DROP INDEX IF EXISTS public.idx_coupons_partner_active_automatic;

ALTER TABLE public.coupons
  DROP COLUMN IF EXISTS is_automatic;
