-- ============================================================================
-- Fix: transaction category 'Refunds' → 'Reembolso'
--
-- When return requests with refund are processed, the SQL functions created
-- financial transactions with category 'Refunds' (English) instead of
-- 'Reembolso' (Portuguese). This migration:
--   1. Re-creates process_return_request with corrected category 'Reembolso'
--   2. Updates existing transactions with category 'Refunds' to 'Reembolso'
--   3. Also fixes any description starting with 'Refund ' to 'Reembolso '
-- ============================================================================

BEGIN;

-- ─── 1. Re-create process_return_request with corrected category ──────────────
-- The function was last defined in 20260906_fix_returns_exchanges_and_cdc_eligibility.sql
-- but may have been deployed with the English category 'Refunds'. We re-apply it
-- with the correct Portuguese category 'Reembolso'.

CREATE OR REPLACE FUNCTION public.process_return_request(
  p_request_id UUID,
  p_actor_user_id UUID,
  p_action TEXT,
  p_next_status TEXT DEFAULT NULL,
  p_refund_amount NUMERIC DEFAULT 0,
  p_refund_status TEXT DEFAULT 'PENDING',
  p_refund_payment_method TEXT DEFAULT NULL,
  p_return_to_inventory BOOLEAN DEFAULT FALSE,
  p_store_credit_amount NUMERIC DEFAULT 0,
  p_exchange_items JSONB DEFAULT '[]'::JSONB,
  p_exchange_balance_resolution TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_account_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_request RECORD;
  v_existing_event UUID;
  v_old_status TEXT;
  v_new_status TEXT;
  v_refund_id UUID;
  v_credit_id UUID;
  v_transaction_id UUID;
  v_credit_transaction_id UUID;
  v_stock_movement JSON;
  v_stock_movement_id UUID;
  v_items JSONB;
  v_exchange_item JSONB;
  v_exchange_items JSONB := COALESCE(p_exchange_items, '[]'::JSONB);
  v_exchange_order_id UUID;
  v_exchange_order_number TEXT;
  v_exchange_total NUMERIC(14,2) := 0;
  v_exchange_difference NUMERIC(14,2) := 0;
  v_exchange_surplus NUMERIC(14,2) := 0;
  v_transition_allowed BOOLEAN := FALSE;
  v_max_action_amount NUMERIC(14,2) := 0;
  v_store_id UUID;
  v_effective_refund_amount NUMERIC(14,2);
  v_effective_credit_amount NUMERIC(14,2);
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_event
    FROM public.audit_logs
    WHERE entity_type = 'return_request'
      AND entity_id = p_request_id
      AND metadata->>'idempotency_key' = p_idempotency_key
    LIMIT 1;

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
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;

  IF v_request.status IN ('RESOLVED', 'REJECTED', 'EXPIRED') THEN
    RAISE EXCEPTION 'Solicitação bloqueada';
  END IF;

  v_store_id := COALESCE(v_request.store_id, (SELECT store_id FROM public.orders WHERE id = v_request.order_id));

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

  v_effective_refund_amount := COALESCE(p_refund_amount, 0);
  v_effective_credit_amount := COALESCE(p_store_credit_amount, 0);

  IF v_effective_refund_amount > v_max_action_amount + 0.009 THEN
    RAISE EXCEPTION 'Valor de reembolso excede o valor pago proporcional dos itens';
  END IF;

  IF v_effective_credit_amount > v_max_action_amount + 0.009 THEN
    RAISE EXCEPTION 'Valor de crédito excede o valor pago proporcional dos itens';
  END IF;

  IF v_effective_refund_amount + v_effective_credit_amount > v_max_action_amount + 0.009 THEN
    RAISE EXCEPTION 'A soma de reembolso e crédito excede o valor pago proporcional dos itens';
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
    RAISE EXCEPTION 'Transição de status inválida';
  END IF;

  IF p_return_to_inventory THEN
    SELECT id INTO v_stock_movement_id
    FROM public.stock_movements
    WHERE source_return_request_id = p_request_id
    LIMIT 1;

    IF v_stock_movement_id IS NULL AND v_request.inventory_movement_id IS NOT NULL THEN
      v_stock_movement_id := v_request.inventory_movement_id;
    END IF;

    IF v_stock_movement_id IS NOT NULL THEN
      v_stock_movement := jsonb_build_object('id', v_stock_movement_id, 'idempotent', true)::JSON;
    ELSE
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
          'RETURN_IN',
          NULL,
          p_actor_user_id,
          v_items,
          v_store_id
        );

        v_stock_movement_id := NULLIF(v_stock_movement->>'id', '')::UUID;
        UPDATE public.stock_movements
        SET source_return_request_id = p_request_id,
            store_id = v_store_id,
            reason = 'RETURN_IN',
            reference_name = 'Devolução DVL-' || UPPER(SUBSTRING(p_request_id::TEXT FROM 1 FOR 6))
        WHERE id = v_stock_movement_id;
      END IF;
    END IF;
  END IF;

  -- Processamento da Troca de Itens
  IF jsonb_array_length(v_exchange_items) > 0 THEN
    v_exchange_total := 0;
    FOR v_exchange_item IN SELECT * FROM jsonb_array_elements(v_exchange_items)
    LOOP
      v_exchange_total := v_exchange_total
        + ROUND((COALESCE((v_exchange_item->>'unit_price')::NUMERIC, (v_exchange_item->>'price')::NUMERIC, 0)
          * COALESCE((v_exchange_item->>'quantity')::INTEGER, 1))::NUMERIC, 2);
    END LOOP;

    SELECT id, order_number INTO v_exchange_order_id, v_exchange_order_number
    FROM public.orders
    WHERE exchange_parent_order_id = v_request.order_id
      AND exchange_return_request_id = p_request_id
    LIMIT 1;

    IF v_exchange_order_id IS NULL AND v_request.exchange_order_id IS NOT NULL THEN
      v_exchange_order_id := v_request.exchange_order_id;
    END IF;

    IF v_exchange_order_id IS NULL THEN
      v_exchange_order_id := public.create_exchange_order(
        p_request_id,
        v_request.partner_id,
        v_request.order_id,
        v_request.customer_id,
        v_exchange_items,
        p_actor_user_id,
        v_store_id
      );
    END IF;

    IF v_exchange_order_id IS NOT NULL THEN
      SELECT order_number INTO v_exchange_order_number FROM public.orders WHERE id = v_exchange_order_id;
      v_exchange_difference := GREATEST(0, v_exchange_total - v_max_action_amount);
      v_exchange_surplus := GREATEST(0, v_max_action_amount - v_exchange_total);

      -- Resolução de sobra (surplus): vale-compra ou estorno
      IF v_exchange_surplus > 0 AND p_exchange_balance_resolution = 'store_credit' THEN
        v_effective_credit_amount := v_effective_credit_amount + v_exchange_surplus;
      ELSIF v_exchange_surplus > 0 AND p_exchange_balance_resolution = 'refund' THEN
        v_effective_refund_amount := v_effective_refund_amount + v_exchange_surplus;
      END IF;
    END IF;
  END IF;

  -- Reembolso financeiro no ERP (transação financeira)
  IF v_effective_refund_amount > 0 THEN
    INSERT INTO public.transactions (
      partner_id, description, category, amount, due_date, status, notes,
      payment_type, transaction_type, customer_id, contact_type, refund_kind,
      reference_note, origin, created_by_user_id, store_id, account_id
    ) VALUES (
      v_request.partner_id,
      'Reembolso ' || COALESCE(v_request.order_number_snapshot, v_request.order_id::TEXT),
      'Reembolso',
      ABS(v_effective_refund_amount),
      NULL,
      CASE WHEN p_refund_status = 'APPROVED' THEN 'paid' ELSE 'pending' END,
      NULLIF(LEFT(COALESCE(p_notes, ''), 2000), ''),
      NULLIF(p_refund_payment_method, ''),
      'refund',
      v_request.customer_id,
      'customer',
      'revenue_refund',
      'return:' || p_request_id::TEXT,
      'system',
      p_actor_user_id,
      v_store_id,
      p_account_id
    )
    RETURNING id INTO v_transaction_id;

    INSERT INTO public.return_refunds (
      return_request_id, partner_id, order_id, customer_id, amount, refund_type,
      status, payment_method, financial_transaction_id, idempotency_key, created_by
    ) VALUES (
      p_request_id, v_request.partner_id, v_request.order_id, v_request.customer_id,
      ABS(v_effective_refund_amount),
      CASE WHEN ABS(v_effective_refund_amount) >= COALESCE(v_request.order_total_snapshot, 0) THEN 'full' ELSE 'partial' END,
      COALESCE(p_refund_status, 'PENDING'),
      NULLIF(p_refund_payment_method, ''),
      v_transaction_id,
      CASE WHEN p_idempotency_key IS NULL THEN NULL ELSE p_idempotency_key || ':refund' END,
      p_actor_user_id
    )
    RETURNING id INTO v_refund_id;
  END IF;

  -- Vale-compra no ERP (store_credits)
  IF v_effective_credit_amount > 0 THEN
    INSERT INTO public.store_credits (
      partner_id, customer_id, customer_user_id, return_request_id,
      amount, remaining_amount, created_by
    ) VALUES (
      v_request.partner_id, v_request.customer_id, v_request.customer_user_id, p_request_id,
      ABS(v_effective_credit_amount), ABS(v_effective_credit_amount), p_actor_user_id
    )
    RETURNING id INTO v_credit_id;

    UPDATE public.customers
    SET store_credit = COALESCE(store_credit, 0) + ABS(v_effective_credit_amount),
        updated_at = NOW()
    WHERE id = v_request.customer_id
      AND partner_id = v_request.partner_id;

    IF v_request.customer_id IS NOT NULL THEN
      INSERT INTO public.transactions (
        partner_id, description, category, amount, due_date, payment_date, status,
        notes, payment_type, transaction_type, customer_id, contact_type,
        reference_note, origin, created_by_user_id, store_id
      ) VALUES (
        v_request.partner_id,
        'Crédito em Loja ' || COALESCE(v_request.order_number_snapshot, v_request.order_id::TEXT),
        'Trocas e Devoluções',
        ABS(v_effective_credit_amount),
        NULL, NOW(), 'paid',
        'Crédito concedido na devolução',
        'store_credit', 'expense',
        v_request.customer_id, 'customer',
        'return:' || p_request_id::TEXT || ':credit',
        'system', p_actor_user_id, v_store_id
      )
      RETURNING id INTO v_credit_transaction_id;
    END IF;
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
      refund_amount = CASE WHEN v_effective_refund_amount > 0 THEN ABS(v_effective_refund_amount) ELSE refund_amount END,
      store_credit_amount = CASE WHEN v_effective_credit_amount > 0 THEN ABS(v_effective_credit_amount) ELSE store_credit_amount END,
      inventory_movement_id = COALESCE(inventory_movement_id, v_stock_movement_id),
      refund_transaction_id = COALESCE(refund_transaction_id, v_transaction_id),
      store_credit_transaction_id = COALESCE(store_credit_transaction_id, v_credit_transaction_id),
      exchange_order_id = COALESCE(exchange_order_id, v_exchange_order_id),
      exchange_shortfall_amount = CASE WHEN v_exchange_difference > 0 THEN v_exchange_difference ELSE exchange_shortfall_amount END,
      exchange_surplus_amount = CASE WHEN v_exchange_surplus > 0 THEN v_exchange_surplus ELSE exchange_surplus_amount END,
      exchange_items_snapshot = CASE WHEN jsonb_array_length(v_exchange_items) > 0 THEN v_exchange_items ELSE exchange_items_snapshot END,
      exchange_substatus = CASE WHEN jsonb_array_length(v_exchange_items) > 0 AND exchange_substatus IS NULL THEN 'aguardando_envio' ELSE exchange_substatus END,
      exchange_balance_resolution = COALESCE(NULLIF(p_exchange_balance_resolution, ''), exchange_balance_resolution),
      refund_payment_method = COALESCE(NULLIF(p_refund_payment_method, ''), refund_payment_method),
      seller_notes = COALESCE(NULLIF(LEFT(COALESCE(p_notes, ''), 2000), ''), seller_notes),
      locked_at = CASE WHEN v_new_status IN ('RESOLVED', 'REJECTED', 'EXPIRED') THEN NOW() ELSE locked_at END,
      resolved_at = CASE WHEN v_new_status = 'RESOLVED' THEN NOW() ELSE resolved_at END,
      updated_at = NOW()
  WHERE id = p_request_id;

  INSERT INTO public.audit_logs (
    table_name, action, partner_id, store_id, user_id, actor_user_id,
    entity_type, entity_id, action_type, change_lines, source, metadata
  ) VALUES (
    'return_requests',
    UPPER(COALESCE(p_action, 'UPDATED')),
    v_request.partner_id,
    v_store_id,
    p_actor_user_id,
    p_actor_user_id,
    'return_request',
    p_request_id,
    LOWER(COALESCE(p_action, 'updated')),
    ARRAY[COALESCE(NULLIF(LEFT(COALESCE(p_notes, ''), 2000), ''), 'Status da solicitação atualizado.')],
    'user',
    jsonb_build_object(
      'from_status', v_old_status,
      'to_status', v_new_status,
      'refund_amount', v_effective_refund_amount,
      'refund_status', p_refund_status,
      'refund_payment_method', p_refund_payment_method,
      'store_credit_amount', v_effective_credit_amount,
      'return_to_inventory', p_return_to_inventory,
      'stock_movement_id', v_stock_movement_id,
      'exchange_order_id', v_exchange_order_id,
      'exchange_balance_resolution', p_exchange_balance_resolution,
      'idempotency_key', p_idempotency_key
    )
  );

  RETURN jsonb_build_object(
    'id', p_request_id,
    'status', v_new_status,
    'stock_movement_id', v_stock_movement_id,
    'refund_id', v_refund_id,
    'store_credit_id', v_credit_id,
    'refund_transaction_id', v_transaction_id,
    'store_credit_transaction_id', v_credit_transaction_id,
    'exchange_order_id', v_exchange_order_id,
    'exchange_shortfall_amount', v_exchange_difference,
    'exchange_surplus_amount', v_exchange_surplus
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 2. Fix existing transactions category ──────────────────────────────────────

UPDATE public.transactions
SET category = 'Reembolso'
WHERE category = 'Refunds';

-- ─── 3. Fix existing transactions description that start with 'Refund ' ──────────

UPDATE public.transactions
SET description = 'Reembolso ' || SUBSTRING(description FROM 8)
WHERE description LIKE 'Refund %';

COMMIT;
