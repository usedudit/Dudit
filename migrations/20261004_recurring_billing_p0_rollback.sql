-- ============================================================================
-- ROLLBACK for 20261004_recurring_billing_p0.sql
--
-- Reverte:
--   1. CHECK de recurring_subscriptions (remove pending/payment_failed/past_due)
--   2. CHECK de recurring_executions (remove awaiting_payment) e colunas de
--      dunning (payment_attempts, last_payment_failed_at)
--   3. recurring_plans.price e os triggers/funcoes de manutencao de preco
--   4. create_subscription_snapshot volta para a versao original (que contem
--      a referencia quebrada a product_variants.price)
--
-- ATENCAO: as assinaturas com status pending/payment_failed/past_due e as
-- execucoes em awaiting_payment deixam de ser validas e passam a falhar em
-- qualquer UPDATE que toque a linha. Rode somente junto com um deploy anterior.
-- ============================================================================

BEGIN;

-- 4) snapshot: restaura a implementacao de 20260711
CREATE OR REPLACE FUNCTION public.create_subscription_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
    INSERT INTO public.recurring_subscription_items (
        subscription_id, item_type, product_id, variant_id, service_id,
        quantity, unit_price, staff_partner_user_id, preferred_time, duration_minutes, sort_order
    )
    SELECT
        NEW.id,
        rpi.item_type,
        rpi.product_id,
        rpi.variant_id,
        rpi.service_id,
        rpi.quantity,
        COALESCE(
            rpi.unit_price,
            (CASE
                WHEN rpi.item_type = 'product' AND rpi.variant_id IS NOT NULL THEN (SELECT COALESCE(price, 0) FROM public.product_variants WHERE id = rpi.variant_id)
                WHEN rpi.item_type = 'product' AND rpi.variant_id IS NULL THEN (SELECT COALESCE(price, 0) FROM public.products WHERE id = rpi.product_id)
                WHEN rpi.item_type = 'service' THEN (SELECT COALESCE(price, 0) FROM public.services WHERE id = rpi.service_id)
                ELSE 0.00
            END),
            0.00
        ),
        rpi.staff_partner_user_id,
        rpi.preferred_time,
        rpi.duration_minutes,
        rpi.sort_order
    FROM public.recurring_plan_items rpi
    WHERE rpi.plan_id = NEW.recurring_plan_id;

    RETURN NEW;
END;
$$;

-- 3) preco do plano
DROP TRIGGER IF EXISTS trigger_recurring_plan_items_refresh_price
  ON public.recurring_plan_items;
DROP TRIGGER IF EXISTS trigger_recurring_plans_price_from_products
  ON public.products;
DROP TRIGGER IF EXISTS trigger_recurring_plans_price_from_variants
  ON public.product_variants;
DROP TRIGGER IF EXISTS trigger_recurring_plans_price_from_services
  ON public.services;

DROP FUNCTION IF EXISTS public.recurring_plans_refresh_price();
DROP FUNCTION IF EXISTS public.recurring_plan_total(UUID);
DROP FUNCTION IF EXISTS public.recurring_plan_item_price(TEXT, UUID, UUID, UUID, NUMERIC);

ALTER TABLE public.recurring_plans DROP COLUMN IF EXISTS price;

-- 2) execucoes
ALTER TABLE public.recurring_executions DROP COLUMN IF EXISTS last_payment_failed_at;
ALTER TABLE public.recurring_executions DROP COLUMN IF EXISTS payment_attempts;

ALTER TABLE public.recurring_executions
  DROP CONSTRAINT IF EXISTS recurring_executions_status_check;

ALTER TABLE public.recurring_executions
  ADD CONSTRAINT recurring_executions_status_check CHECK (status IN (
    'pending', 'processing', 'completed', 'failed'
  ));

-- 1) assinaturas
ALTER TABLE public.recurring_subscriptions
  DROP CONSTRAINT IF EXISTS recurring_subscriptions_status_check;

ALTER TABLE public.recurring_subscriptions
  ADD CONSTRAINT recurring_subscriptions_status_check CHECK (status IN (
    'active', 'paused', 'cancelled', 'expired', 'awaiting_restock'
  ));

COMMENT ON COLUMN public.recurring_subscriptions.status IS NULL;

COMMIT;
