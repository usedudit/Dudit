-- -----------------------------------------------------------------------------
-- MIGRATION: Drop legacy orders_history table (superseded by audit_logs)
-- -----------------------------------------------------------------------------
-- The table was empty (0 rows) and the ERP order timeline now reads from
-- audit_logs. This migration removes the remaining orders_history inserts from
-- the __mvp_unsafe_process_return_request implementation and drops the table
-- together with its RLS policies and indexes.

BEGIN;

-- 1. Recreate __mvp_unsafe_process_return_request without orders_history inserts
CREATE OR REPLACE FUNCTION public.__mvp_unsafe_process_return_request(p_request_id uuid, p_actor_user_id uuid, p_action text, p_next_status text DEFAULT NULL::text, p_refund_amount numeric DEFAULT 0, p_refund_status text DEFAULT 'PENDING'::text, p_refund_payment_method text DEFAULT NULL::text, p_return_to_inventory boolean DEFAULT false, p_store_credit_amount numeric DEFAULT 0, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_request RECORD;
  v_existing_event UUID;
  v_old_status TEXT;
  v_new_status TEXT;
  v_refund_id UUID;
  v_credit_id UUID;
  v_transaction_id UUID;
  v_stock_movement JSON;
  v_items JSONB;
  v_transition_allowed BOOLEAN := FALSE;
  v_max_action_amount NUMERIC(14,2) := 0;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_event
    FROM public.return_events
    WHERE return_request_id = p_request_id
      AND idempotency_key = p_idempotency_key;

    IF v_existing_event IS NOT NULL THEN
      RETURN jsonb_build_object('id', p_request_id, 'idempotent', true);
    END IF;
  END IF;

  SELECT *
  INTO v_request
  FROM public.return_requests
  WHERE id = p_request_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return request not found';
  END IF;

  IF v_request.status IN ('RESOLVED', 'REJECTED', 'EXPIRED') THEN
    RAISE EXCEPTION 'Return request is locked';
  END IF;

  IF v_request.request_type = 'cancellation' THEN
    SELECT COALESCE(NULLIF(amount_paid, 0), NULLIF(paid_amount, 0), total_amount, 0)
    INTO v_max_action_amount
    FROM public.orders
    WHERE id = v_request.order_id;
  ELSE
    SELECT COALESCE(SUM(net_item_value_snapshot), 0)
    INTO v_max_action_amount
    FROM public.return_items
    WHERE return_request_id = p_request_id;
  END IF;

  IF COALESCE(p_refund_amount, 0) > v_max_action_amount + 0.009 THEN
    RAISE EXCEPTION 'Refund amount exceeds proportional paid amount';
  END IF;

  IF COALESCE(p_store_credit_amount, 0) > v_max_action_amount + 0.009 THEN
    RAISE EXCEPTION 'Store credit amount exceeds proportional paid amount';
  END IF;

  v_old_status := v_request.status;
  v_new_status := COALESCE(p_next_status, v_old_status);

  IF v_new_status = v_old_status THEN
    v_transition_allowed := TRUE;
  ELSIF v_old_status = 'PENDING_REVIEW' AND v_new_status IN ('UNDER_ANALYSIS', 'APPROVED', 'REJECTED', 'ESCALATED') THEN
    v_transition_allowed := TRUE;
  ELSIF v_old_status = 'UNDER_ANALYSIS' AND v_new_status IN ('APPROVED', 'REJECTED', 'WAITING_CUSTOMER', 'WAITING_ITEM_RETURN', 'ESCALATED') THEN
    v_transition_allowed := TRUE;
  ELSIF v_old_status = 'APPROVED' AND v_new_status IN ('WAITING_ITEM_RETURN', 'PROCESSING', 'RESOLVED', 'ESCALATED') THEN
    v_transition_allowed := TRUE;
  ELSIF v_old_status = 'WAITING_CUSTOMER' AND v_new_status IN ('UNDER_ANALYSIS', 'EXPIRED', 'ESCALATED') THEN
    v_transition_allowed := TRUE;
  ELSIF v_old_status = 'WAITING_ITEM_RETURN' AND v_new_status IN ('PROCESSING', 'EXPIRED', 'ESCALATED') THEN
    v_transition_allowed := TRUE;
  ELSIF v_old_status = 'PROCESSING' AND v_new_status IN ('RESOLVED', 'ESCALATED') THEN
    v_transition_allowed := TRUE;
  ELSIF v_old_status = 'ESCALATED' AND v_new_status IN ('UNDER_ANALYSIS', 'APPROVED', 'REJECTED', 'PROCESSING', 'RESOLVED') THEN
    v_transition_allowed := TRUE;
  END IF;

  IF NOT v_transition_allowed THEN
    RAISE EXCEPTION 'Invalid return status transition';
  END IF;

  IF p_return_to_inventory THEN
    SELECT COALESCE(
      jsonb_agg(jsonb_build_object(
        'product_id', ri.product_id,
        'variant_id', ri.variant_id,
        'quantity', ri.quantity
      )),
      '[]'::JSONB
    )
    INTO v_items
    FROM public.return_items ri
    WHERE ri.return_request_id = p_request_id
      AND ri.product_id IS NOT NULL;

    IF jsonb_array_length(v_items) > 0 THEN
      v_stock_movement := public.create_batch_stock_movement(
        v_request.partner_id,
        'in',
        'RETURN',
        'Return request ' || p_request_id::TEXT,
        p_actor_user_id,
        v_items
      );
    END IF;
  END IF;

  IF COALESCE(p_refund_amount, 0) > 0 THEN
    INSERT INTO public.transactions (
      partner_id,
      description,
      category,
      amount,
      due_date,
      status,
      notes,
      payment_type,
      transaction_type,
      customer_id,
      contact_type,
      refund_kind,
      reference_note,
      origin,
      account_id,
      created_by_user_id
    ) VALUES (
      v_request.partner_id,
      'Refund ' || COALESCE(v_request.order_number_snapshot, v_request.order_id::TEXT),
      'Refunds',
      ABS(p_refund_amount),
      CURRENT_DATE,
      CASE WHEN p_refund_status = 'APPROVED' THEN 'paid' ELSE 'pending' END,
      NULLIF(LEFT(COALESCE(p_notes, ''), 2000), ''),
      NULLIF(p_refund_payment_method, ''),
      'refund',
      v_request.customer_id,
      'customer',
      'revenue_refund',
      'return:' || p_request_id::TEXT,
      CASE WHEN p_refund_status = 'MANUAL' THEN 'manual' ELSE 'system' END,
      NULL,
      p_actor_user_id
    )
    RETURNING id INTO v_transaction_id;

    INSERT INTO public.return_refunds (
      return_request_id,
      partner_id,
      order_id,
      customer_id,
      amount,
      refund_type,
      status,
      payment_method,
      financial_transaction_id,
      idempotency_key,
      created_by
    ) VALUES (
      p_request_id,
      v_request.partner_id,
      v_request.order_id,
      v_request.customer_id,
      ABS(p_refund_amount),
      CASE WHEN ABS(p_refund_amount) >= COALESCE(v_request.order_total_snapshot, 0) THEN 'full' ELSE 'partial' END,
      COALESCE(p_refund_status, 'PENDING'),
      NULLIF(p_refund_payment_method, ''),
      v_transaction_id,
      CASE WHEN p_idempotency_key IS NULL THEN NULL ELSE p_idempotency_key || ':refund' END,
      p_actor_user_id
    )
    RETURNING id INTO v_refund_id;
  END IF;

  IF COALESCE(p_store_credit_amount, 0) > 0 THEN
    INSERT INTO public.store_credits (
      partner_id,
      customer_id,
      customer_user_id,
      return_request_id,
      amount,
      remaining_amount,
      created_by
    ) VALUES (
      v_request.partner_id,
      v_request.customer_id,
      v_request.customer_user_id,
      p_request_id,
      ABS(p_store_credit_amount),
      ABS(p_store_credit_amount),
      p_actor_user_id
    )
    RETURNING id INTO v_credit_id;

    UPDATE public.customers
    SET store_credit = COALESCE(store_credit, 0) + ABS(p_store_credit_amount),
        updated_at = NOW()
    WHERE id = v_request.customer_id
      AND partner_id = v_request.partner_id;
  END IF;

  UPDATE public.return_requests
  SET status = v_new_status,
      approved_resolution = CASE
        WHEN v_new_status IN ('APPROVED', 'PROCESSING', 'RESOLVED') THEN COALESCE(approved_resolution, desired_resolution)
        ELSE approved_resolution
      END,
      resolution_type = CASE
        WHEN v_new_status IN ('APPROVED', 'PROCESSING', 'RESOLVED') THEN COALESCE(approved_resolution, desired_resolution)
        ELSE resolution_type
      END,
      refund_amount = CASE WHEN COALESCE(p_refund_amount, 0) > 0 THEN ABS(p_refund_amount) ELSE refund_amount END,
      store_credit_amount = CASE WHEN COALESCE(p_store_credit_amount, 0) > 0 THEN ABS(p_store_credit_amount) ELSE store_credit_amount END,
      seller_notes = COALESCE(NULLIF(LEFT(COALESCE(p_notes, ''), 2000), ''), seller_notes),
      locked_at = CASE WHEN v_new_status IN ('RESOLVED', 'REJECTED', 'EXPIRED') THEN NOW() ELSE locked_at END,
      resolved_at = CASE WHEN v_new_status = 'RESOLVED' THEN NOW() ELSE resolved_at END,
      rejected_at = CASE WHEN v_new_status = 'REJECTED' THEN NOW() ELSE rejected_at END,
      escalated_at = CASE WHEN v_new_status = 'ESCALATED' THEN NOW() ELSE escalated_at END,
      updated_by = p_actor_user_id,
      updated_at = NOW()
  WHERE id = p_request_id;

  INSERT INTO public.return_events (
    return_request_id,
    partner_id,
    actor_user_id,
    event_type,
    from_status,
    to_status,
    message,
    metadata,
    source,
    idempotency_key
  ) VALUES (
    p_request_id,
    v_request.partner_id,
    p_actor_user_id,
    COALESCE(NULLIF(p_action, ''), 'status_updated'),
    v_old_status,
    v_new_status,
    NULLIF(LEFT(COALESCE(p_notes, ''), 1000), ''),
    jsonb_build_object(
      'refund_id', v_refund_id,
      'store_credit_id', v_credit_id,
      'transaction_id', v_transaction_id,
      'stock_movement', v_stock_movement,
      'return_to_inventory', p_return_to_inventory
    ),
    CASE WHEN p_action = 'moderation_decision' THEN 'moderation' ELSE 'user' END,
    p_idempotency_key
  );

  INSERT INTO public.return_notifications (
    return_request_id,
    partner_id,
    recipient_user_id,
    recipient_customer_id,
    recipient_role,
    notification_type,
    title,
    message
  ) VALUES (
    p_request_id,
    v_request.partner_id,
    v_request.customer_user_id,
    v_request.customer_id,
    'customer',
    'return_status',
    'Return request updated',
    'Your return request is now ' || v_new_status || '.'
  );

  RETURN jsonb_build_object(
    'id', p_request_id,
    'status', v_new_status,
    'refund_id', v_refund_id,
    'store_credit_id', v_credit_id,
    'transaction_id', v_transaction_id,
    'stock_movement', v_stock_movement,
'idempotent', false
  );
END;
$function$
;

-- 2. Drop the legacy table (indexes, RLS policies and FK constraints go with it)
DROP TABLE IF EXISTS public.orders_history CASCADE;

COMMIT;

