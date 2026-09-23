-- Migration: Setup pg_cron tasks and partial index for high-performance order expiration
-- Description:
-- 1. Creates partial index for instantaneous lookup of pending orders past expiration
-- 2. Creates idempotent SQL function cron_expire_expired_orders()
-- 3. Registers schedule in pg_cron (if pg_cron extension is available on the Supabase project)

-- 1. High-performance partial index for pending orders
CREATE INDEX IF NOT EXISTS idx_orders_pending_expiration 
ON public.orders (payment_expires_at) 
WHERE situation IN ('pending', 'in_process') AND cancelled_at IS NULL;

-- 2. Idempotent SQL procedure to cancel expired orders directly in Postgres
-- Only cancels orders WITHOUT a deposit (regular pending orders).
-- Orders with deposit are handled via the cancelExpiredDepositOrders setting
-- in the retry-payment API (/api/orders/retry-payment).
CREATE OR REPLACE FUNCTION public.cron_expire_expired_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_expired_count integer := 0;
  v_order record;
  v_now timestamptz := clock_timestamp();
  v_cancel_note text;
BEGIN
  v_cancel_note := 'Pedido cancelado por: Sistema às ' || to_char(v_now AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS') || ' - O tempo limite de pagamento expirou.';

  -- Loop through expired orders that are still pending (skip orders with deposit checkout, as those are handled via API setting)
  FOR v_order IN 
    SELECT id, notes
    FROM public.orders
    WHERE situation IN ('pending', 'in_process')
      AND cancelled_at IS NULL
      AND payment_expires_at IS NOT NULL
      AND payment_expires_at < v_now
      AND (checkout_fulfillment IS NULL OR checkout_fulfillment ->> 'depositCheckout' IS NULL)
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Update order status to cancelled
    UPDATE public.orders
    SET 
      situation = 'cancelled',
      cancelled_at = v_now,
      notes = CASE 
        WHEN v_order.notes IS NULL OR trim(v_order.notes) = '' THEN v_cancel_note
        ELSE v_order.notes || E'\n' || v_cancel_note
      END
    WHERE id = v_order.id;

    v_expired_count := v_expired_count + 1;
  END LOOP;

  RETURN v_expired_count;
END;
$$;

-- 3. Register pg_cron schedule if extension exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedules existing job if already present to avoid duplication
    PERFORM cron.unschedule(jobid) 
    FROM cron.job 
    WHERE jobname = 'dudit-expire-orders-every-minute';

    -- Schedule to run every minute
    PERFORM cron.schedule(
      'dudit-expire-orders-every-minute',
      '*/5 * * * *',
      'SELECT public.cron_expire_expired_orders();'
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- If pg_cron is not enabled or user lacks permissions, log warning silently
    RAISE NOTICE 'pg_cron setup skipped: %', SQLERRM;
END $$;
