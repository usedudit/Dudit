-- ============================================================================
-- Fix SQL functions that still reference partners.store_name after
-- 20260729_clean_partners_schema.sql dropped the column, AND fix missing
-- store_id on stock_movements created by return requests.
--
-- Affected functions:
--   1. build_return_policy_snapshot  (return policies)
--   2. create_return_request         (return request creation)
--   3. audit_trigger_func            (audit log trigger)
--   4. process_return_request        (process returns + attach store_id to stock movement)
--
-- ============================================================================

BEGIN;

-- ─── 1. Fix build_return_policy_snapshot ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.build_return_policy_snapshot(p_partner_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy public.partner_return_policies%ROWTYPE;
  v_store_name TEXT;
BEGIN
  -- Was: SELECT store_name INTO v_store_name FROM public.partners ...
  SELECT s.name INTO v_store_name
  FROM public.stores s
  WHERE s.partner_id = p_partner_id
  ORDER BY s.created_at ASC
  LIMIT 1;

  SELECT * INTO v_policy
  FROM public.partner_return_policies
  WHERE partner_id = p_partner_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'version', 1,
      'captured_at', NOW(),
      'partner_id', p_partner_id,
      'store_name', v_store_name,
      'legal_reference', jsonb_build_object(
        'online_regret_days', 7,
        'durable_product_days', 90,
        'non_durable_product_days', 30
      ),
      'commercial', jsonb_build_object(
        'accepts_size_exchange', TRUE,
        'accepts_color_exchange', TRUE,
        'accepts_store_credit', TRUE,
        'accepts_in_person_return', TRUE,
        'accepts_shipping_return', TRUE,
        'shipping_payer', 'case_by_case',
        'commercial_deadline_days', 30,
        'additional_warranty_days', 0,
        'notes', NULL
      ),
      'full_policy_text', public.default_return_policy_text(v_store_name),
      'receipt_message', NULL,
      'receipt_show_policy_block', TRUE,
      'sla_response_days', 5
    );
  END IF;

  RETURN jsonb_build_object(
    'version', 1,
    'captured_at', NOW(),
    'partner_id', p_partner_id,
    'store_name', v_store_name,
    'legal_reference', jsonb_build_object(
      'online_regret_days', v_policy.legal_online_regret_days,
      'durable_product_days', v_policy.legal_durable_product_days,
      'non_durable_product_days', v_policy.legal_non_durable_product_days
    ),
    'commercial', jsonb_build_object(
      'accepts_size_exchange', v_policy.accepts_size_exchange,
      'accepts_color_exchange', v_policy.accepts_color_exchange,
      'accepts_store_credit', v_policy.accepts_store_credit,
      'accepts_in_person_return', v_policy.accepts_in_person_return,
      'accepts_shipping_return', v_policy.accepts_shipping_return,
      'shipping_payer', v_policy.shipping_payer,
      'commercial_deadline_days', v_policy.commercial_deadline_days,
      'additional_warranty_days', v_policy.additional_warranty_days,
      'notes', v_policy.commercial_notes
    ),
    'full_policy_text', COALESCE(NULLIF(TRIM(v_policy.full_policy_text), ''), public.default_return_policy_text(v_store_name)),
    'receipt_message', v_policy.receipt_message,
    'receipt_show_policy_block', v_policy.receipt_show_policy_block,
    'sla_response_days', v_policy.sla_response_days
  );
END;
$$;

-- ─── 2. Fix create_return_request ────────────────────────────────────────────
-- Full rewrite of latest version (from 20260725_add_store_id_to_store_only_modules.sql)
-- Only change: lines that did SELECT store_name FROM partners → stores.name
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
  p_store_id UUID DEFAULT NULL
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

  -- *** FIX: was SELECT store_name FROM partners ***
  SELECT s.name INTO v_partner_name
  FROM public.stores s
  WHERE s.partner_id = p_partner_id
  ORDER BY s.created_at ASC
  LIMIT 1;

  v_origin_type := NULLIF(p_origin_type, '');

  INSERT INTO public.return_requests (
    partner_id, order_id, store_id, customer_id, customer_user_id, source, request_type,
    desired_resolution, approved_resolution, resolution_type, reason, customer_reason,
    customer_message, customer_details, status, order_number_snapshot, order_total_snapshot,
    customer_name_snapshot, seller_name_snapshot, idempotency_key, expires_at, created_by, updated_by,
    policy_snapshot, eligibility_status, eligibility_details, sla_due_at, sla_status
  ) VALUES (
    p_partner_id, p_order_id, v_store_id, v_order.buyer_id,
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

    IF v_already_requested + v_qty > COALESCE(v_order_item.quantity, 0) THEN
      RAISE EXCEPTION 'Quantidade devolvida excede a quantidade do pedido';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.return_items ri
      JOIN public.return_requests rr ON rr.id = ri.return_request_id
      WHERE ri.order_item_id = v_order_item.id AND rr.deleted_at IS NULL
        AND rr.status IN ('RESOLVED', 'APPROVED', 'PROCESSING')
        AND COALESCE(rr.approved_resolution, rr.desired_resolution) = 'exchange'
        AND rr.exchange_order_id IS NOT NULL AND v_order.exchange_parent_order_id IS NULL
    ) THEN
      RAISE EXCEPTION 'Item já foi trocado. Use o pedido de troca ativo.';
    END IF;

    v_sku := NULL;
    IF v_order_item.variant_id IS NOT NULL THEN
      SELECT sku INTO v_sku FROM public.product_variants WHERE id = v_order_item.variant_id;
    END IF;
    IF v_sku IS NULL AND v_order_item.product_id IS NOT NULL THEN
      SELECT sku INTO v_sku FROM public.products WHERE id = v_order_item.product_id;
    END IF;
    IF v_sku IS NULL THEN v_sku := v_item->>'sku'; END IF;

    v_line_subtotal := COALESCE(v_order_item.subtotal, v_order_item.product_price * v_order_item.quantity, 0);
    v_line_net := COALESCE(v_order_item.net_item_value, v_line_subtotal);
    IF v_order_subtotal > 0 THEN
      v_line_net := ROUND((v_line_subtotal / v_order_subtotal) * v_amount_paid, 2);
    END IF;
    v_return_net := ROUND((v_line_net / GREATEST(v_order_item.quantity, 1)) * v_qty, 2);

    v_parent_item_id := public.resolve_return_parent_item_id(v_order_item.id);

    INSERT INTO public.return_items (
      return_request_id, order_item_id, product_id, variant_id,
      product_name_snapshot, sku_snapshot, unit_price_snapshot, net_item_value_snapshot,
      ordered_quantity, quantity, condition, reason, desired_resolution, metadata,
      parent_item_id, origin_request_id, origin_type
    ) VALUES (
      v_request_id, v_order_item.id, v_order_item.product_id, v_order_item.variant_id,
      COALESCE(v_order_item.product_name, 'Item'), v_sku,
      COALESCE(v_order_item.product_price, 0), v_line_net,
      v_order_item.quantity, v_qty,
      NULLIF(v_item->>'condition', ''),
      NULLIF(LEFT(COALESCE(v_item->>'reason', p_reason), 120), ''),
      p_resolution, COALESCE(v_item->'metadata', '{}'::JSONB),
      v_parent_item_id,
      COALESCE(p_origin_request_id, NULLIF(v_item->>'origin_request_id', '')::UUID),
      COALESCE(v_origin_type, NULLIF(v_item->>'origin_type', ''))
    );

    v_total_amount := v_total_amount + v_return_net;
  END LOOP;

  IF v_request_type = 'cancellation' THEN v_total_amount := v_amount_paid; END IF;

  UPDATE public.return_requests
  SET refund_amount = CASE WHEN p_resolution = 'refund' THEN v_total_amount ELSE 0 END,
      store_credit_amount = CASE WHEN p_resolution = 'store_credit' THEN v_total_amount ELSE 0 END,
      updated_at = NOW()
  WHERE id = v_request_id;

  v_evidence_count := 0;
  FOR v_evidence IN SELECT * FROM jsonb_array_elements(COALESCE(p_evidence, '[]'::JSONB))
  LOOP
    v_evidence_count := v_evidence_count + 1;
    IF v_evidence_count > 5 THEN RAISE EXCEPTION 'Limite de evidências excedido'; END IF;
    INSERT INTO public.return_evidence (
      return_request_id, file_url, file_key, file_name, file_type, file_size,
      thumbnail_url, metadata, uploaded_by
    ) VALUES (
      v_request_id, v_evidence->>'file_url', NULLIF(v_evidence->>'file_key', ''),
      NULLIF(v_evidence->>'file_name', ''), NULLIF(v_evidence->>'file_type', ''),
      NULLIF(v_evidence->>'file_size', '')::BIGINT, NULLIF(v_evidence->>'thumbnail_url', ''),
      COALESCE(v_evidence->'metadata', '{}'::JSONB), p_created_by
    );
  END LOOP;

  INSERT INTO public.return_events (
    return_request_id, partner_id, store_id, actor_user_id, event_type, to_status, message, metadata, source, idempotency_key
  ) VALUES (
    v_request_id, p_partner_id, v_store_id, p_created_by, 'created', 'PENDING_REVIEW',
    CASE WHEN v_request_type = 'cancellation' THEN 'Solicitação de cancelamento criada' ELSE 'Solicitação criada' END,
    jsonb_build_object(
      'resolution', p_resolution, 'request_type', v_request_type, 'source', p_source,
      'amount_basis', v_total_amount, 'eligibility_status', v_eligibility->>'status',
      'sla_due_at', v_sla_due
    ),
    'user', CASE WHEN p_idempotency_key IS NULL THEN NULL ELSE p_idempotency_key || ':event' END
  );

  INSERT INTO public.orders_history(order_id, partner_id, actor_user_id, entry_type, change_lines)
  VALUES (
    p_order_id, p_partner_id, p_created_by,
    CASE WHEN v_request_type = 'cancellation' THEN 'cancellation_requested' ELSE 'return_created' END,
    ARRAY[CASE WHEN v_request_type = 'cancellation' THEN 'Solicitação de cancelamento criada' ELSE 'Solicitação criada' END]
  );

  INSERT INTO public.return_notifications (
    return_request_id, partner_id, store_id, recipient_role, notification_type, title, message
  ) VALUES (
    v_request_id, p_partner_id, v_store_id, 'seller',
    CASE WHEN v_request_type = 'cancellation' THEN 'cancellation_created' ELSE 'return_created' END,
    CASE WHEN v_request_type = 'cancellation' THEN 'Nova solicitação de cancelamento' ELSE 'Nova solicitação' END,
    COALESCE(v_order.order_number, 'Pedido') || CASE WHEN v_request_type = 'cancellation' THEN ' recebeu uma solicitação de cancelamento.' ELSE ' recebeu uma solicitação de devolução ou troca.' END
  );

  RETURN jsonb_build_object(
    'id', v_request_id, 'idempotent', false, 'amount_basis', v_total_amount,
    'eligibility_status', v_eligibility->>'status', 'sla_due_at', v_sla_due
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 3. Fix process_return_request ───────────────────────────────────────────
-- Fix: pass v_store_id to create_batch_stock_movement so stock_movements gets store_id
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
        -- *** FIX: Pass v_store_id as 7th parameter ***
        v_stock_movement := public.create_batch_stock_movement(
          v_request.partner_id,
          'in',
          'RETURN_IN',
          'Devolução DVL-' || UPPER(SUBSTRING(p_request_id::TEXT FROM 1 FOR 6)),
          p_actor_user_id,
          v_items,
          v_store_id
        );

        v_stock_movement_id := NULLIF(v_stock_movement->>'id', '')::UUID;
        UPDATE public.stock_movements
        SET source_return_request_id = p_request_id,
            store_id = v_store_id,
            reason = 'RETURN_IN',
            notes = 'Devolução DVL-' || UPPER(SUBSTRING(p_request_id::TEXT FROM 1 FOR 6))
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
        created_by_user_id,
        store_id
      ) VALUES (
        v_request.partner_id,
        'Reembolso ' || COALESCE(v_request.order_number_snapshot, v_request.order_id::TEXT),
        'Reembolso',
        ABS(p_refund_amount),
        NULL,
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
        p_actor_user_id,
        v_store_id
      )
      RETURNING id INTO v_transaction_id;

      INSERT INTO public.return_refunds (
        return_request_id,
        partner_id,
        store_id,
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
        v_store_id,
        v_request.order_id,
        v_request.customer_id,
        ABS(p_refund_amount),
        'total',
        CASE WHEN UPPER(COALESCE(p_refund_status, '')) = 'APPROVED' THEN 'APPROVED' ELSE 'PENDING' END,
        NULLIF(p_refund_payment_method, ''),
        v_transaction_id,
        p_idempotency_key,
        p_actor_user_id
      )
      RETURNING id INTO v_refund_id;
    END IF;
  END IF;

  -- C) Store credit
  IF COALESCE(p_store_credit_amount, 0) > 0 THEN
    IF v_request.store_credit_transaction_id IS NOT NULL THEN
      v_credit_transaction_id := v_request.store_credit_transaction_id;
    ELSE
      INSERT INTO public.customer_store_credits (
        partner_id,
        store_id,
        customer_id,
        source_return_request_id,
        amount,
        used_amount,
        balance,
        status,
        expires_at,
        notes,
        created_by
      ) VALUES (
        v_request.partner_id,
        v_store_id,
        v_request.customer_id,
        p_request_id,
        ABS(p_store_credit_amount),
        0,
        ABS(p_store_credit_amount),
        'active',
        NOW() + INTERVAL '180 days',
        'Crédito referente a devolução DVL-' || UPPER(SUBSTRING(p_request_id::TEXT FROM 1 FOR 6)),
        p_actor_user_id
      )
      RETURNING id INTO v_credit_id;

      INSERT INTO public.transactions (
        partner_id,
        description,
        category,
        amount,
        due_date,
        payment_date,
        status,
        notes,
        transaction_type,
        customer_id,
        contact_type,
        reference_note,
        origin,
        created_by_user_id,
        store_id
      ) VALUES (
        v_request.partner_id,
        'Crédito em Loja ' || COALESCE(v_request.order_number_snapshot, v_request.order_id::TEXT),
        'Crédito em Loja',
        ABS(p_store_credit_amount),
        NULL,
        NOW(),
        'paid',
        'Crédito concedido na devolução',
        'expense',
        v_request.customer_id,
        'customer',
        'return:' || p_request_id::TEXT || ':credit',
        'system',
        p_actor_user_id,
        v_store_id
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
      updated_at = NOW()
  WHERE id = p_request_id;

  INSERT INTO public.return_events (
    return_request_id, partner_id, store_id, actor_user_id, event_type, from_status, to_status, message, metadata, source, idempotency_key
  ) VALUES (
    p_request_id, v_request.partner_id, v_store_id, p_actor_user_id, p_action, v_old_status, v_new_status,
    COALESCE(NULLIF(LEFT(COALESCE(p_notes, ''), 2000), ''), 'Status atualizado'),
    jsonb_build_object(
      'refund_amount', p_refund_amount,
      'refund_status', p_refund_status,
      'store_credit_amount', p_store_credit_amount,
      'return_to_inventory', p_return_to_inventory,
      'stock_movement_id', v_stock_movement_id,
      'exchange_order_id', v_exchange_order_id
    ),
    'user', p_idempotency_key
  );

  RETURN jsonb_build_object(
    'id', p_request_id,
    'status', v_new_status,
    'stock_movement_id', v_stock_movement_id,
    'refund_id', v_refund_id,
    'store_credit_id', v_credit_id,
    'exchange_order_id', v_exchange_order_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 4. Fix audit_trigger_func ───────────────────────────────────────────────
-- 3 occurrences of: SELECT store_name INTO v_partner_name FROM public.partners
-- All changed to: SELECT s.name FROM public.stores s WHERE s.partner_id = ...
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_old_diff jsonb := '{}'::jsonb;
  v_new_diff jsonb := '{}'::jsonb;
  v_key text;
  v_old_val jsonb;
  v_new_val jsonb;
  v_old_json jsonb;
  v_new_json jsonb;
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_actor_email text;
  v_partner_name text;
  v_store_name text;
  v_partner_id uuid;
  v_store_id uuid;
BEGIN
  -- Try resolving actor details from user_profiles if auth.uid() is set
  IF v_actor_id IS NOT NULL THEN
    SELECT
      COALESCE(NULLIF(trim(full_name), ''), display_name, 'Usuário'),
      email
    INTO v_actor_name, v_actor_email
    FROM public.user_profiles
    WHERE user_id = v_actor_id;
  END IF;

  IF (TG_OP = 'DELETE') THEN
    v_old_json := row_to_json(OLD)::jsonb;
    v_partner_id := (v_old_json->>'partner_id')::uuid;
    v_store_id := (v_old_json->>'store_id')::uuid;

    IF v_partner_id IS NOT NULL THEN
      -- *** FIX: was SELECT store_name FROM partners ***
      SELECT s.name INTO v_partner_name FROM public.stores s WHERE s.partner_id = v_partner_id ORDER BY s.created_at ASC LIMIT 1;
    END IF;
    IF v_store_id IS NOT NULL THEN
      SELECT name INTO v_store_name FROM public.stores WHERE id = v_store_id;
    END IF;

    INSERT INTO public.audit_logs (
      table_name, action, old_values, user_id, actor_user_id, partner_id, store_id,
      actor_name, actor_email, partner_name, store_name
    )
    VALUES (
      TG_TABLE_NAME, TG_OP, v_old_json, v_actor_id, v_actor_id, v_partner_id, v_store_id,
      v_actor_name, v_actor_email, v_partner_name, v_store_name
    );
    RETURN OLD;

  ELSIF (TG_OP = 'UPDATE') THEN
    v_old_json := row_to_json(OLD)::jsonb;
    v_new_json := row_to_json(NEW)::jsonb;
    v_partner_id := COALESCE((v_new_json->>'partner_id')::uuid, (v_old_json->>'partner_id')::uuid);
    v_store_id := COALESCE((v_new_json->>'store_id')::uuid, (v_old_json->>'store_id')::uuid);

    -- Calculate DIFF only for changed fields
    FOR v_key IN SELECT jsonb_object_keys(v_new_json) LOOP
      v_old_val := v_old_json->v_key;
      v_new_val := v_new_json->v_key;
      IF v_old_val IS DISTINCT FROM v_new_val THEN
        v_old_diff := jsonb_set(v_old_diff, ARRAY[v_key], COALESCE(v_old_val, 'null'::jsonb));
        v_new_diff := jsonb_set(v_new_diff, ARRAY[v_key], COALESCE(v_new_val, 'null'::jsonb));
      END IF;
    END LOOP;

    -- Only insert log if there was an actual change
    IF v_old_diff != '{}'::jsonb OR v_new_diff != '{}'::jsonb THEN
      IF v_partner_id IS NOT NULL THEN
        -- *** FIX: was SELECT store_name FROM partners ***
        SELECT s.name INTO v_partner_name FROM public.stores s WHERE s.partner_id = v_partner_id ORDER BY s.created_at ASC LIMIT 1;
      END IF;
      IF v_store_id IS NOT NULL THEN
        SELECT name INTO v_store_name FROM public.stores WHERE id = v_store_id;
      END IF;

      INSERT INTO public.audit_logs (
        table_name, action, old_values, new_values, user_id, actor_user_id, partner_id, store_id,
        actor_name, actor_email, partner_name, store_name
      )
      VALUES (
        TG_TABLE_NAME, TG_OP, v_old_diff, v_new_diff, v_actor_id, v_actor_id, v_partner_id, v_store_id,
        v_actor_name, v_actor_email, v_partner_name, v_store_name
      );
    END IF;
    RETURN NEW;

  ELSIF (TG_OP = 'INSERT') THEN
    v_new_json := row_to_json(NEW)::jsonb;
    v_partner_id := (v_new_json->>'partner_id')::uuid;
    v_store_id := (v_new_json->>'store_id')::uuid;

    IF v_partner_id IS NOT NULL THEN
      -- *** FIX: was SELECT store_name FROM partners ***
      SELECT s.name INTO v_partner_name FROM public.stores s WHERE s.partner_id = v_partner_id ORDER BY s.created_at ASC LIMIT 1;
    END IF;
    IF v_store_id IS NOT NULL THEN
      SELECT name INTO v_store_name FROM public.stores WHERE id = v_store_id;
    END IF;

    INSERT INTO public.audit_logs (
      table_name, action, new_values, user_id, actor_user_id, partner_id, store_id,
      actor_name, actor_email, partner_name, store_name
    )
    VALUES (
      TG_TABLE_NAME, TG_OP, v_new_json, v_actor_id, v_actor_id, v_partner_id, v_store_id,
      v_actor_name, v_actor_email, v_partner_name, v_store_name
    );
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

-- ─── 5. Backfill missing store_id on existing stock_movements for returns ────
UPDATE public.stock_movements sm
SET store_id = rr.store_id
FROM public.return_requests rr
WHERE sm.source_return_request_id = rr.id
  AND sm.store_id IS NULL
  AND rr.store_id IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
