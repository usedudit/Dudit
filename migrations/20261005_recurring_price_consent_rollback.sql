-- Rollback de 20261005_recurring_price_consent.sql.
--
-- Ordem inversa: notificacoes -> funcoes -> baseline -> colunas -> status.

BEGIN;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'order_created',
    'order_paid',
    'order_shipped',
    'order_delivered',
    'order_cancelled',
    'order_refunded',
    'appointment_created',
    'appointment_confirmed',
    'appointment_reminder',
    'appointment_cancelled',
    'subscription_created',
    'subscription_renewed',
    'message_received',
    'admin_announcement',
    'low_stock',
    'replenishment_suggested',
    'xml_import_completed',
    'cart_abandoned'
  ));

DROP FUNCTION IF EXISTS public.apply_recurring_plan_change(UUID);
DROP FUNCTION IF EXISTS public.mark_recurring_plan_price_change(UUID, INTEGER);

-- create_subscription_snapshot volta para a versao original (sem baseline).
CREATE OR REPLACE FUNCTION public.create_subscription_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  INSERT INTO public.recurring_subscription_items (
    subscription_id, item_type, product_id, variant_id, service_id,
    quantity, unit_price, staff_partner_user_id, preferred_time,
    duration_minutes, sort_order
  )
  SELECT
    NEW.id,
    rpi.item_type,
    rpi.product_id,
    rpi.variant_id,
    rpi.service_id,
    rpi.quantity,
    public.recurring_plan_item_price(
      rpi.item_type, rpi.product_id, rpi.variant_id, rpi.service_id, rpi.unit_price
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

DROP FUNCTION IF EXISTS public.recurring_plan_items_hash(UUID);

DROP INDEX IF EXISTS public.idx_recurring_subscriptions_price_change_window;

ALTER TABLE public.recurring_subscriptions
  DROP COLUMN IF EXISTS pending_cancellation_reason,
  DROP COLUMN IF EXISTS price_change_decision,
  DROP COLUMN IF EXISTS price_change_expires_at,
  DROP COLUMN IF EXISTS price_change_requested_at,
  DROP COLUMN IF EXISTS contracted_items_hash,
  DROP COLUMN IF EXISTS contracted_amount;

ALTER TABLE public.recurring_subscriptions
  DROP CONSTRAINT IF EXISTS recurring_subscriptions_status_check;

ALTER TABLE public.recurring_subscriptions
  ADD CONSTRAINT recurring_subscriptions_status_check CHECK (status IN (
    'active',
    'paused',
    'cancelled',
    'expired',
    'awaiting_restock',
    'pending',
    'payment_failed',
    'past_due'
  ));

UPDATE public.recurring_subscriptions SET status = 'active'
WHERE status = 'awaiting_customer_decision';

COMMENT ON COLUMN public.recurring_subscriptions.status IS
  'active | paused | cancelled | expired | awaiting_restock | '
  'pending (aguardando webhook do MP) | past_due (dunning em retry) | '
  'payment_failed (tentativas esgotadas)';

COMMIT;
