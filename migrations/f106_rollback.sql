-- ============================================================================
-- Rollback: Fase 10.6 — Remove financial breakdown columns from public.sales
-- ============================================================================

BEGIN;

ALTER TABLE public.sales DROP COLUMN IF EXISTS payment_method_interest_amount;
ALTER TABLE public.sales DROP COLUMN IF EXISTS payment_method_fee_amount;
ALTER TABLE public.sales DROP COLUMN IF EXISTS payment_method_fixed_fee_amount;

COMMIT;

NOTIFY pgrst, 'reload schema';
