-- Migration: Store Credit Consumption and Cache Recalculation
-- Handles automatic FIFO consumption of customer store credits when they place or pay an order.
-- Safely supports order creation, update, cancellation, and deletion with full idempotency.

CREATE OR REPLACE FUNCTION public.process_order_store_credit_usage()
RETURNS TRIGGER AS $$
DECLARE
  v_usage RECORD;
  v_credit RECORD;
  v_usage_item JSONB;
  v_new_usages JSONB;
  v_restore_amount NUMERIC(14, 2);
  v_target_amount NUMERIC(14, 2) := 0;
  v_amount_to_allocate NUMERIC(14, 2);
  v_allocated NUMERIC(14, 2);
  v_payment JSONB;
  v_customer_id UUID;
  v_order_id UUID;
  v_partner_id UUID;
BEGIN
  -- Determine context variables
  IF TG_OP = 'DELETE' THEN
    v_order_id := OLD.id;
    v_customer_id := OLD.customer_id;
    v_partner_id := OLD.partner_id;
  ELSE
    v_order_id := NEW.id;
    v_customer_id := NEW.customer_id;
    v_partner_id := NEW.partner_id;
  END IF;

  -- 1. Restore previous usages by this order to guarantee idempotency on updates/edits
  FOR v_credit IN
    SELECT id, remaining_amount, metadata
    FROM public.store_credits
    WHERE metadata ? 'usages'
      AND metadata->'usages' @> jsonb_build_array(jsonb_build_object('order_id', v_order_id))
  LOOP
    v_restore_amount := 0;
    v_new_usages := '[]'::JSONB;
    
    FOR v_usage_item IN SELECT * FROM jsonb_array_elements(v_credit.metadata->'usages')
    LOOP
      IF (v_usage_item->>'order_id')::UUID = v_order_id THEN
        v_restore_amount := v_restore_amount + (v_usage_item->>'amount')::NUMERIC;
      ELSE
        v_new_usages := jsonb_insert(v_new_usages, '{0}', v_usage_item);
      END IF;
    END LOOP;
    
    UPDATE public.store_credits
    SET remaining_amount = remaining_amount + v_restore_amount,
        status = CASE WHEN remaining_amount + v_restore_amount > 0 THEN 'ACTIVE' ELSE status END,
        metadata = jsonb_set(metadata, '{usages}', v_new_usages),
        updated_at = NOW()
    WHERE id = v_credit.id;
  END LOOP;

  -- 2. If deleting or cancelled, we do not allocate any new credits.
  IF TG_OP = 'DELETE' OR NEW.situation = 'cancelled' THEN
    -- Update customer cache and return
    IF v_customer_id IS NOT NULL THEN
      UPDATE public.customers
      SET store_credit = (
        SELECT COALESCE(SUM(remaining_amount), 0)
        FROM public.store_credits
        WHERE customer_id = v_customer_id
          AND status = 'ACTIVE'
      ),
      updated_at = NOW()
      WHERE id = v_customer_id;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- 3. Calculate how much store credit is used in the new order state.
  -- Check payment_breakdown first
  IF NEW.payment_breakdown IS NOT NULL AND jsonb_typeof(NEW.payment_breakdown) = 'array' THEN
    FOR v_payment IN SELECT * FROM jsonb_array_elements(NEW.payment_breakdown)
    LOOP
      IF v_payment->>'method' = 'store_credit' THEN
        v_target_amount := v_target_amount + COALESCE((v_payment->>'amount')::NUMERIC, 0);
      END IF;
    END LOOP;
  END IF;

  -- Fallback to payment_method if breakdown is empty and method is store_credit
  IF v_target_amount = 0 AND NEW.payment_method = 'store_credit' THEN
    v_target_amount := COALESCE(NEW.paid_amount, NEW.total_amount, 0);
  END IF;

  -- 4. Consume store credits from customer's active balances (FIFO)
  IF v_target_amount > 0 AND v_customer_id IS NOT NULL THEN
    v_amount_to_allocate := v_target_amount;
    
    FOR v_credit IN
      SELECT id, remaining_amount, metadata
      FROM public.store_credits
      WHERE customer_id = v_customer_id
        AND partner_id = v_partner_id
        AND status = 'ACTIVE'
        AND remaining_amount > 0
      ORDER BY created_at ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_amount_to_allocate <= 0;
      
      v_allocated := LEAST(v_credit.remaining_amount, v_amount_to_allocate);
      v_amount_to_allocate := v_amount_to_allocate - v_allocated;
      
      v_new_usages := COALESCE(v_credit.metadata->'usages', '[]'::JSONB);
      v_new_usages := jsonb_insert(v_new_usages, '{0}', jsonb_build_object('order_id', v_order_id, 'amount', v_allocated, 'used_at', NOW()));
      
      UPDATE public.store_credits
      SET remaining_amount = remaining_amount - v_allocated,
          status = CASE WHEN remaining_amount - v_allocated <= 0 THEN 'USED' ELSE 'ACTIVE' END,
          metadata = jsonb_set(metadata, '{usages}', v_new_usages),
          updated_at = NOW()
      WHERE id = v_credit.id;
    END LOOP;
  END IF;

  -- 5. Always update the customer's cached store credit balance
  IF v_customer_id IS NOT NULL THEN
    UPDATE public.customers
    SET store_credit = (
      SELECT COALESCE(SUM(remaining_amount), 0)
      FROM public.store_credits
      WHERE customer_id = v_customer_id
        AND status = 'ACTIVE'
    ),
    updated_at = NOW()
    WHERE id = v_customer_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-create the trigger on the public.orders table
DROP TRIGGER IF EXISTS trg_process_order_store_credit_usage ON public.orders;
CREATE TRIGGER trg_process_order_store_credit_usage
  AFTER INSERT OR UPDATE OF situation, payment_breakdown, payment_method, customer_id OR DELETE
  ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.process_order_store_credit_usage();
