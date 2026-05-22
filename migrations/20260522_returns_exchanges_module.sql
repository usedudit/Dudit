-- ============================================================================
-- Returns & exchanges module
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.return_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  customer_id UUID NULL,
  customer_user_id UUID NULL,
  source TEXT NOT NULL DEFAULT 'erp' CHECK (source IN ('erp', 'marketplace', 'moderation')),
  request_type TEXT NOT NULL DEFAULT 'return' CHECK (request_type IN ('return', 'exchange', 'refund', 'store_credit')),
  desired_resolution TEXT NOT NULL CHECK (desired_resolution IN ('exchange', 'refund', 'store_credit')),
  approved_resolution TEXT NULL CHECK (approved_resolution IS NULL OR approved_resolution IN ('exchange', 'refund', 'store_credit')),
  reason TEXT NOT NULL,
  customer_message TEXT NULL,
  seller_notes TEXT NULL,
  internal_notes TEXT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (
    status IN (
      'PENDING_REVIEW',
      'UNDER_ANALYSIS',
      'APPROVED',
      'REJECTED',
      'WAITING_CUSTOMER',
      'WAITING_ITEM_RETURN',
      'PROCESSING',
      'RESOLVED',
      'EXPIRED',
      'ESCALATED'
    )
  ),
  refund_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
  store_credit_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (store_credit_amount >= 0),
  exchange_amount_due NUMERIC(14, 2) NOT NULL DEFAULT 0,
  order_number_snapshot TEXT NULL,
  order_total_snapshot NUMERIC(14, 2) NOT NULL DEFAULT 0,
  customer_name_snapshot TEXT NULL,
  customer_email_snapshot TEXT NULL,
  seller_name_snapshot TEXT NULL,
  moderation_case_id UUID NULL,
  idempotency_key TEXT NULL,
  expires_at TIMESTAMPTZ NULL,
  locked_at TIMESTAMPTZ NULL,
  resolved_at TIMESTAMPTZ NULL,
  rejected_at TIMESTAMPTZ NULL,
  escalated_at TIMESTAMPTZ NULL,
  created_by UUID NULL,
  updated_by UUID NULL,
  deleted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_request_id UUID NOT NULL REFERENCES public.return_requests(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE RESTRICT,
  product_id UUID NULL REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id UUID NULL REFERENCES public.product_variants(id) ON DELETE SET NULL,
  product_name_snapshot TEXT NOT NULL,
  sku_snapshot TEXT NULL,
  unit_price_snapshot NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ordered_quantity INTEGER NOT NULL CHECK (ordered_quantity > 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  condition TEXT NULL CHECK (condition IS NULL OR condition IN ('sealed', 'opened', 'damaged')),
  reason TEXT NULL,
  desired_resolution TEXT NULL CHECK (desired_resolution IS NULL OR desired_resolution IN ('exchange', 'refund', 'store_credit')),
  exchange_product_id UUID NULL REFERENCES public.products(id) ON DELETE SET NULL,
  exchange_variant_id UUID NULL REFERENCES public.product_variants(id) ON DELETE SET NULL,
  exchange_quantity INTEGER NULL CHECK (exchange_quantity IS NULL OR exchange_quantity > 0),
  exchange_unit_price NUMERIC(14, 2) NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.return_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_request_id UUID NOT NULL REFERENCES public.return_requests(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_key TEXT NULL,
  file_name TEXT NULL,
  file_type TEXT NULL,
  file_size BIGINT NULL CHECK (file_size IS NULL OR file_size >= 0),
  thumbnail_url TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  uploaded_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.return_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_request_id UUID NOT NULL REFERENCES public.return_requests(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  actor_user_id UUID NULL,
  event_type TEXT NOT NULL,
  from_status TEXT NULL,
  to_status TEXT NULL,
  message TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'system', 'gateway', 'moderation')),
  idempotency_key TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.return_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_request_id UUID NOT NULL REFERENCES public.return_requests(id) ON DELETE RESTRICT,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  customer_id UUID NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  refund_type TEXT NOT NULL DEFAULT 'partial' CHECK (refund_type IN ('full', 'partial')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'APPROVED', 'FAILED', 'MANUAL')),
  payment_provider TEXT NULL,
  payment_method TEXT NULL,
  mp_payment_id TEXT NULL,
  mp_refund_id TEXT NULL,
  financial_transaction_id UUID NULL REFERENCES public.transactions(id) ON DELETE SET NULL,
  idempotency_key TEXT NULL,
  error_message TEXT NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.store_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  customer_id UUID NULL,
  customer_user_id UUID NULL,
  return_request_id UUID NULL REFERENCES public.return_requests(id) ON DELETE SET NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  remaining_amount NUMERIC(14, 2) NOT NULL CHECK (remaining_amount >= 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'USED', 'EXPIRED', 'CANCELLED')),
  expires_at TIMESTAMPTZ NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.return_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_request_id UUID NOT NULL REFERENCES public.return_requests(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  recipient_user_id UUID NULL,
  recipient_customer_id UUID NULL,
  recipient_role TEXT NOT NULL CHECK (recipient_role IN ('customer', 'seller', 'admin')),
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NULL,
  read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_return_requests_partner_created
  ON public.return_requests(partner_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_return_requests_order
  ON public.return_requests(order_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_return_requests_customer_user
  ON public.return_requests(customer_user_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_return_requests_status
  ON public.return_requests(partner_id, status, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_return_requests_partner_idempotency
  ON public.return_requests(partner_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_return_items_request
  ON public.return_items(return_request_id);
CREATE INDEX IF NOT EXISTS idx_return_items_order_item
  ON public.return_items(order_item_id);
CREATE INDEX IF NOT EXISTS idx_return_evidence_request
  ON public.return_evidence(return_request_id, created_at);
CREATE INDEX IF NOT EXISTS idx_return_events_request_created
  ON public.return_events(return_request_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_return_events_idempotency
  ON public.return_events(return_request_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_return_refunds_request
  ON public.return_refunds(return_request_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_return_refunds_idempotency
  ON public.return_refunds(return_request_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_store_credits_customer
  ON public.store_credits(partner_id, customer_id, status);
CREATE INDEX IF NOT EXISTS idx_store_credits_customer_user
  ON public.store_credits(partner_id, customer_user_id, status);

ALTER TABLE public.return_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS return_requests_select_partner_or_customer ON public.return_requests;
CREATE POLICY return_requests_select_partner_or_customer
  ON public.return_requests FOR SELECT
  USING (
    customer_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.partners p
      WHERE p.id = return_requests.partner_id
        AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.partner_users pu
      WHERE pu.partner_id = return_requests.partner_id
        AND pu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS return_requests_write_partner ON public.return_requests;
CREATE POLICY return_requests_write_partner
  ON public.return_requests FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.partners p WHERE p.id = return_requests.partner_id AND p.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.partner_users pu WHERE pu.partner_id = return_requests.partner_id AND pu.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.partners p WHERE p.id = return_requests.partner_id AND p.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.partner_users pu WHERE pu.partner_id = return_requests.partner_id AND pu.user_id = auth.uid())
  );

DROP POLICY IF EXISTS return_items_select_visible ON public.return_items;
CREATE POLICY return_items_select_visible
  ON public.return_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.return_requests rr WHERE rr.id = return_items.return_request_id));

DROP POLICY IF EXISTS return_items_write_partner ON public.return_items;
CREATE POLICY return_items_write_partner
  ON public.return_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.return_requests rr
      WHERE rr.id = return_items.return_request_id
        AND (
          EXISTS (SELECT 1 FROM public.partners p WHERE p.id = rr.partner_id AND p.user_id = auth.uid())
          OR EXISTS (SELECT 1 FROM public.partner_users pu WHERE pu.partner_id = rr.partner_id AND pu.user_id = auth.uid())
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.return_requests rr
      WHERE rr.id = return_items.return_request_id
        AND (
          EXISTS (SELECT 1 FROM public.partners p WHERE p.id = rr.partner_id AND p.user_id = auth.uid())
          OR EXISTS (SELECT 1 FROM public.partner_users pu WHERE pu.partner_id = rr.partner_id AND pu.user_id = auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS return_evidence_select_visible ON public.return_evidence;
CREATE POLICY return_evidence_select_visible
  ON public.return_evidence FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.return_requests rr WHERE rr.id = return_evidence.return_request_id));

DROP POLICY IF EXISTS return_child_select_visible ON public.return_events;
CREATE POLICY return_child_select_visible
  ON public.return_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.return_requests rr WHERE rr.id = return_events.return_request_id));

DROP POLICY IF EXISTS return_refunds_select_visible ON public.return_refunds;
CREATE POLICY return_refunds_select_visible
  ON public.return_refunds FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.return_requests rr WHERE rr.id = return_refunds.return_request_id));

DROP POLICY IF EXISTS store_credits_select_visible ON public.store_credits;
CREATE POLICY store_credits_select_visible
  ON public.store_credits FOR SELECT
  USING (
    customer_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.partners p WHERE p.id = store_credits.partner_id AND p.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.partner_users pu WHERE pu.partner_id = store_credits.partner_id AND pu.user_id = auth.uid())
  );

DROP POLICY IF EXISTS return_notifications_select_visible ON public.return_notifications;
CREATE POLICY return_notifications_select_visible
  ON public.return_notifications FOR SELECT
  USING (
    recipient_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.partners p WHERE p.id = return_notifications.partner_id AND p.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.partner_users pu WHERE pu.partner_id = return_notifications.partner_id AND pu.user_id = auth.uid())
  );

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
  p_expires_at TIMESTAMPTZ DEFAULT NULL
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
  v_total_amount NUMERIC(14,2) := 0;
  v_evidence_count INTEGER;
BEGIN
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

  IF p_resolution NOT IN ('exchange', 'refund', 'store_credit') THEN
    RAISE EXCEPTION 'Invalid resolution';
  END IF;

  IF COALESCE(jsonb_array_length(p_items), 0) = 0 THEN
    RAISE EXCEPTION 'At least one item is required';
  END IF;

  IF COALESCE(jsonb_array_length(p_evidence), 0) > 5 THEN
    RAISE EXCEPTION 'Evidence limit exceeded';
  END IF;

  SELECT o.*
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
    AND o.partner_id = p_partner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  SELECT store_name INTO v_partner_name
  FROM public.partners
  WHERE id = p_partner_id;

  INSERT INTO public.return_requests (
    partner_id,
    order_id,
    customer_id,
    customer_user_id,
    source,
    request_type,
    desired_resolution,
    reason,
    customer_message,
    status,
    order_number_snapshot,
    order_total_snapshot,
    customer_name_snapshot,
    seller_name_snapshot,
    idempotency_key,
    expires_at,
    created_by,
    updated_by
  ) VALUES (
    p_partner_id,
    p_order_id,
    v_order.buyer_id,
    CASE WHEN p_source = 'marketplace' THEN v_order.buyer_id ELSE NULL END,
    COALESCE(NULLIF(p_source, ''), 'erp'),
    CASE WHEN p_resolution = 'exchange' THEN 'exchange' WHEN p_resolution = 'store_credit' THEN 'store_credit' ELSE 'refund' END,
    p_resolution,
    LEFT(TRIM(p_reason), 120),
    NULLIF(LEFT(TRIM(COALESCE(p_message, '')), 2000), ''),
    'PENDING_REVIEW',
    v_order.order_number,
    COALESCE(v_order.total_amount, 0),
    v_order.customer_name,
    v_partner_name,
    p_idempotency_key,
    p_expires_at,
    p_created_by,
    p_created_by
  )
  RETURNING id INTO v_request_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := COALESCE((v_item->>'quantity')::INTEGER, 0);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid item quantity';
    END IF;

    SELECT oi.*
    INTO v_order_item
    FROM public.order_items oi
    WHERE oi.id = (v_item->>'order_item_id')::UUID
      AND oi.order_id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Order item not found';
    END IF;

    SELECT COALESCE(SUM(ri.quantity), 0)
    INTO v_already_requested
    FROM public.return_items ri
    JOIN public.return_requests rr ON rr.id = ri.return_request_id
    WHERE ri.order_item_id = v_order_item.id
      AND rr.deleted_at IS NULL
      AND rr.status NOT IN ('REJECTED', 'EXPIRED');

    IF v_already_requested + v_qty > COALESCE(v_order_item.quantity, 0) THEN
      RAISE EXCEPTION 'Returned quantity exceeds ordered quantity';
    END IF;

    INSERT INTO public.return_items (
      return_request_id,
      order_item_id,
      product_id,
      variant_id,
      product_name_snapshot,
      sku_snapshot,
      unit_price_snapshot,
      ordered_quantity,
      quantity,
      condition,
      reason,
      desired_resolution,
      metadata
    ) VALUES (
      v_request_id,
      v_order_item.id,
      v_order_item.product_id,
      v_order_item.variant_id,
      COALESCE(v_order_item.product_name, 'Item'),
      COALESCE(v_order_item.sku, v_item->>'sku'),
      COALESCE(v_order_item.product_price, 0),
      COALESCE(v_order_item.quantity, 1),
      v_qty,
      NULLIF(v_item->>'condition', ''),
      NULLIF(LEFT(COALESCE(v_item->>'reason', p_reason), 120), ''),
      COALESCE(NULLIF(v_item->>'resolution', ''), p_resolution),
      COALESCE(v_item->'metadata', '{}'::JSONB)
    );

    v_total_amount := v_total_amount + (COALESCE(v_order_item.product_price, 0) * v_qty);
  END LOOP;

  UPDATE public.return_requests
  SET refund_amount = CASE WHEN p_resolution = 'refund' THEN v_total_amount ELSE 0 END,
      store_credit_amount = CASE WHEN p_resolution = 'store_credit' THEN v_total_amount ELSE 0 END,
      updated_at = NOW()
  WHERE id = v_request_id;

  v_evidence_count := 0;
  FOR v_evidence IN SELECT * FROM jsonb_array_elements(COALESCE(p_evidence, '[]'::JSONB))
  LOOP
    v_evidence_count := v_evidence_count + 1;
    IF v_evidence_count > 5 THEN
      RAISE EXCEPTION 'Evidence limit exceeded';
    END IF;

    INSERT INTO public.return_evidence (
      return_request_id,
      file_url,
      file_key,
      file_name,
      file_type,
      file_size,
      thumbnail_url,
      metadata,
      uploaded_by
    ) VALUES (
      v_request_id,
      v_evidence->>'file_url',
      NULLIF(v_evidence->>'file_key', ''),
      NULLIF(v_evidence->>'file_name', ''),
      NULLIF(v_evidence->>'file_type', ''),
      NULLIF(v_evidence->>'file_size', '')::BIGINT,
      NULLIF(v_evidence->>'thumbnail_url', ''),
      COALESCE(v_evidence->'metadata', '{}'::JSONB),
      p_created_by
    );
  END LOOP;

  INSERT INTO public.return_events (
    return_request_id,
    partner_id,
    actor_user_id,
    event_type,
    to_status,
    message,
    metadata,
    source,
    idempotency_key
  ) VALUES (
    v_request_id,
    p_partner_id,
    p_created_by,
    'created',
    'PENDING_REVIEW',
    'Return request created',
    jsonb_build_object('resolution', p_resolution, 'source', p_source),
    CASE WHEN p_source = 'marketplace' THEN 'user' ELSE 'user' END,
    CASE WHEN p_idempotency_key IS NULL THEN NULL ELSE p_idempotency_key || ':event' END
  );

  INSERT INTO public.orders_history(order_id, partner_id, actor_user_id, entry_type, change_lines)
  VALUES (
    p_order_id,
    p_partner_id,
    p_created_by,
    'return_created',
    ARRAY['Return request created']
  );

  INSERT INTO public.return_notifications (
    return_request_id,
    partner_id,
    recipient_role,
    notification_type,
    title,
    message
  ) VALUES (
    v_request_id,
    p_partner_id,
    'seller',
    'return_created',
    'New return request',
    COALESCE(v_order.order_number, 'Order') || ' has a new return request.'
  );

  RETURN jsonb_build_object('id', v_request_id, 'idempotent', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
  v_stock_movement JSON;
  v_items JSONB;
  v_transition_allowed BOOLEAN := FALSE;
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

  INSERT INTO public.orders_history(order_id, partner_id, actor_user_id, entry_type, change_lines)
  VALUES (
    v_request.order_id,
    v_request.partner_id,
    p_actor_user_id,
    'return_' || LOWER(COALESCE(NULLIF(p_action, ''), 'updated')),
    ARRAY[
      CASE
        WHEN v_new_status <> v_old_status THEN 'Return status changed from ' || v_old_status || ' to ' || v_new_status
        ELSE 'Return request updated'
      END
    ]
  );

  IF p_return_to_inventory THEN
    INSERT INTO public.orders_history(order_id, partner_id, actor_user_id, entry_type, change_lines)
    VALUES (v_request.order_id, v_request.partner_id, p_actor_user_id, 'return_stock', ARRAY['Stock returned from return request']);
  END IF;

  IF v_refund_id IS NOT NULL THEN
    INSERT INTO public.orders_history(order_id, partner_id, actor_user_id, entry_type, change_lines)
    VALUES (v_request.order_id, v_request.partner_id, p_actor_user_id, 'return_refund', ARRAY['Refund generated']);
  END IF;

  IF v_credit_id IS NOT NULL THEN
    INSERT INTO public.orders_history(order_id, partner_id, actor_user_id, entry_type, change_lines)
    VALUES (v_request.order_id, v_request.partner_id, p_actor_user_id, 'return_credit', ARRAY['Store credit generated']);
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.expire_due_return_requests()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  UPDATE public.return_requests
  SET status = 'EXPIRED',
      locked_at = NOW(),
      updated_at = NOW()
  WHERE deleted_at IS NULL
    AND expires_at IS NOT NULL
    AND expires_at < NOW()
    AND status IN ('PENDING_REVIEW', 'UNDER_ANALYSIS', 'WAITING_CUSTOMER', 'WAITING_ITEM_RETURN');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
