BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS order_attachments_file_key_uidx
  ON public.order_attachments(file_key);

CREATE OR REPLACE FUNCTION public.register_order_attachment_atomic(
  p_partner_id uuid,
  p_order_id uuid,
  p_uploaded_by uuid,
  p_file_key text,
  p_file_name text,
  p_file_type text,
  p_file_size bigint,
  p_file_hash text,
  p_attachment_limit integer
)
RETURNS SETOF public.order_attachments
LANGUAGE plpgsql
SECURITY DEFINER
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
     OR length(p_file_name) > 255
     OR length(p_file_type) > 127
     OR (p_file_type NOT LIKE 'image/%' AND p_file_type LIKE 'video/%') THEN
    RAISE EXCEPTION 'Order attachment key or metadata is invalid' USING ERRCODE = '22023';
  END IF;

  SELECT o.* INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id AND o.partner_id = p_partner_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found for this partner' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.order_attachments a
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
  )
  RETURNING * INTO v_attachment;

  RETURN NEXT v_attachment;
END;
$$;

REVOKE ALL ON FUNCTION public.register_order_attachment_atomic(
  uuid, uuid, uuid, text, text, text, bigint, text, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_order_attachment_atomic(
  uuid, uuid, uuid, text, text, text, bigint, text, integer
) TO service_role;

COMMIT;
