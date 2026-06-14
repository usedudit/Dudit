-- =============================================================================
-- Add marketplace_user_id to customers for one-ERP-customer-per-seller mapping
-- =============================================================================

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS marketplace_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;

-- Enforce one ERP customer per marketplace user per seller
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_unique_partner_marketplace_user
  ON public.customers(partner_id, marketplace_user_id)
  WHERE marketplace_user_id IS NOT NULL;

-- Backfill marketplace_user_id from existing user_id values
UPDATE public.customers
SET marketplace_user_id = user_id
WHERE marketplace_user_id IS NULL
  AND user_id IS NOT NULL;
