-- ============================================================================
-- ROLLBACK for 20261005_recurring_shipping.sql
--
-- Reverte:
--   1. recurring_executions.shipping_amount
--   2. colunas de snapshot de recurring_subscriptions
--   3. shipping_mode / shipping_flat_amount de recurring_plans
--
-- ATENCAO: remove o valor de frete contratado das assinaturas. Assinaturas que
-- ja receberam frete passam a ser registradas com 0 em novas execucoes.
-- Rode somente junto com um deploy anterior.
-- ============================================================================

BEGIN;

-- 3) planos
ALTER TABLE public.recurring_plans
  DROP CONSTRAINT IF EXISTS recurring_plans_shipping_flat_amount_check;
ALTER TABLE public.recurring_plans
  DROP CONSTRAINT IF EXISTS recurring_plans_shipping_mode_check;

ALTER TABLE public.recurring_plans DROP COLUMN IF EXISTS shipping_flat_amount;
ALTER TABLE public.recurring_plans DROP COLUMN IF EXISTS shipping_mode;

-- 2) assinaturas
ALTER TABLE public.recurring_subscriptions
  DROP CONSTRAINT IF EXISTS recurring_subscriptions_pending_shipping_amount_check;
ALTER TABLE public.recurring_subscriptions
  DROP CONSTRAINT IF EXISTS recurring_subscriptions_shipping_amount_check;
ALTER TABLE public.recurring_subscriptions
  DROP CONSTRAINT IF EXISTS recurring_subscriptions_shipping_source_check;

ALTER TABLE public.recurring_subscriptions DROP COLUMN IF EXISTS pending_shipping_amount;
ALTER TABLE public.recurring_subscriptions DROP COLUMN IF EXISTS pending_address;
ALTER TABLE public.recurring_subscriptions DROP COLUMN IF EXISTS carrier_service_id;
ALTER TABLE public.recurring_subscriptions DROP COLUMN IF EXISTS shipping_quoted_at;
ALTER TABLE public.recurring_subscriptions DROP COLUMN IF EXISTS shipping_source;
ALTER TABLE public.recurring_subscriptions DROP COLUMN IF EXISTS shipping_amount;

-- 1) execucoes
ALTER TABLE public.recurring_executions
  DROP CONSTRAINT IF EXISTS recurring_executions_shipping_amount_check;
ALTER TABLE public.recurring_executions DROP COLUMN IF EXISTS shipping_amount;

COMMIT;
