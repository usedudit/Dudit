-- ============================================================================
-- Delivery drivers profile fields (lightweight)
-- Adds optional phone/notes/active on partner_users for role_id=delivery.
-- Backward compatible: only additive columns.
-- ============================================================================

ALTER TABLE public.partner_users
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_partner_users_partner_role_active
  ON public.partner_users(partner_id, role_id, is_active);

DO $$
BEGIN
  RAISE NOTICE '✅ delivery driver profile columns applied.';
END $$;

