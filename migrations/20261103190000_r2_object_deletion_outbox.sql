BEGIN;

-- Durable queue for managed R2 objects. Database triggers enqueue keys in the
-- same transaction as the row delete/update, including FK cascades.
CREATE TABLE IF NOT EXISTS public.r2_object_deletion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'skipped', 'dead')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ,
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_r2_object_deletion_jobs_pending
  ON public.r2_object_deletion_jobs (available_at, created_at)
  WHERE status IN ('pending', 'processing');

ALTER TABLE public.r2_object_deletion_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.r2_object_deletion_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.r2_object_deletion_jobs TO service_role;

-- New OS attachments must use the organized private key prefix. Keep the RPC
-- server-only and preserve its transactional parent lock and limit checks.
CREATE OR REPLACE FUNCTION public.register_service_order_attachment_atomic(
  p_partner_id UUID, p_service_order_id UUID, p_uploaded_by UUID,
  p_file_key TEXT, p_file_name TEXT, p_file_type TEXT,
  p_file_size BIGINT, p_file_hash TEXT, p_category TEXT, p_attachment_limit INTEGER
)
RETURNS SETOF public.service_order_attachments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_service_order public.service_orders%ROWTYPE;
  v_count INTEGER;
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
  IF p_file_key !~ ('^users/' || p_uploaded_by::text || '/(service-orders/attachments/[^/]+|service-orders[^/]+|serviceOrderAttachments[^/]+)$')
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
REVOKE ALL ON FUNCTION public.register_service_order_attachment_atomic(UUID, UUID, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_service_order_attachment_atomic(UUID, UUID, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, INTEGER)
  TO service_role;

-- Accept either a raw key or a previously stored public URL, then allow only
-- user-scoped private objects and published marketplace media.
CREATE OR REPLACE FUNCTION public.r2_managed_key_from_value(p_value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_key TEXT;
BEGIN
  IF p_value IS NULL OR length(p_value) > 4096 THEN
    RETURN NULL;
  END IF;

  IF p_value ~* '^https?://' AND p_value !~* '^https://(img\.dudit\.com\.br|dudit\.r2\.dev)/' THEN
    RETURN NULL;
  END IF;
  v_key := CASE
    WHEN p_value ~* '^https://' THEN regexp_replace(p_value, '^https://[^/]+/', '', 'i')
    ELSE p_value
  END;
  v_key := split_part(v_key, '?', 1);
  v_key := ltrim(v_key, '/');

  IF v_key ~ '(^|/)\.\.(/|$)' OR v_key ~ '[[:cntrl:]]' OR length(v_key) > 1024 THEN
    RETURN NULL;
  END IF;
  IF v_key !~ '^users/[0-9a-fA-F-]{36}/(erp/(attachments|contracts|invoices)/|customers/|suppliers/|orders/|billing-refunds/|service-orders/|service-orders[^/]*|serviceOrderAttachments|returns/|temp/|products/|services/|partners/|community-videos/)[^[:cntrl:]]+$' THEN
    RETURN NULL;
  END IF;
  RETURN v_key;
END;
$$;

REVOKE ALL ON FUNCTION public.r2_managed_key_from_value(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.r2_managed_key_from_value(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_r2_object_deletion(p_value TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_key TEXT := public.r2_managed_key_from_value(p_value);
BEGIN
  IF v_key IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.r2_object_deletion_jobs (object_key)
  VALUES (v_key)
  ON CONFLICT (object_key) DO UPDATE
    SET status = 'pending', attempt_count = 0, available_at = now(),
        locked_until = NULL, last_error_code = NULL, completed_at = NULL,
        updated_at = now()
    WHERE public.r2_object_deletion_jobs.status IN ('completed', 'skipped', 'dead');
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_r2_object_deletion(TEXT) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.capture_r2_object_key_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_old JSONB;
  v_new JSONB;
  v_old_value TEXT;
  v_new_value TEXT;
  v_item JSONB;
  v_key TEXT;
  v_column TEXT := TG_ARGV[0];
  v_json_array BOOLEAN := COALESCE(TG_ARGV[1], 'false') = 'true';
BEGIN
  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;

  IF v_json_array THEN
    IF v_old IS NOT NULL THEN
      FOR v_item IN
        SELECT value FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(v_old->v_column) = 'array' THEN v_old->v_column ELSE '[]'::jsonb END
        )
      LOOP
        v_old_value := CASE
          WHEN jsonb_typeof(v_item) = 'string' THEN v_item #>> '{}'
          ELSE COALESCE(v_item->>'key', v_item->>'file_key', v_item->>'url')
        END;
        v_key := public.r2_managed_key_from_value(v_old_value);
        IF v_key IS NOT NULL AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(v_new->v_column) = 'array' THEN v_new->v_column ELSE '[]'::jsonb END
          ) new_item
          WHERE public.r2_managed_key_from_value(
            CASE
              WHEN jsonb_typeof(new_item.value) = 'string' THEN new_item.value #>> '{}'
              ELSE COALESCE(new_item.value->>'key', new_item.value->>'file_key', new_item.value->>'url')
            END
          ) = v_key
        ) THEN
          PERFORM public.enqueue_r2_object_deletion(v_key);
        END IF;
      END LOOP;
    END IF;
  ELSE
    v_old_value := CASE WHEN v_old IS NULL THEN NULL ELSE v_old->>v_column END;
    v_new_value := CASE WHEN v_new IS NULL THEN NULL ELSE v_new->>v_column END;
    IF v_old_value IS NOT NULL
       AND public.r2_managed_key_from_value(v_old_value)
           IS DISTINCT FROM public.r2_managed_key_from_value(v_new_value) THEN
      PERFORM public.enqueue_r2_object_deletion(v_old_value);
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_r2_object_key_change() FROM PUBLIC, anon, authenticated, service_role;

-- The guard is checked immediately before claiming a job; shared objects are
-- retained and marked skipped until their last reference is removed.
CREATE OR REPLACE FUNCTION public.r2_managed_object_is_referenced(p_key TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.order_attachments a WHERE a.file_key = p_key)
    OR EXISTS (SELECT 1 FROM public.service_order_attachments a WHERE a.file_key = p_key)
    OR EXISTS (SELECT 1 FROM public.stock_movement_attachments a WHERE a.file_key = p_key)
    OR EXISTS (SELECT 1 FROM public.transaction_attachments a WHERE a.file_key = p_key)
    OR EXISTS (
      SELECT 1 FROM public.return_evidence e
      WHERE e.file_key = p_key OR public.r2_managed_key_from_value(e.file_url) = p_key
    )
    OR EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.signature_image_key = p_key
    )
    OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE public.r2_managed_key_from_value(c.image_url) = p_key
    )
    OR EXISTS (
      SELECT 1 FROM public.suppliers s
      WHERE public.r2_managed_key_from_value(s.image_url) = p_key
    )
    OR EXISTS (
      SELECT 1
      FROM public.products p
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(p.images) = 'array' THEN p.images ELSE '[]'::jsonb END
      ) item
      WHERE public.r2_managed_key_from_value(
        CASE WHEN jsonb_typeof(item.value) = 'string' THEN item.value #>> '{}'
             ELSE COALESCE(item.value->>'key', item.value->>'file_key', item.value->>'url') END
      ) = p_key
    )
    OR EXISTS (
      SELECT 1
      FROM public.services s
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(s.images) = 'array' THEN s.images ELSE '[]'::jsonb END
      ) item
      WHERE public.r2_managed_key_from_value(
        CASE WHEN jsonb_typeof(item.value) = 'string' THEN item.value #>> '{}'
             ELSE COALESCE(item.value->>'key', item.value->>'file_key', item.value->>'url') END
      ) = p_key
    )
    OR EXISTS (
      SELECT 1 FROM public.stores st
      WHERE public.r2_managed_key_from_value(st.logo_url) = p_key
         OR public.r2_managed_key_from_value(st.banner_url) = p_key
    )
    OR EXISTS (
      SELECT 1 FROM public.community_videos cv
      WHERE public.r2_managed_key_from_value(cv.video_url) = p_key
         OR public.r2_managed_key_from_value(cv.video_thumbnail) = p_key
         OR public.r2_managed_key_from_value(cv.video_signed_url) = p_key
         OR public.r2_managed_key_from_value(cv.thumbnail_signed_url) = p_key
    )
    OR EXISTS (
      SELECT 1
      FROM public.billing_refund_requests r
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(r.images) = 'array' THEN r.images ELSE '[]'::jsonb END
      ) item
      WHERE public.r2_managed_key_from_value(
        CASE WHEN jsonb_typeof(item.value) = 'string' THEN item.value #>> '{}'
             ELSE COALESCE(item.value->>'key', item.value->>'file_key', item.value->>'url') END
      ) = p_key
    )
    OR EXISTS (
      SELECT 1
      FROM public.billing_refund_requests r
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(r.documents) = 'array' THEN r.documents ELSE '[]'::jsonb END
      ) item
      WHERE public.r2_managed_key_from_value(
        CASE WHEN jsonb_typeof(item.value) = 'string' THEN item.value #>> '{}'
             ELSE COALESCE(item.value->>'key', item.value->>'file_key', item.value->>'url') END
      ) = p_key
    )
    OR EXISTS (
      SELECT 1
      FROM public.billing_refund_requests r
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(r.admin_evidence) = 'array' THEN r.admin_evidence ELSE '[]'::jsonb END
      ) item
      WHERE public.r2_managed_key_from_value(
        CASE WHEN jsonb_typeof(item.value) = 'string' THEN item.value #>> '{}'
             ELSE COALESCE(item.value->>'key', item.value->>'file_key', item.value->>'url') END
      ) = p_key
    );
$$;

REVOKE ALL ON FUNCTION public.r2_managed_object_is_referenced(TEXT) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.classify_r2_reconciliation_keys(p_keys TEXT[])
RETURNS TABLE (object_key TEXT, is_referenced BOOLEAN)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT DISTINCT managed.key,
         public.r2_managed_object_is_referenced(managed.key)
  FROM unnest(COALESCE(p_keys, ARRAY[]::TEXT[])) AS supplied(key)
  CROSS JOIN LATERAL (
    SELECT public.r2_managed_key_from_value(supplied.key) AS key
  ) managed
  WHERE managed.key IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.classify_r2_reconciliation_keys(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.classify_r2_reconciliation_keys(TEXT[]) TO service_role;

CREATE OR REPLACE FUNCTION public.list_r2_referenced_managed_keys(
  p_after_key TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 500
)
RETURNS TABLE (object_key TEXT)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH raw_values(value) AS (
    SELECT a.file_key FROM public.order_attachments a
    UNION ALL SELECT a.file_key FROM public.service_order_attachments a
    UNION ALL SELECT a.file_key FROM public.stock_movement_attachments a
    UNION ALL SELECT a.file_key FROM public.transaction_attachments a
    UNION ALL SELECT e.file_key FROM public.return_evidence e
    UNION ALL SELECT e.file_url FROM public.return_evidence e
    UNION ALL SELECT so.signature_image_key FROM public.service_orders so
    UNION ALL SELECT c.image_url FROM public.customers c
    UNION ALL SELECT s.image_url FROM public.suppliers s
    UNION ALL SELECT st.logo_url FROM public.stores st
    UNION ALL SELECT st.banner_url FROM public.stores st
    UNION ALL SELECT cv.video_url FROM public.community_videos cv
    UNION ALL SELECT cv.video_thumbnail FROM public.community_videos cv
    UNION ALL SELECT cv.video_signed_url FROM public.community_videos cv
    UNION ALL SELECT cv.thumbnail_signed_url FROM public.community_videos cv
    UNION ALL
      SELECT CASE WHEN jsonb_typeof(item.value) = 'string' THEN item.value #>> '{}'
                  ELSE COALESCE(item.value->>'key', item.value->>'file_key', item.value->>'url') END
      FROM public.products p
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.images) = 'array' THEN p.images ELSE '[]'::jsonb END) item
    UNION ALL
      SELECT CASE WHEN jsonb_typeof(item.value) = 'string' THEN item.value #>> '{}'
                  ELSE COALESCE(item.value->>'key', item.value->>'file_key', item.value->>'url') END
      FROM public.services s
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.images) = 'array' THEN s.images ELSE '[]'::jsonb END) item
    UNION ALL
      SELECT CASE WHEN jsonb_typeof(item.value) = 'string' THEN item.value #>> '{}'
                  ELSE COALESCE(item.value->>'key', item.value->>'file_key', item.value->>'url') END
      FROM public.billing_refund_requests r
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(r.images) = 'array' THEN r.images ELSE '[]'::jsonb END) item
    UNION ALL
      SELECT CASE WHEN jsonb_typeof(item.value) = 'string' THEN item.value #>> '{}'
                  ELSE COALESCE(item.value->>'key', item.value->>'file_key', item.value->>'url') END
      FROM public.billing_refund_requests r
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(r.documents) = 'array' THEN r.documents ELSE '[]'::jsonb END) item
    UNION ALL
      SELECT CASE WHEN jsonb_typeof(item.value) = 'string' THEN item.value #>> '{}'
                  ELSE COALESCE(item.value->>'key', item.value->>'file_key', item.value->>'url') END
      FROM public.billing_refund_requests r
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(r.admin_evidence) = 'array' THEN r.admin_evidence ELSE '[]'::jsonb END) item
  ), managed AS (
    SELECT DISTINCT public.r2_managed_key_from_value(value) AS key FROM raw_values
  )
  SELECT managed.key
  FROM managed
  WHERE managed.key IS NOT NULL AND managed.key > COALESCE(p_after_key, '')
  ORDER BY managed.key
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 500), 1), 500);
$$;

REVOKE ALL ON FUNCTION public.list_r2_referenced_managed_keys(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_r2_referenced_managed_keys(TEXT, INTEGER) TO service_role;

-- Enqueue old references on deletion, cascades, and replacement.
DO $$
DECLARE
  v_table TEXT;
  v_column TEXT;
  v_json BOOLEAN;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'order_attachments', 'service_order_attachments',
    'stock_movement_attachments', 'transaction_attachments'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS queue_r2_cleanup ON public.%I', v_table);
    EXECUTE format(
      'CREATE TRIGGER queue_r2_cleanup AFTER UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.capture_r2_object_key_change(%L, %L)',
      v_table, 'file_key', 'false'
    );
  END LOOP;

  EXECUTE 'DROP TRIGGER IF EXISTS queue_r2_cleanup_file_key ON public.return_evidence';
  CREATE TRIGGER queue_r2_cleanup_file_key AFTER UPDATE OR DELETE ON public.return_evidence
    FOR EACH ROW EXECUTE FUNCTION public.capture_r2_object_key_change('file_key', 'false');
  EXECUTE 'DROP TRIGGER IF EXISTS queue_r2_cleanup_file_url ON public.return_evidence';
  CREATE TRIGGER queue_r2_cleanup_file_url AFTER UPDATE OR DELETE ON public.return_evidence
    FOR EACH ROW EXECUTE FUNCTION public.capture_r2_object_key_change('file_url', 'false');

  EXECUTE 'DROP TRIGGER IF EXISTS queue_r2_cleanup_signature ON public.service_orders';
  CREATE TRIGGER queue_r2_cleanup_signature AFTER UPDATE OR DELETE ON public.service_orders
    FOR EACH ROW EXECUTE FUNCTION public.capture_r2_object_key_change('signature_image_key', 'false');

  EXECUTE 'DROP TRIGGER IF EXISTS queue_r2_cleanup_image ON public.customers';
  CREATE TRIGGER queue_r2_cleanup_image AFTER UPDATE OR DELETE ON public.customers
    FOR EACH ROW EXECUTE FUNCTION public.capture_r2_object_key_change('image_url', 'false');
  EXECUTE 'DROP TRIGGER IF EXISTS queue_r2_cleanup_image ON public.suppliers';
  CREATE TRIGGER queue_r2_cleanup_image AFTER UPDATE OR DELETE ON public.suppliers
    FOR EACH ROW EXECUTE FUNCTION public.capture_r2_object_key_change('image_url', 'false');

  FOREACH v_table IN ARRAY ARRAY['products', 'services'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS queue_r2_cleanup_images ON public.%I', v_table);
    EXECUTE format(
      'CREATE TRIGGER queue_r2_cleanup_images AFTER UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.capture_r2_object_key_change(%L, %L)',
      v_table, 'images', 'true'
    );
  END LOOP;

  FOREACH v_column IN ARRAY ARRAY['logo_url', 'banner_url'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS queue_r2_cleanup_%I ON public.stores', v_column);
    EXECUTE format(
      'CREATE TRIGGER queue_r2_cleanup_%I AFTER UPDATE OR DELETE ON public.stores '
      'FOR EACH ROW EXECUTE FUNCTION public.capture_r2_object_key_change(%L, %L)',
      v_column, v_column, 'false'
    );
  END LOOP;

  FOREACH v_column IN ARRAY ARRAY['video_url', 'video_thumbnail', 'video_signed_url', 'thumbnail_signed_url'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS queue_r2_cleanup_%I ON public.community_videos', v_column);
    EXECUTE format(
      'CREATE TRIGGER queue_r2_cleanup_%I AFTER UPDATE OR DELETE ON public.community_videos '
      'FOR EACH ROW EXECUTE FUNCTION public.capture_r2_object_key_change(%L, %L)',
      v_column, v_column, 'false'
    );
  END LOOP;

  FOREACH v_column IN ARRAY ARRAY['images', 'documents', 'admin_evidence'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS queue_r2_cleanup_%I ON public.billing_refund_requests', v_column);
    EXECUTE format(
      'CREATE TRIGGER queue_r2_cleanup_%I AFTER UPDATE OR DELETE ON public.billing_refund_requests '
      'FOR EACH ROW EXECUTE FUNCTION public.capture_r2_object_key_change(%L, %L)',
      v_column, v_column, 'true'
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_r2_object_deletion_jobs(
  p_limit INTEGER DEFAULT 100,
  p_lease_seconds INTEGER DEFAULT 300
)
RETURNS TABLE (id UUID, object_key TEXT, attempt_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  UPDATE public.r2_object_deletion_jobs j
  SET status = 'skipped', last_error_code = 'object_still_referenced',
      locked_until = NULL, completed_at = now(), updated_at = now()
  WHERE j.status = 'pending'
    AND public.r2_managed_object_is_referenced(j.object_key);

  RETURN QUERY
  WITH candidates AS (
    SELECT j.id
    FROM public.r2_object_deletion_jobs j
    WHERE (
      (j.status = 'pending' AND j.available_at <= now())
      OR (j.status = 'processing' AND j.locked_until <= now())
    )
      AND NOT public.r2_managed_object_is_referenced(j.object_key)
    ORDER BY j.created_at, j.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 100)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.r2_object_deletion_jobs j
  SET status = 'processing', attempt_count = j.attempt_count + 1,
      locked_until = now() + make_interval(secs => LEAST(GREATEST(COALESCE(p_lease_seconds, 300), 30), 1800)),
      updated_at = now()
  FROM candidates c
  WHERE j.id = c.id
  RETURNING j.id, j.object_key, j.attempt_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_r2_object_deletion_job(p_job_id UUID)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  UPDATE public.r2_object_deletion_jobs
  SET status = 'completed', locked_until = NULL, last_error_code = NULL,
      completed_at = now(), updated_at = now()
  WHERE id = p_job_id AND status = 'processing';
$$;

CREATE OR REPLACE FUNCTION public.fail_r2_object_deletion_job(p_job_id UUID, p_error_code TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_error_code IS NULL OR p_error_code !~ '^[a-z0-9_]{1,80}$' THEN
    RAISE EXCEPTION 'Invalid cleanup error code' USING ERRCODE = '22023';
  END IF;

  UPDATE public.r2_object_deletion_jobs
  SET status = CASE WHEN attempt_count >= 12 THEN 'dead' ELSE 'pending' END,
      available_at = now() + make_interval(secs => LEAST(21600, 30 * (2 ^ LEAST(attempt_count, 10))::INTEGER)),
      locked_until = NULL, last_error_code = p_error_code, updated_at = now()
  WHERE id = p_job_id AND status = 'processing';
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_completed_r2_object_deletion_jobs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.r2_object_deletion_jobs
  WHERE status IN ('completed', 'skipped')
    AND completed_at IS NOT NULL
    AND completed_at < now() - INTERVAL '30 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_r2_object_deletion_jobs(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_r2_object_deletion_job(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_r2_object_deletion_job(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_r2_object_deletion_jobs(INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_r2_object_deletion_job(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_r2_object_deletion_job(UUID, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.purge_completed_r2_object_deletion_jobs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_completed_r2_object_deletion_jobs() TO service_role;

COMMENT ON TABLE public.r2_object_deletion_jobs IS
  'Transactional outbox for retryable deletion of unreferenced managed R2 objects.';

-- Supabase pg_cron calls the authenticated Next.js worker through pg_net.
-- Store secrets in Supabase Vault as dudit_app_url and dudit_r2_cleanup_cron_secret.
DO $$
DECLARE
  v_net_schema TEXT;
  v_worker_command TEXT;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'pg_cron is unavailable; R2 cleanup queue is installed but unscheduled.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-r2-cleanup-history') THEN
    PERFORM cron.unschedule('purge-r2-cleanup-history');
  END IF;
  PERFORM cron.schedule(
    'purge-r2-cleanup-history',
    '30 4 * * *',
    $cmd$SELECT public.purge_completed_r2_object_deletion_jobs()$cmd$
  );

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
     OR to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE NOTICE 'pg_net or Supabase Vault is unavailable; add the cron schedule after enabling both.';
    RETURN;
  END IF;
  -- The extension's extnamespace is not necessarily the namespace where its
  -- API functions are installed. Resolve the schema from the extension-owned
  -- http_post function itself (for example, pg_net may be registered in
  -- `extensions` while exposing its API under `net`).
  SELECT n.nspname INTO v_net_schema
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_depend d
    ON d.classid = 'pg_proc'::regclass
   AND d.objid = p.oid
   AND d.refclassid = 'pg_extension'::regclass
   AND d.refobjid = (SELECT oid FROM pg_extension WHERE extname = 'pg_net')
   AND d.deptype = 'e'
  WHERE p.proname = 'http_post'
    AND p.pronargs = 5
    AND p.prorettype = 'bigint'::regtype
    AND p.proargnames[1:5] = ARRAY['url', 'body', 'params', 'headers', 'timeout_milliseconds']::TEXT[]
  ORDER BY n.nspname
  LIMIT 1;
  IF v_net_schema IS NULL THEN
    RAISE NOTICE 'pg_net http_post function could not be located; add the worker cron job after resolving the extension installation.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-r2-object-cleanup') THEN
    PERFORM cron.unschedule('process-r2-object-cleanup');
  END IF;

  v_worker_command := format($worker$
      SELECT %I.http_post(
        url := rtrim((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'dudit_app_url'), '/')
          || '/api/internal/jobs/process-r2-cleanup',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'dudit_r2_cleanup_cron_secret'),
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object('source', 'pg_cron'),
        timeout_milliseconds := 60000
      )
      WHERE EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'dudit_app_url' AND decrypted_secret <> '')
        AND EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'dudit_r2_cleanup_cron_secret' AND decrypted_secret <> '')
    $worker$, v_net_schema);

  PERFORM cron.schedule(
    'process-r2-object-cleanup',
    '* * * * *',
    v_worker_command
  );

END;
$$;

COMMIT;
