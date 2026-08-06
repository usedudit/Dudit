-- -----------------------------------------------------------------------------
-- MIGRATION: Migrate return_events to audit_logs & Enhance audit_logs Trigger
-- -----------------------------------------------------------------------------

-- 1. Enhance sync_audit_log_fields trigger function to auto-enrich actor & store snapshots
CREATE OR REPLACE FUNCTION public.sync_audit_log_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_user_exists BOOLEAN;
BEGIN
  -- Validate actor_user_id against auth.users to prevent FK violation
  IF NEW.actor_user_id IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.actor_user_id) INTO v_user_exists;
    IF NOT v_user_exists THEN
      NEW.actor_user_id := NULL;
    END IF;
  END IF;

  IF NEW.user_id IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.user_id) INTO v_user_exists;
    IF NOT v_user_exists THEN
      NEW.user_id := NULL;
    END IF;
  END IF;

  -- Sync user_id / actor_user_id
  IF NEW.actor_user_id IS NOT NULL AND NEW.user_id IS NULL THEN
    NEW.user_id := NEW.actor_user_id;
  ELSIF NEW.user_id IS NOT NULL AND NEW.actor_user_id IS NULL THEN
    NEW.actor_user_id := NEW.user_id;
  END IF;

  -- Sync table_name / entity_type
  IF NEW.entity_type IS NOT NULL AND (NEW.table_name IS NULL OR NEW.table_name = '' OR NEW.table_name = 'system') THEN
    NEW.table_name := NEW.entity_type;
  ELSIF NEW.table_name IS NOT NULL AND (NEW.entity_type IS NULL OR NEW.entity_type = '' OR NEW.entity_type = 'system') THEN
    NEW.entity_type := NEW.table_name;
  END IF;

  -- Sync action / action_type
  IF NEW.action_type IS NOT NULL AND (NEW.action IS NULL OR NEW.action = '' OR NEW.action = 'UNKNOWN') THEN
    NEW.action := UPPER(NEW.action_type);
  ELSIF NEW.action IS NOT NULL AND (NEW.action_type IS NULL OR NEW.action_type = '') THEN
    NEW.action_type := LOWER(NEW.action);
  END IF;

  -- Auto-populate actor_name and actor_email if user_id / actor_user_id is set
  IF (NEW.actor_name IS NULL OR NEW.actor_email IS NULL) AND NEW.actor_user_id IS NOT NULL THEN
    SELECT full_name INTO NEW.actor_name FROM public.user_profiles WHERE user_id = NEW.actor_user_id;
    SELECT email INTO NEW.actor_email FROM auth.users WHERE id = NEW.actor_user_id;
  END IF;

  -- Auto-populate store_id if partner_id is set and store_id is NULL
  IF NEW.store_id IS NULL AND NEW.partner_id IS NOT NULL THEN
    SELECT id INTO NEW.store_id FROM public.stores WHERE partner_id = NEW.partner_id ORDER BY created_at ASC LIMIT 1;
  END IF;

  -- Auto-populate store_name and partner_name if store_id or partner_id is set
  IF NEW.store_name IS NULL AND NEW.store_id IS NOT NULL THEN
    SELECT name INTO NEW.store_name FROM public.stores WHERE id = NEW.store_id;
  END IF;

  IF NEW.partner_name IS NULL AND NEW.partner_id IS NOT NULL THEN
    SELECT name INTO NEW.partner_name FROM public.stores WHERE partner_id = NEW.partner_id ORDER BY created_at ASC LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_audit_log_fields ON public.audit_logs;
CREATE TRIGGER trg_sync_audit_log_fields
  BEFORE INSERT OR UPDATE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_audit_log_fields();

-- 2. Backfill historical records from return_events into audit_logs (if return_events exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'return_events') THEN
    INSERT INTO public.audit_logs (
      table_name, action, old_values, new_values, user_id, actor_user_id, partner_id, store_id,
      entity_type, entity_id, action_type, change_lines, metadata, source, created_at
    )
    SELECT
      'return_requests' AS table_name,
      UPPER(COALESCE(re.event_type, 'UPDATED')) AS action,
      jsonb_build_object('status', re.from_status) AS old_values,
      jsonb_build_object('status', re.to_status) AS new_values,
      CASE WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = re.actor_user_id) THEN re.actor_user_id ELSE NULL END AS user_id,
      CASE WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = re.actor_user_id) THEN re.actor_user_id ELSE NULL END AS actor_user_id,
      re.partner_id,
      re.store_id,
      'return_request' AS entity_type,
      re.return_request_id AS entity_id,
      LOWER(COALESCE(re.event_type, 'updated')) AS action_type,
      ARRAY[COALESCE(re.message, 'Evento de devolução registrado.')] AS change_lines,
      COALESCE(re.metadata, '{}'::JSONB) AS metadata,
      COALESCE(re.source, 'system') AS source,
      re.created_at
    FROM public.return_events re
    WHERE NOT EXISTS (
      SELECT 1 FROM public.audit_logs al
      WHERE al.entity_type = 'return_request'
        AND al.entity_id = re.return_request_id
        AND al.created_at = re.created_at
    );
  END IF;
END $$;

-- 3. Update create_return_request procedure to insert into audit_logs instead of return_events
CREATE OR REPLACE FUNCTION public.create_return_request(
  p_partner_id UUID,
  p_order_id UUID,
  p_created_by UUID,
  p_items JSONB,
  p_resolution VARCHAR(30) DEFAULT 'refund',
  p_reason VARCHAR(120) DEFAULT 'outro',
  p_evidence JSONB DEFAULT '[]'::JSONB,
  p_customer_message TEXT DEFAULT NULL,
  p_customer_phone VARCHAR(40) DEFAULT NULL,
  p_source VARCHAR(30) DEFAULT 'user',
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_request_id UUID;
  v_store_id UUID;
  v_item JSONB;
  v_evidence JSONB;
  v_order_item RECORD;
  v_already_requested INT;
  v_total_amount NUMERIC(12,2) := 0;
  v_line_subtotal NUMERIC(12,2);
  v_line_net NUMERIC(12,2);
  v_return_net NUMERIC(12,2);
  v_order_subtotal NUMERIC(12,2);
  v_amount_paid NUMERIC(12,2);
  v_qty INT;
  v_sku TEXT;
  v_evidence_count INT := 0;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_request_id
    FROM public.return_requests
    WHERE partner_id = p_partner_id
      AND idempotency_key = p_idempotency_key
      AND deleted_at IS NULL
    LIMIT 1;

    IF v_request_id IS NOT NULL THEN
      RETURN jsonb_build_object('id', v_request_id, 'idempotent', true);
    END IF;
  END IF;

  SELECT store_id, total_amount, COALESCE(paid_amount, amount_paid, total_amount)
  INTO v_store_id, v_order_subtotal, v_amount_paid
  FROM public.orders
  WHERE id = p_order_id;

  INSERT INTO public.return_requests (
    partner_id, store_id, order_id, customer_id, customer_user_id,
    request_type, desired_resolution, approved_resolution, status, reason,
    customer_message, customer_phone, source, idempotency_key
  ) VALUES (
    p_partner_id, v_store_id, p_order_id, p_created_by, p_created_by,
    'return', p_resolution, NULL, 'PENDING_REVIEW', p_reason,
    p_customer_message, p_customer_phone,
    CASE WHEN LOWER(COALESCE(p_source, '')) IN ('user', 'system', 'gateway', 'moderation', 'erp', 'marketplace') THEN LOWER(p_source) ELSE 'user' END,
    p_idempotency_key
  ) RETURNING id INTO v_request_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::JSONB))
  LOOP
    v_qty := GREATEST(1, COALESCE((v_item->>'quantity')::INT, 1));
    SELECT * INTO v_order_item
    FROM public.order_items
    WHERE id = (v_item->>'order_item_id')::UUID;

    IF v_order_item.id IS NULL THEN
      RAISE EXCEPTION 'Item do pedido % não encontrado', (v_item->>'order_item_id');
    END IF;

    SELECT COALESCE(SUM(ri.quantity), 0)
    INTO v_already_requested
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
      'items_count', jsonb_array_length(p_items)
    )
  );

  RETURN jsonb_build_object('id', v_request_id, 'idempotent', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update process_return_request procedure to insert into audit_logs instead of return_events
CREATE OR REPLACE FUNCTION public.process_return_request(
  p_request_id UUID,
  p_actor_user_id UUID,
  p_action VARCHAR(30),
  p_notes TEXT DEFAULT NULL,
  p_refund_amount NUMERIC(12,2) DEFAULT NULL,
  p_refund_status VARCHAR(30) DEFAULT NULL,
  p_refund_payment_method VARCHAR(50) DEFAULT NULL,
  p_store_credit_amount NUMERIC(12,2) DEFAULT NULL,
  p_return_to_inventory BOOLEAN DEFAULT TRUE,
  p_exchange_items JSONB DEFAULT '[]'::JSONB,
  p_exchange_balance_resolution VARCHAR(30) DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_request RECORD;
  v_old_status VARCHAR(50);
  v_new_status VARCHAR(50);
  v_total_return_net NUMERIC(12,2) := 0;
  v_max_action_amount NUMERIC(12,2) := 0;
  v_effective_refund_amount NUMERIC(12,2) := 0;
  v_effective_credit_amount NUMERIC(12,2) := 0;
  v_stock_movement_id UUID := NULL;
  v_refund_id UUID := NULL;
  v_credit_id UUID := NULL;
  v_transaction_id UUID := NULL;
  v_credit_transaction_id UUID := NULL;
  v_exchange_order_id UUID := NULL;
  v_exchange_order_number TEXT;
  v_items JSONB := '[]'::JSONB;
  v_exchange_items JSONB := COALESCE(p_exchange_items, '[]'::JSONB);
  v_exchange_total NUMERIC(12,2) := 0;
  v_exchange_difference NUMERIC(12,2) := 0;
  v_exchange_surplus NUMERIC(12,2) := 0;
  v_exchange_item JSONB;
  v_stock_movement JSONB;
  v_store_id UUID;
  v_valid_actor UUID;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT metadata->>'stock_movement_id' INTO v_stock_movement_id
    FROM public.audit_logs
    WHERE entity_type = 'return_request'
      AND entity_id = p_request_id
      AND metadata->>'idempotency_key' = p_idempotency_key
    LIMIT 1;

    IF v_stock_movement_id IS NOT NULL THEN
      SELECT * INTO v_request FROM public.return_requests WHERE id = p_request_id;
      RETURN jsonb_build_object(
        'id', p_request_id,
        'status', v_request.status,
        'idempotent', true
      );
    END IF;
  END IF;

  SELECT * INTO v_request
  FROM public.return_requests
  WHERE id = p_request_id AND deleted_at IS NULL;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Solicitação de devolução % não encontrada', p_request_id;
  END IF;

  v_store_id := v_request.store_id;
  IF v_store_id IS NULL THEN
    SELECT store_id INTO v_store_id FROM public.orders WHERE id = v_request.order_id;
  END IF;

  SELECT id INTO v_valid_actor FROM auth.users WHERE id = p_actor_user_id;
  IF v_valid_actor IS NULL THEN
    p_actor_user_id := v_request.customer_id;
  END IF;

  v_old_status := v_request.status;

  SELECT COALESCE(SUM(net_item_value_snapshot), 0)
  INTO v_total_return_net
  FROM public.return_items
  WHERE return_request_id = p_request_id;

  v_max_action_amount := v_total_return_net;

  CASE LOWER(p_action)
    WHEN 'approve' THEN
      IF v_request.status IN ('RESOLVED', 'REJECTED', 'EXPIRED') THEN
        RAISE EXCEPTION 'Não é possível aprovar uma solicitação no status %', v_request.status;
      END IF;
      v_new_status := 'APPROVED';

    WHEN 'reject' THEN
      IF v_request.status IN ('RESOLVED', 'REJECTED', 'EXPIRED') THEN
        RAISE EXCEPTION 'Não é possível recusar uma solicitação no status %', v_request.status;
      END IF;
      v_new_status := 'REJECTED';

    WHEN 'complete', 'resolve' THEN
      IF v_request.status IN ('REJECTED', 'EXPIRED') THEN
        RAISE EXCEPTION 'Não é possível concluir uma solicitação no status %', v_request.status;
      END IF;
      v_new_status := 'RESOLVED';

    WHEN 'cancel' THEN
      IF v_request.status IN ('RESOLVED', 'REJECTED', 'EXPIRED') THEN
        RAISE EXCEPTION 'Não é possível cancelar uma solicitação no status %', v_request.status;
      END IF;
      v_new_status := 'REJECTED';

    ELSE
      v_new_status := COALESCE(NULLIF(UPPER(p_action), ''), v_request.status);
  END CASE;

  IF LOWER(p_action) IN ('approve', 'complete', 'resolve') THEN
    IF p_refund_amount IS NOT NULL AND p_refund_amount > 0 THEN
      v_effective_refund_amount := LEAST(p_refund_amount, v_max_action_amount);
    ELSIF COALESCE(v_request.approved_resolution, v_request.desired_resolution) = 'refund' THEN
      v_effective_refund_amount := v_max_action_amount;
    END IF;

    IF p_store_credit_amount IS NOT NULL AND p_store_credit_amount > 0 THEN
      v_effective_credit_amount := LEAST(p_store_credit_amount, v_max_action_amount);
    ELSIF COALESCE(v_request.approved_resolution, v_request.desired_resolution) = 'store_credit' THEN
      v_effective_credit_amount := v_max_action_amount;
    END IF;
  END IF;

  IF p_return_to_inventory IS TRUE AND LOWER(p_action) IN ('approve', 'complete', 'resolve') THEN
    IF v_request.inventory_movement_id IS NOT NULL THEN
      v_stock_movement_id := v_request.inventory_movement_id;
    ELSE
      SELECT jsonb_agg(
        jsonb_build_object(
          'product_id', ri.product_id,
          'variant_id', ri.variant_id,
          'quantity', ri.quantity,
          'unit_price', ri.unit_price_snapshot
        )
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
            reference_name = 'Devolução DVL-' || UPPER(SUBSTRING(p_request_id::TEXT FROM 1 FOR 6)),
            notes = 'Devolução DVL-' || UPPER(SUBSTRING(p_request_id::TEXT FROM 1 FOR 6))
        WHERE id = v_stock_movement_id;
      END IF;
    END IF;
  END IF;

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

      IF p_exchange_balance_resolution = 'refund' AND v_exchange_surplus > 0 THEN
        v_effective_refund_amount := v_exchange_surplus;
      ELSIF p_exchange_balance_resolution = 'store_credit' AND v_exchange_surplus > 0 THEN
        v_effective_credit_amount := v_exchange_surplus;
      END IF;

      v_exchange_order_number := 'TROCA-' || UPPER(SUBSTRING(p_request_id::TEXT FROM 1 FOR 6));

      INSERT INTO public.orders (
        order_number,
        buyer_id,
        customer_name,
        partner_id,
        store_id,
        total_amount,
        subtotal_original,
        paid_amount,
        discount_amount,
        delivery_type,
        delivery_address,
        payment_method,
        payment_provider,
        situation,
        delivery_status,
        checkout_fulfillment,
        notes,
        original_order_id,
        exchange_return_request_id,
        payment_breakdown,
        is_exchange,
        created_at,
        updated_at
      )
      SELECT
        v_exchange_order_number,
        COALESCE(v_request.customer_id, buyer_id),
        COALESCE(v_request.customer_name_snapshot, customer_name),
        partner_id,
        v_store_id,
        v_exchange_total,
        v_exchange_total,
        v_exchange_total - v_exchange_difference,
        0,
        delivery_type,
        delivery_address,
        'exchange',
        NULL,
        CASE WHEN v_exchange_difference > 0 THEN 'pending' ELSE 'paid' END,
        'not_sent',
        'Troca',
        'Pedido gerado pela troca DVL-' || UPPER(SUBSTRING(p_request_id::TEXT FROM 1 FOR 6)),
        id,
        p_request_id,
        jsonb_build_array(jsonb_build_object(
          'method', 'exchange',
          'label', 'Crédito de Troca (DVL-' || UPPER(SUBSTRING(p_request_id::TEXT FROM 1 FOR 6)) || ')',
          'amount', v_exchange_total - v_exchange_difference,
          'return_request_id', p_request_id
        )),
        TRUE,
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
          (v_exchange_item->>'product_id')::UUID,
          (v_exchange_item->>'variant_id')::UUID,
          COALESCE(v_exchange_item->>'product_name', p.name, 'Produto Substituição'),
          COALESCE((v_exchange_item->>'unit_price')::NUMERIC, p.price, 0),
          COALESCE((v_exchange_item->>'quantity')::INTEGER, 1),
          ROUND((COALESCE((v_exchange_item->>'unit_price')::NUMERIC, p.price, 0) * COALESCE((v_exchange_item->>'quantity')::INTEGER, 1))::NUMERIC, 2),
          ROUND((COALESCE((v_exchange_item->>'unit_price')::NUMERIC, p.price, 0) * COALESCE((v_exchange_item->>'quantity')::INTEGER, 1))::NUMERIC, 2)
        FROM public.products p
        WHERE p.id = (v_exchange_item->>'product_id')::UUID;
      END LOOP;
    END IF;
  END IF;

  IF v_effective_refund_amount > 0 AND LOWER(p_action) IN ('approve', 'complete', 'resolve') THEN
    IF v_request.refund_id IS NULL THEN
      INSERT INTO public.return_refunds (
        return_request_id, partner_id, refund_type, amount, status, payment_method, processed_by
      ) VALUES (
        p_request_id, v_request.partner_id,
        CASE WHEN ABS(v_effective_refund_amount - v_max_action_amount) < 0.01 THEN 'full' ELSE 'partial' END,
        ABS(v_effective_refund_amount),
        COALESCE(NULLIF(UPPER(p_refund_status), ''), 'COMPLETED'),
        COALESCE(NULLIF(p_refund_payment_method, ''), 'manual'),
        p_actor_user_id
      )
      RETURNING id INTO v_refund_id;
    ELSE
      v_refund_id := v_request.refund_id;
    END IF;

    IF v_request.refund_transaction_id IS NULL THEN
      INSERT INTO public.transactions (
        partner_id, description, category, amount, due_date, payment_date, status,
        notes, payment_type, transaction_type, customer_id, contact_type, reference_note, origin, created_by_user_id, store_id
      ) VALUES (
        v_request.partner_id,
        'Reembolso Devolução ' || COALESCE(v_request.order_number_snapshot, v_request.order_id::TEXT),
        'Trocas e Devoluções',
        ABS(v_effective_refund_amount),
        NOW(), NOW(), 'paid',
        'Reembolso efetuado via devolução',
        COALESCE(NULLIF(LOWER(p_refund_payment_method), ''), 'manual'),
        'expense',
        v_request.customer_id,
        'customer',
        'return:' || p_request_id::TEXT,
        'system',
        p_actor_user_id,
        v_store_id
      )
      RETURNING id INTO v_transaction_id;
    END IF;
  END IF;

  IF v_effective_credit_amount > 0 AND LOWER(p_action) IN ('approve', 'complete', 'resolve') THEN
    IF v_request.store_credit_id IS NULL THEN
      INSERT INTO public.store_credits (
        partner_id, store_id, customer_id, return_request_id, amount, remaining_amount, metadata
      ) VALUES (
        v_request.partner_id, v_store_id, v_request.customer_id, p_request_id,
        ABS(v_effective_credit_amount), ABS(v_effective_credit_amount),
        jsonb_build_object('action', p_action, 'processed_by', p_actor_user_id)
      )
      RETURNING id INTO v_credit_id;

      UPDATE public.customers
      SET store_credit = COALESCE(store_credit, 0) + ABS(v_effective_credit_amount),
          updated_at = NOW()
      WHERE id = v_request.customer_id;
    ELSE
      v_credit_id := v_request.store_credit_id;
    END IF;

    IF v_request.store_credit_transaction_id IS NULL THEN
      INSERT INTO public.transactions (
        partner_id, description, category, amount, due_date, payment_date, status,
        notes, payment_type, transaction_type, customer_id, contact_type, reference_note, origin, created_by_user_id, store_id
      ) VALUES (
        v_request.partner_id,
        'Crédito em Loja ' || COALESCE(v_request.order_number_snapshot, v_request.order_id::TEXT),
        'Trocas e Devoluções',
        ABS(v_effective_credit_amount),
        NULL, NOW(), 'paid',
        'Crédito concedido na devolução',
        'store_credit',
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
    UPPER(p_action),
    v_request.partner_id,
    v_store_id,
    p_actor_user_id,
    p_actor_user_id,
    'return_request',
    p_request_id,
    LOWER(p_action),
    ARRAY[COALESCE(NULLIF(LEFT(COALESCE(p_notes, ''), 2000), ''), 'Status alterado de ' || v_old_status || ' para ' || v_new_status)],
    'erp',
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

DROP TABLE IF EXISTS public.return_events CASCADE;
