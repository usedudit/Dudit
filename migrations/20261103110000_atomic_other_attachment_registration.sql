BEGIN;

-- Legacy attachment tables may contain the same file key more than once.
-- Serialize new registrations by key and reject reuse without rewriting old rows.
CREATE OR REPLACE FUNCTION public.assert_attachment_file_key_unused(p_file_key text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_file_key IS NULL OR p_file_key = '' THEN
    RAISE EXCEPTION 'Attachment file key is required' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_file_key, 0));
  IF EXISTS (SELECT 1 FROM public.order_attachments WHERE file_key = p_file_key)
     OR EXISTS (SELECT 1 FROM public.service_order_attachments WHERE file_key = p_file_key)
     OR EXISTS (SELECT 1 FROM public.stock_movement_attachments WHERE file_key = p_file_key)
     OR EXISTS (SELECT 1 FROM public.transaction_attachments WHERE file_key = p_file_key)
     OR EXISTS (SELECT 1 FROM public.return_evidence WHERE file_key = p_file_key) THEN
    RAISE EXCEPTION 'Attachment file key has already been registered' USING ERRCODE = '23505';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_attachment_file_key_unused(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_attachment_file_key_unused(text) TO service_role;

CREATE OR REPLACE FUNCTION public.register_order_attachment_atomic(
  p_partner_id uuid, p_order_id uuid, p_uploaded_by uuid,
  p_file_key text, p_file_name text, p_file_type text,
  p_file_size bigint, p_file_hash text, p_attachment_limit integer
)
RETURNS SETOF public.order_attachments
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_count integer;
  v_attachment public.order_attachments%ROWTYPE;
BEGIN
  IF p_partner_id IS NULL OR p_order_id IS NULL OR p_uploaded_by IS NULL
     OR p_file_key IS NULL OR p_file_name IS NULL OR p_file_type IS NULL
     OR p_file_size IS NULL OR p_file_size < 1
     OR p_attachment_limit IS NULL OR p_attachment_limit < 1 OR p_attachment_limit > 15
     OR p_file_hash IS NULL OR p_file_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Order attachment fields are invalid' USING ERRCODE = '22023';
  END IF;
  IF p_file_key !~ ('^users/' || p_uploaded_by::text || '/orders/attachments/[^/]+$')
     OR length(p_file_name) > 255 OR length(p_file_type) > 127
     OR (p_file_type NOT LIKE 'image/%' AND p_file_type LIKE 'video/%') THEN
    RAISE EXCEPTION 'Order attachment key or metadata is invalid' USING ERRCODE = '22023';
  END IF;
  PERFORM public.assert_attachment_file_key_unused(p_file_key);

  SELECT o.* INTO v_order FROM public.orders o
  WHERE o.id = p_order_id AND o.partner_id = p_partner_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found for this partner' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO v_count FROM public.order_attachments a
  WHERE a.order_id = p_order_id
    AND ((p_file_type LIKE 'image/%' AND a.file_type LIKE 'image/%')
      OR (p_file_type NOT LIKE 'image/%' AND (a.file_type IS NULL OR a.file_type NOT LIKE 'image/%')));
  IF v_count >= p_attachment_limit THEN
    RAISE EXCEPTION 'Order attachment limit exceeded' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.order_attachments (
    order_id, file_key, file_name, file_type, file_size, uploaded_by, file_hash
  ) VALUES (
    p_order_id, p_file_key, p_file_name, p_file_type, p_file_size, p_uploaded_by, p_file_hash
  ) RETURNING * INTO v_attachment;
  RETURN NEXT v_attachment;
END;
$$;
REVOKE ALL ON FUNCTION public.register_order_attachment_atomic(uuid, uuid, uuid, text, text, text, bigint, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_order_attachment_atomic(uuid, uuid, uuid, text, text, text, bigint, text, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.register_service_order_attachment_atomic(
  p_partner_id uuid, p_service_order_id uuid, p_uploaded_by uuid,
  p_file_key text, p_file_name text, p_file_type text,
  p_file_size bigint, p_file_hash text, p_category text, p_attachment_limit integer
)
RETURNS SETOF public.service_order_attachments
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_service_order public.service_orders%ROWTYPE;
  v_count integer;
  v_attachment public.service_order_attachments%ROWTYPE;
BEGIN
  IF p_partner_id IS NULL OR p_service_order_id IS NULL OR p_uploaded_by IS NULL
     OR p_file_key IS NULL OR p_file_name IS NULL OR p_file_type IS NULL
     OR p_file_size IS NULL OR p_file_size < 1
     OR p_file_hash IS NULL OR p_file_hash !~ '^[0-9a-f]{64}$'
     OR p_category IS NULL OR p_category NOT IN ('normal', 'antes', 'depois')
     OR p_attachment_limit IS NULL OR p_attachment_limit < 1 OR p_attachment_limit > 15 THEN
    RAISE EXCEPTION 'Service order attachment fields are invalid' USING ERRCODE = '22023';
  END IF;
  IF p_file_key !~ ('^users/' || p_uploaded_by::text || '/(service-orders|serviceOrderAttachments)[^/]+$')
     OR length(p_file_name) > 255 OR length(p_file_type) > 127 OR p_file_type LIKE 'video/%' THEN
    RAISE EXCEPTION 'Service order attachment key or metadata is invalid' USING ERRCODE = '22023';
  END IF;
  PERFORM public.assert_attachment_file_key_unused(p_file_key);

  SELECT so.* INTO v_service_order FROM public.service_orders so
  WHERE so.id = p_service_order_id AND so.partner_id = p_partner_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service order not found for this partner' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO v_count FROM public.service_order_attachments a
  WHERE a.service_order_id = p_service_order_id;
  IF v_count >= p_attachment_limit THEN
    RAISE EXCEPTION 'Service order attachment limit exceeded' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.service_order_attachments (
    service_order_id, file_key, file_name, file_type, file_size, uploaded_by, category, file_hash
  ) VALUES (
    p_service_order_id, p_file_key, p_file_name, p_file_type, p_file_size, p_uploaded_by, p_category, p_file_hash
  ) RETURNING * INTO v_attachment;
  RETURN NEXT v_attachment;
END;
$$;
REVOKE ALL ON FUNCTION public.register_service_order_attachment_atomic(uuid, uuid, uuid, text, text, text, bigint, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_service_order_attachment_atomic(uuid, uuid, uuid, text, text, text, bigint, text, text, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.register_stock_movement_attachment_atomic(
  p_partner_id uuid, p_movement_id uuid, p_uploaded_by uuid,
  p_file_key text, p_file_name text, p_file_type text,
  p_file_size bigint, p_file_hash text, p_attachment_limit integer
)
RETURNS SETOF public.stock_movement_attachments
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_movement public.stock_movements%ROWTYPE;
  v_count integer;
  v_attachment public.stock_movement_attachments%ROWTYPE;
BEGIN
  IF p_partner_id IS NULL OR p_movement_id IS NULL OR p_uploaded_by IS NULL
     OR p_file_key IS NULL OR p_file_name IS NULL OR p_file_type IS NULL
     OR p_file_size IS NULL OR p_file_size < 1
     OR p_file_hash IS NULL OR p_file_hash !~ '^[0-9a-f]{64}$'
     OR p_attachment_limit IS NULL OR p_attachment_limit < 1 OR p_attachment_limit > 15 THEN
    RAISE EXCEPTION 'Stock movement attachment fields are invalid' USING ERRCODE = '22023';
  END IF;
  IF p_file_key !~ ('^users/' || p_uploaded_by::text || '/orders/attachments/[^/]+$')
     OR length(p_file_name) > 255 OR length(p_file_type) > 127 OR p_file_type LIKE 'video/%' THEN
    RAISE EXCEPTION 'Stock movement attachment key or metadata is invalid' USING ERRCODE = '22023';
  END IF;
  PERFORM public.assert_attachment_file_key_unused(p_file_key);

  SELECT sm.* INTO v_movement FROM public.stock_movements sm
  WHERE sm.id = p_movement_id AND sm.partner_id = p_partner_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock movement not found for this partner' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO v_count FROM public.stock_movement_attachments a
  WHERE a.stock_movement_id = p_movement_id;
  IF v_count >= p_attachment_limit THEN
    RAISE EXCEPTION 'Stock movement attachment limit exceeded' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.stock_movement_attachments (
    stock_movement_id, file_key, file_name, file_type, file_size, uploaded_by, file_hash
  ) VALUES (
    p_movement_id, p_file_key, p_file_name, p_file_type, p_file_size, p_uploaded_by, p_file_hash
  ) RETURNING * INTO v_attachment;
  RETURN NEXT v_attachment;
END;
$$;
REVOKE ALL ON FUNCTION public.register_stock_movement_attachment_atomic(uuid, uuid, uuid, text, text, text, bigint, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_stock_movement_attachment_atomic(uuid, uuid, uuid, text, text, text, bigint, text, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.register_transaction_attachment_atomic(
  p_partner_id uuid, p_transaction_id uuid, p_uploaded_by uuid,
  p_file_key text, p_file_name text, p_file_type text,
  p_file_size bigint, p_file_hash text, p_attachment_limit integer
)
RETURNS SETOF public.transaction_attachments
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_transaction public.transactions%ROWTYPE;
  v_count integer;
  v_attachment public.transaction_attachments%ROWTYPE;
BEGIN
  IF p_partner_id IS NULL OR p_transaction_id IS NULL OR p_uploaded_by IS NULL
     OR p_file_key IS NULL OR p_file_name IS NULL OR p_file_type IS NULL
     OR p_file_size IS NULL OR p_file_size < 1
     OR p_file_hash IS NULL OR p_file_hash !~ '^[0-9a-f]{64}$'
     OR p_attachment_limit IS NULL OR p_attachment_limit < 1 OR p_attachment_limit > 15 THEN
    RAISE EXCEPTION 'Transaction attachment fields are invalid' USING ERRCODE = '22023';
  END IF;
  IF p_file_key !~ ('^users/' || p_uploaded_by::text || '/orders/attachments/[^/]+$')
     OR length(p_file_name) > 255 OR length(p_file_type) > 127 OR p_file_type LIKE 'video/%' THEN
    RAISE EXCEPTION 'Transaction attachment key or metadata is invalid' USING ERRCODE = '22023';
  END IF;
  PERFORM public.assert_attachment_file_key_unused(p_file_key);

  SELECT t.* INTO v_transaction FROM public.transactions t
  WHERE t.id = p_transaction_id AND t.partner_id = p_partner_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found for this partner' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO v_count FROM public.transaction_attachments a
  WHERE a.transaction_id = p_transaction_id;
  IF v_count >= p_attachment_limit THEN
    RAISE EXCEPTION 'Transaction attachment limit exceeded' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.transaction_attachments (
    transaction_id, file_key, file_name, file_type, file_size, uploaded_by, file_hash
  ) VALUES (
    p_transaction_id, p_file_key, p_file_name, p_file_type, p_file_size, p_uploaded_by, p_file_hash
  ) RETURNING * INTO v_attachment;
  RETURN NEXT v_attachment;
END;
$$;
REVOKE ALL ON FUNCTION public.register_transaction_attachment_atomic(uuid, uuid, uuid, text, text, text, bigint, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_transaction_attachment_atomic(uuid, uuid, uuid, text, text, text, bigint, text, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.register_return_evidence_atomic(
  p_partner_id uuid, p_return_request_id uuid, p_uploaded_by uuid,
  p_file_key text, p_file_name text, p_file_type text,
  p_file_size bigint, p_file_hash text, p_attachment_limit integer
)
RETURNS SETOF public.return_evidence
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_request public.return_requests%ROWTYPE;
  v_store_id uuid;
  v_count integer;
  v_evidence public.return_evidence%ROWTYPE;
BEGIN
  IF p_partner_id IS NULL OR p_return_request_id IS NULL OR p_uploaded_by IS NULL
     OR p_file_key IS NULL OR p_file_name IS NULL OR p_file_type IS NULL
     OR p_file_size IS NULL OR p_file_size < 1
     OR p_file_hash IS NULL OR p_file_hash !~ '^[0-9a-f]{64}$'
     OR p_attachment_limit IS NULL OR p_attachment_limit < 1 OR p_attachment_limit > 15 THEN
    RAISE EXCEPTION 'Return evidence fields are invalid' USING ERRCODE = '22023';
  END IF;
  IF p_file_key !~ ('^users/' || p_uploaded_by::text || '/orders/attachments/[^/]+$')
     OR length(p_file_name) > 255 OR length(p_file_type) > 127 OR p_file_type LIKE 'video/%' THEN
    RAISE EXCEPTION 'Return evidence key or metadata is invalid' USING ERRCODE = '22023';
  END IF;
  PERFORM public.assert_attachment_file_key_unused(p_file_key);

  SELECT rr.* INTO v_request FROM public.return_requests rr
  WHERE rr.id = p_return_request_id AND rr.partner_id = p_partner_id AND rr.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return request not found for this partner' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(v_request.store_id, o.store_id) INTO v_store_id
  FROM public.orders o WHERE o.id = v_request.order_id;
  SELECT count(*) INTO v_count FROM public.return_evidence e
  WHERE e.return_request_id = p_return_request_id AND e.partner_id = p_partner_id;
  IF v_count >= p_attachment_limit THEN
    RAISE EXCEPTION 'Return evidence limit exceeded' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.return_evidence (
    return_request_id, partner_id, store_id, file_url, file_key, file_name,
    file_type, file_size, uploaded_by, metadata
  ) VALUES (
    p_return_request_id, p_partner_id, v_store_id,
    'https://img.dudit.com.br/' || p_file_key, p_file_key, p_file_name,
    p_file_type, p_file_size, p_uploaded_by, jsonb_build_object('fileHash', p_file_hash)
  ) RETURNING * INTO v_evidence;
  RETURN NEXT v_evidence;
END;
$$;
REVOKE ALL ON FUNCTION public.register_return_evidence_atomic(uuid, uuid, uuid, text, text, text, bigint, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_return_evidence_atomic(uuid, uuid, uuid, text, text, text, bigint, text, integer)
  TO service_role;

COMMIT;
