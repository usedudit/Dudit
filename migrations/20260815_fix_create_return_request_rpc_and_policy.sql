-- ==============================================================================
-- Migration: 20260815_fix_create_return_request_rpc_and_policy.sql
-- Fix create_return_request RPC overload, schema cache visibility and parameter defaults
-- ==============================================================================

BEGIN;

-- 1. Drop existing overloaded functions under create_return_request
DROP FUNCTION IF EXISTS public.create_return_request(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, TIMESTAMPTZ, TEXT, UUID, TEXT, UUID, UUID);
DROP FUNCTION IF EXISTS public.create_return_request(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, TIMESTAMPTZ, TEXT, UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS public.create_return_request(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, TIMESTAMPTZ, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS public.create_return_request(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, TIMESTAMPTZ, TEXT);
DROP FUNCTION IF EXISTS public.create_return_request(UUID, UUID, UUID, JSONB, VARCHAR, VARCHAR, JSONB, TEXT, VARCHAR, VARCHAR, TEXT);

-- Drop existing unsafe implementations if present
DROP FUNCTION IF EXISTS public.__mvp_unsafe_create_return_request(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, TIMESTAMPTZ, TEXT, UUID, TEXT, UUID, UUID);
DROP FUNCTION IF EXISTS public.__mvp_unsafe_create_return_request(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, TIMESTAMPTZ, TEXT, UUID, TEXT);

-- 2. Define the complete internal __mvp_unsafe_create_return_request
CREATE OR REPLACE FUNCTION public.__mvp_unsafe_create_return_request(
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
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
      AND rr.status NOT IN ('REJECTED', 'EXPIRED', 'CANCELLED');

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
$$;

-- 3. Revoke direct access to the private function
REVOKE ALL ON FUNCTION public.__mvp_unsafe_create_return_request(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, TIMESTAMPTZ, TEXT, UUID, TEXT, UUID, UUID) FROM PUBLIC, anon, authenticated;

-- 4. Create the public secured wrapper create_return_request with default values
CREATE OR REPLACE FUNCTION public.create_return_request(
  p_partner_id UUID,
  p_order_id UUID,
  p_created_by UUID,
  p_source TEXT,
  p_resolution TEXT,
  p_reason TEXT,
  p_message TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::JSONB,
  p_evidence JSONB DEFAULT '[]'::JSONB,
  p_idempotency_key TEXT DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_request_type TEXT DEFAULT NULL,
  p_origin_request_id UUID DEFAULT NULL,
  p_origin_type TEXT DEFAULT NULL,
  p_store_id UUID DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM public.mvp_assert_rpc_context(
      p_partner_id,
      p_created_by,
      p_order_id,
      NULL,
      NULL,
      p_store_id,
      p_customer_id,
      p_items,
      true,  -- allow buyer
      false,
      ARRAY['owner','admin','manager','operator']::text[]
    );

    RETURN public.__mvp_unsafe_create_return_request(
      p_partner_id,
      p_order_id,
      p_created_by,
      p_source,
      p_resolution,
      p_reason,
      p_message,
      p_items,
      p_evidence,
      p_idempotency_key,
      p_expires_at,
      p_request_type,
      p_origin_request_id,
      p_origin_type,
      p_store_id,
      p_customer_id
    );
END;
$$;

-- 5. Revoke anon, grant execute to authenticated & service_role
REVOKE ALL ON FUNCTION public.create_return_request(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, TIMESTAMPTZ, TEXT, UUID, TEXT, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_return_request(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, TIMESTAMPTZ, TEXT, UUID, TEXT, UUID, UUID) TO authenticated, service_role;

COMMIT;
