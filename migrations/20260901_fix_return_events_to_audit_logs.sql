-- -----------------------------------------------------------------------------
-- MIGRATION: Replace ALL remaining return_events references with audit_logs
-- The return_events table no longer exists. All stored procedures must use
-- audit_logs for return event logging.
-- -----------------------------------------------------------------------------

BEGIN;

-- 1. Re-create create_return_request (use audit_logs instead of return_events)
DROP FUNCTION IF EXISTS public.create_return_request(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, TIMESTAMPTZ, TEXT, UUID, TEXT, UUID, UUID);
DROP FUNCTION IF EXISTS public.create_return_request(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, TIMESTAMPTZ, TEXT, UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.create_return_request(
  p_partner_id UUID,
  p_order_id UUID,
  p_created_by UUID,
  p_source TEXT,
  p_resolution TEXT,
  p_reason TEXT,
  p_message TEXT,
  p_items JSONB,
  p_evidence JSONB DEFAULT '[]'::JSONB,
  p_idempotency_key TEXT DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_request_type TEXT DEFAULT NULL,
  p_origin_request_id UUID DEFAULT NULL,
  p_origin_type TEXT DEFAULT NULL,
  p_store_id UUID DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_existing_id UUID;
  v_request_id UUID;
  v_order RECORD;
  v_partner_name TEXT;
  v_item JSONB;
  v_evidence JSONB;
  v_order_item RECORD;
  v_qty INTEGER;
  v_already_requested INTEGER;
  v_already_resolved INTEGER;
  v_total_amount NUMERIC(14,2) := 0;
  v_evidence_count INTEGER;
  v_sku TEXT;
  v_request_type TEXT;
  v_order_subtotal NUMERIC(14,2);
  v_amount_paid NUMERIC(14,2);
  v_line_subtotal NUMERIC(14,2);
  v_line_net NUMERIC(14,2);
  v_return_net NUMERIC(14,2);
  v_parent_item_id UUID;
  v_origin_type TEXT;
  v_policy_snapshot JSONB;
  v_eligibility JSONB;
  v_sla_days INTEGER;
  v_sla_due TIMESTAMPTZ;
  v_store_id UUID;
  v_effective_customer_id UUID;
BEGIN
  v_store_id := COALESCE(p_store_id, (SELECT store_id FROM public.orders WHERE id = p_order_id));

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.return_requests
    WHERE partner_id = p_partner_id
      AND idempotency_key = p_idempotency_key
      AND deleted_at IS NULL;

    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object('id', v_existing_id, 'idempotent', true);
    END IF;
  END IF;

  IF p_resolution NOT IN ('exchange', 'refund', 'store_credit', 'none', 'rejected') THEN
    RAISE EXCEPTION 'Resolução inválida';
  END IF;

  v_request_type := COALESCE(NULLIF(p_request_type, ''), CASE WHEN p_resolution = 'exchange' THEN 'exchange' WHEN p_resolution = 'store_credit' THEN 'store_credit' WHEN p_resolution = 'refund' THEN 'refund' ELSE 'return' END);
  IF v_request_type NOT IN ('cancellation', 'return', 'exchange', 'refund', 'store_credit') THEN
    RAISE EXCEPTION 'Tipo de solicitação inválido';
  END IF;

  IF v_request_type <> 'cancellation' AND COALESCE(jsonb_array_length(p_items), 0) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um item';
  END IF;

  IF COALESCE(jsonb_array_length(p_evidence), 0) > 5 THEN
    RAISE EXCEPTION 'Limite de evidências excedido';
  END IF;

  SELECT o.*
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
    AND o.partner_id = p_partner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;

  IF v_request_type = 'cancellation' AND (
    LOWER(COALESCE(v_order.situation, '')) IN ('cancelled', 'shipped', 'delivered', 'completed')
    OR LOWER(COALESCE(v_order.delivery_status, '')) IN ('sent', 'shipped', 'out_for_delivery', 'delivered', 'picked_up', 'completed', 'delivery_failed', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'Pedido já está em entrega';
  END IF;

  v_policy_snapshot := COALESCE(v_order.return_policy_snapshot, public.build_return_policy_snapshot(p_partner_id));
  v_eligibility := public.calculate_return_eligibility(p_order_id, NOW());
  v_sla_days := COALESCE((v_policy_snapshot->>'sla_response_days')::INTEGER, 5);
  v_sla_due := NOW() + (v_sla_days || ' days')::INTERVAL;

  SELECT ROUND(COALESCE(SUM(COALESCE(oi.subtotal, oi.product_price * oi.quantity, 0)), 0)::NUMERIC, 2)
  INTO v_order_subtotal
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id;

  v_order_subtotal := COALESCE(NULLIF(v_order.subtotal_original, 0), v_order_subtotal, 0);
  v_amount_paid := COALESCE(NULLIF(v_order.amount_paid, 0), NULLIF(v_order.paid_amount, 0), COALESCE(v_order.total_amount, 0));

  UPDATE public.orders
  SET subtotal_original = v_order_subtotal,
      shipping_total = COALESCE(NULLIF(shipping_total, 0), COALESCE(delivery_fee, 0)),
      amount_paid = v_amount_paid,
      discount_total = GREATEST(0, v_order_subtotal + COALESCE(NULLIF(shipping_total, 0), COALESCE(delivery_fee, 0)) - v_amount_paid),
      return_policy_snapshot = COALESCE(return_policy_snapshot, v_policy_snapshot)
  WHERE id = p_order_id;

  SELECT s.name INTO v_partner_name
  FROM public.stores s
  WHERE s.partner_id = p_partner_id
  ORDER BY s.created_at ASC
  LIMIT 1;

  v_origin_type := NULLIF(p_origin_type, '');
  v_effective_customer_id := COALESCE(p_customer_id, v_order.buyer_id);

  INSERT INTO public.return_requests (
    partner_id, order_id, store_id, customer_id, customer_user_id, source, request_type,
    desired_resolution, approved_resolution, resolution_type, reason, customer_reason,
    customer_message, customer_details, status, order_number_snapshot, order_total_snapshot,
    customer_name_snapshot, seller_name_snapshot, idempotency_key, expires_at, created_by, updated_by,
    policy_snapshot, eligibility_status, eligibility_details, sla_due_at, sla_status
  ) VALUES (
    p_partner_id, p_order_id, v_store_id, v_effective_customer_id,
    CASE WHEN p_source = 'marketplace' THEN v_order.buyer_id ELSE NULL END,
    COALESCE(NULLIF(p_source, ''), 'erp'), v_request_type, p_resolution, NULL, p_resolution,
    LEFT(TRIM(p_reason), 120), LEFT(TRIM(p_reason), 120),
    NULLIF(LEFT(TRIM(COALESCE(p_message, '')), 2000), ''),
    NULLIF(LEFT(TRIM(COALESCE(p_message, '')), 2000), ''),
    'PENDING_REVIEW', v_order.order_number, v_amount_paid, v_order.customer_name, v_partner_name,
    p_idempotency_key, p_expires_at, p_created_by, p_created_by,
    v_policy_snapshot,
    v_eligibility->>'status',
    COALESCE(v_eligibility->'details', '{}'::JSONB),
    v_sla_due,
    'aguardando_vendedor'
  )
  RETURNING id INTO v_request_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::JSONB))
  LOOP
    v_qty := COALESCE((v_item->>'quantity')::INTEGER, 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;

    SELECT oi.* INTO v_order_item
    FROM public.order_items oi
    WHERE oi.id = (v_item->>'order_item_id')::UUID AND oi.order_id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Item do pedido não encontrado'; END IF;

    SELECT COALESCE(SUM(ri.quantity), 0) INTO v_already_requested
    FROM public.return_items ri
    JOIN public.return_requests rr ON rr.id = ri.return_request_id
    WHERE ri.order_item_id = v_order_item.id AND rr.deleted_at IS NULL
      AND rr.status NOT IN ('REJECTED', 'EXPIRED');

    SELECT COALESCE(SUM(ri.quantity), 0) INTO v_already_resolved
    FROM public.return_items ri
    JOIN public.return_requests rr ON rr.id = ri.return_request_id
    WHERE ri.order_item_id = v_order_item.id AND rr.deleted_at IS NULL
      AND rr.status IN ('RESOLVED', 'APPROVED', 'PROCESSING', 'WAITING_ITEM_RETURN')
      AND COALESCE(rr.approved_resolution, rr.desired_resolution) IN ('exchange', 'refund', 'store_credit');

    IF (v_already_requested + v_qty) > v_order_item.quantity THEN
      RAISE EXCEPTION 'Quantidade solicitada excede a quantidade disponível no pedido para o item %', COALESCE(v_order_item.product_name, 'Produto');
    END IF;

    v_line_subtotal := COALESCE(NULLIF(v_order_item.subtotal, 0), v_order_item.product_price * v_order_item.quantity, 0);
    IF v_order_subtotal > 0 AND v_amount_paid > 0 THEN
      v_line_net := ROUND(((v_line_subtotal / v_order_subtotal) * v_amount_paid)::NUMERIC, 2);
    ELSE
      v_line_net := v_line_subtotal;
    END IF;

    v_return_net := ROUND(((v_line_net / GREATEST(1, v_order_item.quantity)) * v_qty)::NUMERIC, 2);

    v_sku := NULLIF(TRIM(COALESCE(
      v_item->>'sku',
      (SELECT sku FROM public.product_variants WHERE id = v_order_item.variant_id),
      (SELECT sku FROM public.products WHERE id = v_order_item.product_id),
      ''
    )), '');

    INSERT INTO public.return_items (
      return_request_id, order_item_id, product_id, variant_id,
      product_name_snapshot, sku_snapshot, unit_price_snapshot, net_item_value_snapshot,
      ordered_quantity, quantity, condition, reason, desired_resolution
    ) VALUES (
      v_request_id, v_order_item.id, v_order_item.product_id, v_order_item.variant_id,
      COALESCE(v_order_item.product_name, 'Produto'), v_sku, v_order_item.product_price,
      v_return_net, v_order_item.quantity, v_qty,
      COALESCE(NULLIF(v_item->>'condition', ''), 'opened'),
      LEFT(TRIM(COALESCE(v_item->>'reason', p_reason)), 120),
      p_resolution
    );

    v_total_amount := v_total_amount + v_return_net;
  END LOOP;

  UPDATE public.return_requests
  SET refund_amount = CASE WHEN p_resolution = 'refund' THEN v_total_amount ELSE 0 END,
      store_credit_amount = CASE WHEN p_resolution = 'store_credit' THEN v_total_amount ELSE 0 END
  WHERE id = v_request_id;

  v_evidence_count := 0;
  FOR v_evidence IN SELECT * FROM jsonb_array_elements(COALESCE(p_evidence, '[]'::JSONB))
  LOOP
    v_evidence_count := v_evidence_count + 1;
    INSERT INTO public.return_evidence (
      return_request_id, partner_id, file_url, file_key, file_name, file_type, file_size, thumbnail_url, metadata
    ) VALUES (
      v_request_id, p_partner_id,
      v_evidence->>'file_url',
      v_evidence->>'file_key',
      v_evidence->>'file_name',
      v_evidence->>'file_type',
      COALESCE((v_evidence->>'file_size')::BIGINT, 0),
      v_evidence->>'thumbnail_url',
      COALESCE(v_evidence->'metadata', '{}'::JSONB)
    );
  END LOOP;

  INSERT INTO public.audit_logs (
    table_name, action, partner_id, store_id, user_id, actor_user_id,
    entity_type, entity_id, action_type, change_lines, source, metadata
  ) VALUES (
    'return_requests',
    'CREATED',
    p_partner_id,
    v_store_id,
    p_created_by,
    p_created_by,
    'return_request',
    v_request_id,
    'created',
    ARRAY['Solicitação de devolução/troca criada.'],
    CASE WHEN LOWER(COALESCE(p_source, '')) IN ('user', 'system', 'gateway', 'moderation', 'erp', 'marketplace') THEN LOWER(p_source) ELSE 'user' END,
    jsonb_build_object(
      'from_status', NULL,
      'to_status', 'PENDING_REVIEW',
      'resolution', p_resolution,
      'items_count', jsonb_array_length(COALESCE(p_items, '[]'::JSONB)),
      'idempotency_key', p_idempotency_key
    )
  );

  RETURN jsonb_build_object('id', v_request_id, 'idempotent', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Re-create process_return_request (use audit_logs instead of return_events)
DROP FUNCTION IF EXISTS public.process_return_request(UUID, UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, BOOLEAN, NUMERIC, JSONB, TEXT, TEXT, TEXT);

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
  p_idempotency_key TEXT DEFAULT NULL
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

  IF jsonb_array_length(v_exchange_items) > 0 THEN
    v_exchange_total := 0;
    FOR v_exchange_item IN SELECT * FROM jsonb_array_elements(v_exchange_items)
    LOOP
      v_exchange_total := v_exchange_total + COALESCE((v_exchange_item->>'total')::NUMERIC, 0);
    END LOOP;

    SELECT id, order_number INTO v_exchange_order_id, v_exchange_order_number
    FROM public.orders
    WHERE exchange_source_return_request_id = p_request_id
    LIMIT 1;

    IF v_exchange_order_id IS NULL THEN
      SELECT public.create_exchange_order(
        p_request_id,
        v_request.partner_id,
        v_request.order_id,
        v_request.customer_id,
        v_exchange_items,
        p_actor_user_id,
        v_store_id
      ) INTO v_exchange_order_id;
    END IF;

    IF v_exchange_order_id IS NOT NULL THEN
      SELECT order_number INTO v_exchange_order_number FROM public.orders WHERE id = v_exchange_order_id;
      v_exchange_difference := GREATEST(0, v_exchange_total - v_max_action_amount);
      v_exchange_surplus := GREATEST(0, v_max_action_amount - v_exchange_total);
    END IF;
  END IF;

  IF COALESCE(p_refund_amount, 0) > 0 THEN
    INSERT INTO public.transactions (
      partner_id, description, category, amount, due_date, status, notes,
      payment_type, transaction_type, customer_id, contact_type, refund_kind,
      reference_note, origin, created_by_user_id, store_id
    ) VALUES (
      v_request.partner_id,
      'Reembolso ' || COALESCE(v_request.order_number_snapshot, v_request.order_id::TEXT),
      'Refunds',
      ABS(p_refund_amount),
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
      v_store_id
    )
    RETURNING id INTO v_transaction_id;

    INSERT INTO public.return_refunds (
      return_request_id, partner_id, order_id, customer_id, amount, refund_type,
      status, payment_method, financial_transaction_id, idempotency_key, created_by
    ) VALUES (
      p_request_id, v_request.partner_id, v_request.order_id, v_request.customer_id,
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
      partner_id, customer_id, customer_user_id, return_request_id,
      amount, remaining_amount, created_by
    ) VALUES (
      v_request.partner_id, v_request.customer_id, v_request.customer_user_id, p_request_id,
      ABS(p_store_credit_amount), ABS(p_store_credit_amount), p_actor_user_id
    )
    RETURNING id INTO v_credit_id;

    UPDATE public.customers
    SET store_credit = COALESCE(store_credit, 0) + ABS(p_store_credit_amount),
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


-- 3. Re-create __mvp_unsafe_process_return_request (use audit_logs instead of return_events)
CREATE OR REPLACE FUNCTION public.__mvp_unsafe_process_return_request(
  p_request_id UUID,
  p_actor_user_id UUID,
  p_action TEXT,
  p_next_status TEXT DEFAULT NULL,
  p_refund_amount NUMERIC DEFAULT 0,
  p_refund_status TEXT DEFAULT 'PENDING',
  p_refund_payment_method TEXT DEFAULT NULL,
  p_return_to_inventory BOOLEAN DEFAULT FALSE,
  p_store_credit_amount NUMERIC DEFAULT 0,
  p_notes TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
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
        NULL,
        p_actor_user_id,
        v_items
      );
    END IF;
  END IF;

  IF COALESCE(p_refund_amount, 0) > 0 THEN
    INSERT INTO public.transactions (
      partner_id, description, category, amount, due_date, status, notes,
      payment_type, transaction_type, customer_id, contact_type, refund_kind,
      reference_note, origin, account_id, created_by_user_id
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
      return_request_id, partner_id, order_id, customer_id, amount, refund_type,
      status, payment_method, financial_transaction_id, idempotency_key, created_by
    ) VALUES (
      p_request_id, v_request.partner_id, v_request.order_id, v_request.customer_id,
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
      partner_id, customer_id, customer_user_id, return_request_id,
      amount, remaining_amount, created_by
    ) VALUES (
      v_request.partner_id, v_request.customer_id, v_request.customer_user_id, p_request_id,
      ABS(p_store_credit_amount), ABS(p_store_credit_amount), p_actor_user_id
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

  INSERT INTO public.audit_logs (
    table_name, action, partner_id, user_id, actor_user_id,
    entity_type, entity_id, action_type, change_lines, source, metadata
  ) VALUES (
    'return_requests',
    UPPER(COALESCE(p_action, 'UPDATED')),
    v_request.partner_id,
    p_actor_user_id,
    p_actor_user_id,
    'return_request',
    p_request_id,
    LOWER(COALESCE(p_action, 'updated')),
    ARRAY[COALESCE(NULLIF(LEFT(COALESCE(p_notes, ''), 1000), ''), 'Status atualizado.')],
    CASE WHEN p_action = 'moderation_decision' THEN 'moderation' ELSE 'user' END,
    jsonb_build_object(
      'from_status', v_old_status,
      'to_status', v_new_status,
      'refund_id', v_refund_id,
      'store_credit_id', v_credit_id,
      'transaction_id', v_transaction_id,
      'stock_movement', v_stock_movement,
      'return_to_inventory', p_return_to_inventory,
      'idempotency_key', p_idempotency_key
    )
  );

  INSERT INTO public.return_notifications (
    return_request_id, partner_id, recipient_user_id, recipient_customer_id,
    recipient_role, notification_type, title, message
  ) VALUES (
    p_request_id, v_request.partner_id, v_request.customer_user_id, v_request.customer_id,
    'customer', 'return_status',
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
$function$;


-- 4. Re-create expire_return_sla_requests (use audit_logs instead of return_events)
CREATE OR REPLACE FUNCTION public.expire_return_sla_requests()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_row IN
    SELECT id, partner_id
    FROM public.return_requests
    WHERE deleted_at IS NULL
      AND sla_status = 'aguardando_vendedor'
      AND sla_due_at IS NOT NULL
      AND sla_due_at < NOW()
      AND status IN ('PENDING_REVIEW', 'UNDER_ANALYSIS', 'WAITING_CUSTOMER')
  LOOP
    UPDATE public.return_requests
    SET sla_status = 'vencido',
        sla_expired_at = NOW(),
        updated_at = NOW()
    WHERE id = v_row.id
      AND sla_status = 'aguardando_vendedor';

    IF FOUND THEN
      INSERT INTO public.audit_logs (
        table_name, action, partner_id, entity_type, entity_id,
        action_type, change_lines, source, metadata
      ) VALUES (
        'return_requests', 'UPDATED', v_row.partner_id,
        'return_request', v_row.id,
        'sla_expired',
        ARRAY['Prazo interno de resposta do vendedor expirado.'],
        'system',
        jsonb_build_object('auto', true, 'from_status', NULL, 'to_status', NULL)
      );

      PERFORM public.apply_return_partner_risk(
        v_row.partner_id, 'return_sla_expired', v_row.id, 1,
        jsonb_build_object('return_request_id', v_row.id)
      );

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;


-- 5. Re-create report_return_to_dudit (use audit_logs instead of return_events)
CREATE OR REPLACE FUNCTION public.report_return_to_dudit(
  p_return_request_id UUID,
  p_reporter_user_id UUID,
  p_reason_code TEXT,
  p_description TEXT,
  p_legal_ack BOOLEAN,
  p_idempotency_key TEXT DEFAULT NULL,
  p_ip_hash TEXT DEFAULT NULL,
  p_ua_hash TEXT DEFAULT NULL,
  p_fingerprint TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_report_id UUID;
  v_existing UUID;
  v_can_report BOOLEAN := FALSE;
BEGIN
  IF NOT COALESCE(p_legal_ack, FALSE) THEN
    RAISE EXCEPTION 'legal_ack_required';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT dudit_report_id INTO v_existing
    FROM public.return_requests
    WHERE id = p_return_request_id
      AND dudit_report_id IS NOT NULL;

    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('report_id', v_existing, 'idempotent', true);
    END IF;
  END IF;

  SELECT * INTO v_request
  FROM public.return_requests
  WHERE id = p_return_request_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'return_request_not_found';
  END IF;

  IF v_request.customer_user_id IS DISTINCT FROM p_reporter_user_id
     AND v_request.customer_id IS DISTINCT FROM p_reporter_user_id THEN
    RAISE EXCEPTION 'forbidden_not_customer';
  END IF;

  v_can_report := (
    v_request.sla_status = 'vencido'
    OR v_request.status = 'REJECTED'
    OR COALESCE(p_reason_code, '') IN ('seller_abuse', 'return_abuse', 'return_sla_violation', 'return_denied_unfairly')
  );

  IF NOT v_can_report THEN
    RAISE EXCEPTION 'report_not_allowed';
  END IF;

  IF v_request.dudit_report_id IS NOT NULL THEN
    RETURN jsonb_build_object('report_id', v_request.dudit_report_id, 'already_reported', true);
  END IF;

  INSERT INTO public.reports (
    reporter_user_id, target_type, target_id, reason, reason_code, description,
    status, reporter_ip_hash, reporter_ua_hash, fingerprint,
    metadata
  ) VALUES (
    p_reporter_user_id,
    'return_request',
    p_return_request_id,
    COALESCE(NULLIF(TRIM(p_reason_code), ''), 'return_issue'),
    NULLIF(TRIM(p_reason_code), ''),
    NULLIF(LEFT(TRIM(COALESCE(p_description, '')), 2000), ''),
    'pending',
    p_ip_hash, p_ua_hash, p_fingerprint,
    jsonb_build_object(
      'order_id', v_request.order_id,
      'partner_id', v_request.partner_id,
      'return_status', v_request.status,
      'sla_status', v_request.sla_status,
      'eligibility_status', v_request.eligibility_status,
      'source', 'return_report'
    )
  )
  RETURNING id INTO v_report_id;

  UPDATE public.return_requests
  SET dudit_report_id = v_report_id,
      reported_to_dudit_at = NOW(),
      updated_at = NOW()
  WHERE id = p_return_request_id;

  INSERT INTO public.audit_logs (
    table_name, action, partner_id, user_id, actor_user_id,
    entity_type, entity_id, action_type, change_lines, source, metadata
  ) VALUES (
    'return_requests', 'REPORTED', v_request.partner_id,
    p_reporter_user_id, p_reporter_user_id,
    'return_request', p_return_request_id,
    'reported_to_dudit',
    ARRAY['Cliente reportou a solicitação à Dudit para análise de possível abuso da plataforma.'],
    'user',
    jsonb_build_object(
      'report_id', v_report_id,
      'reason_code', p_reason_code,
      'idempotency_key', p_idempotency_key
    )
  );

  RETURN jsonb_build_object('report_id', v_report_id, 'created', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.report_return_to_dudit(UUID, UUID, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- 6. Replace purge_return_events with purge_return_audit_logs
DROP FUNCTION IF EXISTS public.purge_return_events(int);

CREATE OR REPLACE FUNCTION public.purge_return_audit_logs(p_retention_days int DEFAULT 365)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE deleted_count int;
BEGIN
  DELETE FROM public.audit_logs
  WHERE entity_type = 'return_request'
    AND created_at < now() - make_interval(days => p_retention_days);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION public.purge_return_audit_logs(int) IS 'Purge old return-related audit_logs entries after retention period (default 365 days)';

-- 6b. Update cron job to use new function name
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-return-events') THEN
    PERFORM cron.unschedule('cleanup-return-events');
  END IF;
  PERFORM cron.schedule(
    'cleanup-return-audit-logs',
    '0 6 1 * *',
    $cmd$SELECT purge_return_audit_logs(365)$cmd$
  );
EXCEPTION WHEN OTHERS THEN
  -- cron extension may not be available; skip silently
  NULL;
END $$;


-- 7. Update execute_account_deletion_db to use audit_logs instead of return_events
CREATE OR REPLACE FUNCTION public.execute_account_deletion_db(
  p_user_id UUID,
  p_partner_id UUID
) RETURNS INT AS $$
DECLARE
  v_affected_rows INT := 0;
  v_temp_rows INT := 0;
  v_return_ids UUID[];
  v_appt_ids UUID[];
  v_rec_sub_ids UUID[];
  v_rec_plan_ids UUID[];
  v_err_msg TEXT;
  v_err_detail TEXT;
BEGIN
  PERFORM set_config('dudit.bypass_payment_method_guard', 'true', true);

  PERFORM 1 FROM public.account_deletions 
  WHERE user_id = p_user_id AND status != 'completed' 
  FOR UPDATE;

  IF p_partner_id IS NOT NULL THEN
    SELECT array_agg(id) INTO v_return_ids FROM public.return_requests WHERE partner_id = p_partner_id;

    IF v_return_ids IS NOT NULL AND array_length(v_return_ids, 1) > 0 THEN
      DELETE FROM public.return_evidence WHERE return_request_id = ANY(v_return_ids);
      GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
      v_affected_rows := v_affected_rows + v_temp_rows;

      DELETE FROM public.return_items WHERE return_request_id = ANY(v_return_ids);
      GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
      v_affected_rows := v_affected_rows + v_temp_rows;

      DELETE FROM public.audit_logs WHERE entity_type = 'return_request' AND entity_id = ANY(v_return_ids);
      GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
      v_affected_rows := v_affected_rows + v_temp_rows;
    END IF;

    DELETE FROM public.return_messages WHERE partner_id = p_partner_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;

    DELETE FROM public.return_notifications WHERE partner_id = p_partner_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;

    DELETE FROM public.return_refunds WHERE partner_id = p_partner_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  RETURN v_affected_rows;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


COMMIT;
