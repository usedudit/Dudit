-- Fix exchange order payment_method: use 'exchange' instead of refund method
-- Also fix total_amount to show full replacement total instead of just difference

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
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;

  IF v_request.status IN ('RESOLVED', 'REJECTED', 'EXPIRED') THEN
    RAISE EXCEPTION 'Solicitação bloqueada';
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
    RAISE EXCEPTION 'Valor de reembolso excede o valor pago proporcional dos itens';
  END IF;

  IF COALESCE(p_store_credit_amount, 0) > v_max_action_amount + 0.009 THEN
    RAISE EXCEPTION 'Valor de crédito excede o valor pago proporcional dos itens';
  END IF;

  IF COALESCE(p_refund_amount, 0) + COALESCE(p_store_credit_amount, 0) > v_max_action_amount + 0.009 THEN
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

  -- A) Stock movement: RETURN_IN (prevent duplicates)
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
          'Devolução do cliente',
          p_actor_user_id,
          v_items
        );

        v_stock_movement_id := NULLIF(v_stock_movement->>'id', '')::UUID;
        UPDATE public.stock_movements
        SET source_return_request_id = p_request_id,
            reason = 'RETURN_IN',
            notes = COALESCE(notes, 'Devolução do cliente - solicitação DVL-' || UPPER(SUBSTRING(p_request_id::TEXT FROM 1 FOR 6)))
        WHERE id = v_stock_movement_id;
      END IF;
    END IF;
  END IF;

  -- B) Refund finance: immediate Expense/Refund/Paid
  IF COALESCE(p_refund_amount, 0) > 0 THEN
    IF v_request.refund_transaction_id IS NOT NULL THEN
      v_transaction_id := v_request.refund_transaction_id;
      SELECT id INTO v_refund_id
      FROM public.return_refunds
      WHERE return_request_id = p_request_id
      ORDER BY created_at DESC
      LIMIT 1;
    ELSE
      INSERT INTO public.transactions (
        partner_id,
        description,
        category,
        amount,
        due_date,
        payment_date,
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
        'Reembolso ' || COALESCE(v_request.order_number_snapshot, v_request.order_id::TEXT),
        'Refund',
        ABS(p_refund_amount),
        CURRENT_DATE,
        NOW(),
        'paid',
        COALESCE(NULLIF(LEFT(COALESCE(p_notes, ''), 2000), ''), 'Reembolso aprovado'),
        NULLIF(p_refund_payment_method, ''),
        'expense',
        v_request.customer_id,
        'customer',
        NULL,
        'return:' || p_request_id::TEXT || ':refund',
        'system',
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
        COALESCE(NULLIF(p_refund_status, ''), 'APPROVED'),
        NULLIF(p_refund_payment_method, ''),
        v_transaction_id,
        CASE WHEN p_idempotency_key IS NULL THEN NULL ELSE p_idempotency_key || ':refund' END,
        p_actor_user_id
      )
      RETURNING id INTO v_refund_id;
    END IF;
  END IF;

  -- Store credit: liability (not expense)
  IF COALESCE(p_store_credit_amount, 0) > 0 THEN
    IF v_request.store_credit_transaction_id IS NOT NULL THEN
      v_credit_transaction_id := v_request.store_credit_transaction_id;
      SELECT id INTO v_credit_id
      FROM public.store_credits
      WHERE return_request_id = p_request_id
      ORDER BY created_at DESC
      LIMIT 1;
    ELSE
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

      INSERT INTO public.transactions (
        partner_id,
        description,
        category,
        amount,
        due_date,
        payment_date,
        status,
        notes,
        payment_type,
        transaction_type,
        customer_id,
        contact_type,
        reference_note,
        origin,
        account_id,
        created_by_user_id
      ) VALUES (
        v_request.partner_id,
        'Crédito para cliente ' || COALESCE(v_request.order_number_snapshot, v_request.order_id::TEXT),
        'Store Credit Liability',
        ABS(p_store_credit_amount),
        CURRENT_DATE,
        NOW(),
        'active',
        'Crédito em loja gerado',
        'store_credit',
        'adjustment',
        v_request.customer_id,
        'customer',
        'return:' || p_request_id::TEXT || ':credit',
        'system',
        NULL,
        p_actor_user_id
      )
      RETURNING id INTO v_credit_transaction_id;
    END IF;
  END IF;

  -- Exchange products: persist selection + substatus, generate linked exchange order
  IF jsonb_array_length(v_exchange_items) > 0 THEN
    IF v_request.exchange_order_id IS NOT NULL THEN
      v_exchange_order_id := v_request.exchange_order_id;
    ELSE
      FOR v_exchange_item IN SELECT * FROM jsonb_array_elements(v_exchange_items)
      LOOP
        v_exchange_total := v_exchange_total
          + ROUND((COALESCE((v_exchange_item->>'unit_price')::NUMERIC, 0) * COALESCE((v_exchange_item->>'quantity')::INTEGER, 1))::NUMERIC, 2);
      END LOOP;

      v_exchange_difference := GREATEST(0, v_exchange_total - v_max_action_amount);
      v_exchange_surplus := GREATEST(0, v_max_action_amount - v_exchange_total);

      SELECT COALESCE(v_request.order_number_snapshot, 'EX') || '-DVL' ||
             (COALESCE(COUNT(*), 0) + 1)::TEXT
      INTO v_exchange_order_number
      FROM public.orders
      WHERE exchange_parent_order_id = v_request.order_id;

      INSERT INTO public.orders (
        order_number,
        buyer_id,
        customer_name,
        partner_id,
        total_amount,
        delivery_fee,
        delivery_type,
        delivery_address,
        payment_method,
        payment_provider,
        situation,
        delivery_status,
        order_source,
        notes,
        exchange_parent_order_id,
        exchange_return_request_id,
        created_at,
        updated_at
      )
      SELECT
        v_exchange_order_number,
        buyer_id,
        customer_name,
        partner_id,
        v_exchange_difference,
        0,
        delivery_type,
        delivery_address,
        'exchange',
        payment_provider,
        CASE WHEN v_exchange_difference > 0 THEN 'pending' ELSE 'paid' END,
        'not_sent',
        'Troca',
        'Pedido gerado pela troca DVL-' || UPPER(SUBSTRING(p_request_id::TEXT FROM 1 FOR 6)),
        id,
        p_request_id,
        NOW(),
        NOW()
      FROM public.orders
      WHERE id = v_request.order_id
      RETURNING id INTO v_exchange_order_id;

      FOR v_exchange_item IN SELECT * FROM jsonb_array_elements(v_exchange_items)
      LOOP
        INSERT INTO public.order_items (
          order_id,
          product_id,
          variant_id,
          product_name,
          product_price,
          quantity,
          subtotal,
          net_item_value
        )
        SELECT
          v_exchange_order_id,
          p.id,
          NULLIF(v_exchange_item->>'variant_id', '')::UUID,
          p.name,
          COALESCE((v_exchange_item->>'unit_price')::NUMERIC, p.price, 0),
          COALESCE((v_exchange_item->>'quantity')::INTEGER, 1),
          ROUND((COALESCE((v_exchange_item->>'unit_price')::NUMERIC, p.price, 0) * COALESCE((v_exchange_item->>'quantity')::INTEGER, 1))::NUMERIC, 2),
          ROUND((COALESCE((v_exchange_item->>'unit_price')::NUMERIC, p.price, 0) * COALESCE((v_exchange_item->>'quantity')::INTEGER, 1))::NUMERIC, 2)
        FROM public.products p
        WHERE p.id = (v_exchange_item->>'product_id')::UUID
          AND p.partner_id = v_request.partner_id;
      END LOOP;

      PERFORM public.recalculate_order_paid_values(v_exchange_order_id);

      SELECT COALESCE(
        jsonb_agg(jsonb_build_object(
          'product_id', oi.product_id,
          'variant_id', oi.variant_id,
          'quantity', oi.quantity
        )),
        '[]'::JSONB
      )
      INTO v_items
      FROM public.order_items oi
      WHERE oi.order_id = v_exchange_order_id
        AND oi.product_id IS NOT NULL;

      IF jsonb_array_length(v_items) > 0 THEN
        PERFORM public.create_batch_stock_movement(
          v_request.partner_id,
          'out',
          'SALE_OUT',
          'Produtos de reposição - solicitação DVL-' || UPPER(SUBSTRING(p_request_id::TEXT FROM 1 FOR 6)),
          p_actor_user_id,
          v_items
        );
      END IF;

      IF v_exchange_difference > 0 THEN
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
          reference_note,
          origin,
          account_id,
          created_by_user_id
        ) VALUES (
          v_request.partner_id,
          'Receita troca ' || v_exchange_order_number,
          'Exchange Payment',
          v_exchange_difference,
          CURRENT_DATE,
          'pending',
          'Valor complementar da troca',
          'exchange',
          'income',
          v_request.customer_id,
          'customer',
          'return:' || p_request_id::TEXT,
          'system',
          NULL,
          p_actor_user_id
        );
      ELSIF v_exchange_surplus > 0 AND p_exchange_balance_resolution = 'store_credit' THEN
        p_store_credit_amount := p_store_credit_amount + v_exchange_surplus;
      ELSIF v_exchange_surplus > 0 AND p_exchange_balance_resolution = 'refund' THEN
        p_refund_amount := p_refund_amount + v_exchange_surplus;
      END IF;
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
      refund_amount = CASE WHEN COALESCE(p_refund_amount, 0) > 0 THEN ABS(p_refund_amount) ELSE refund_amount END,
      store_credit_amount = CASE WHEN COALESCE(p_store_credit_amount, 0) > 0 THEN ABS(p_store_credit_amount) ELSE store_credit_amount END,
      inventory_movement_id = COALESCE(inventory_movement_id, v_stock_movement_id),
      refund_transaction_id = COALESCE(refund_transaction_id, v_transaction_id),
      store_credit_transaction_id = COALESCE(store_credit_transaction_id, v_credit_transaction_id),
      exchange_order_id = COALESCE(exchange_order_id, v_exchange_order_id),
      exchange_shortfall_amount = CASE WHEN v_exchange_difference > 0 THEN v_exchange_difference ELSE exchange_shortfall_amount END,
      exchange_surplus_amount = CASE WHEN v_exchange_surplus > 0 THEN v_exchange_surplus ELSE exchange_surplus_amount END,
      exchange_items_snapshot = CASE WHEN jsonb_array_length(v_exchange_items) > 0 THEN v_exchange_items ELSE exchange_items_snapshot END,
      exchange_substatus = CASE WHEN jsonb_array_length(v_exchange_items) > 0 AND exchange_substatus IS NULL THEN 'aguardando_envio' ELSE exchange_substatus END,
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
    COALESCE(
      NULLIF(LEFT(COALESCE(p_notes, ''), 1000), ''),
      public.return_event_message_pt(COALESCE(NULLIF(p_action, ''), 'status_updated'), v_old_status, v_new_status, p_refund_amount, p_store_credit_amount, p_return_to_inventory)
    ),
    jsonb_build_object(
      'refund_id', v_refund_id,
      'store_credit_id', v_credit_id,
      'transaction_id', v_transaction_id,
      'credit_transaction_id', v_credit_transaction_id,
      'exchange_order_id', v_exchange_order_id,
      'exchange_shortfall_amount', v_exchange_difference,
      'exchange_surplus_amount', v_exchange_surplus,
      'stock_movement', v_stock_movement,
      'return_to_inventory', p_return_to_inventory
    ),
    CASE WHEN p_action = 'moderation_decision' THEN 'moderation' ELSE 'user' END,
    p_idempotency_key
  );

  INSERT INTO public.orders_history(order_id, partner_id, actor_user_id, entry_type, change_lines)
  VALUES (
    v_request.order_id,
    v_request.partner_id,
    p_actor_user_id,
    'return_' || LOWER(COALESCE(NULLIF(p_action, ''), 'updated')),
    ARRAY[
      CASE
        WHEN v_new_status <> v_old_status THEN 'Solicitação atualizada: ' || public.return_status_label_pt(v_old_status) || ' para ' || public.return_status_label_pt(v_new_status)
        ELSE 'Solicitação atualizada'
      END
    ]
  );

  IF p_return_to_inventory THEN
    INSERT INTO public.orders_history(order_id, partner_id, actor_user_id, entry_type, change_lines)
    VALUES (v_request.order_id, v_request.partner_id, p_actor_user_id, 'return_stock', ARRAY['Produto devolvido ao estoque']);
  END IF;

  IF v_refund_id IS NOT NULL THEN
    INSERT INTO public.orders_history(order_id, partner_id, actor_user_id, entry_type, change_lines)
    VALUES (v_request.order_id, v_request.partner_id, p_actor_user_id, 'return_refund', ARRAY['Reembolso aprovado']);
  END IF;

  IF v_credit_id IS NOT NULL THEN
    INSERT INTO public.orders_history(order_id, partner_id, actor_user_id, entry_type, change_lines)
    VALUES (v_request.order_id, v_request.partner_id, p_actor_user_id, 'return_credit', ARRAY['Crédito em loja gerado']);
  END IF;

  IF v_exchange_order_id IS NOT NULL THEN
    INSERT INTO public.orders_history(order_id, partner_id, actor_user_id, entry_type, change_lines)
    VALUES (v_request.order_id, v_request.partner_id, p_actor_user_id, 'return_exchange', ARRAY['Troca aprovada']);
  END IF;

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
    'Solicitação atualizada',
    'Sua solicitação agora está ' || public.return_status_label_pt(v_new_status) || '.'
  );

  RETURN jsonb_build_object(
    'id', p_request_id,
    'status', v_new_status,
    'refund_id', v_refund_id,
    'store_credit_id', v_credit_id,
    'transaction_id', v_transaction_id,
    'credit_transaction_id', v_credit_transaction_id,
    'exchange_order_id', v_exchange_order_id,
    'exchange_shortfall_amount', v_exchange_difference,
    'exchange_surplus_amount', v_exchange_surplus,
    'stock_movement', v_stock_movement,
    'idempotent', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
