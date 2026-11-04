BEGIN;

-- 1. Unique index for quote attachment file keys, matching other attachment tables.
CREATE UNIQUE INDEX IF NOT EXISTS quote_attachments_file_key_uidx
  ON public.quote_attachments (file_key);

-- 2. Update r2_managed_key_from_value to recognize quotes attachments path:
-- users/{uuid}/quotes/...
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
  IF v_key !~ '^users/[0-9a-fA-F-]{36}/(erp/(attachments|contracts|invoices)/|customers/|suppliers/|orders/|quotes/|billing-refunds/|service-orders/|service-orders[^/]*|serviceOrderAttachments|returns/|temp/|products/|services/|partners/|community-videos/)[^[:cntrl:]]+$' THEN
    RETURN NULL;
  END IF;
  RETURN v_key;
END;
$$;

REVOKE ALL ON FUNCTION public.r2_managed_key_from_value(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.r2_managed_key_from_value(TEXT) TO service_role;

-- 3. Update assert_attachment_file_key_unused to include quote_attachments.
CREATE OR REPLACE FUNCTION public.assert_attachment_file_key_unused(p_file_key TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
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
     OR EXISTS (SELECT 1 FROM public.return_evidence WHERE file_key = p_file_key)
     OR EXISTS (SELECT 1 FROM public.quote_attachments WHERE file_key = p_file_key) THEN
    RAISE EXCEPTION 'Attachment file key has already been registered' USING ERRCODE = '23505';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_attachment_file_key_unused(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_attachment_file_key_unused(TEXT) TO service_role;

-- 4. Update r2_managed_object_is_referenced to include quote_attachments.
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
    OR EXISTS (SELECT 1 FROM public.quote_attachments qa WHERE qa.file_key = p_key)
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

-- 5. Update list_r2_referenced_managed_keys to include quote_attachments.
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
    UNION ALL SELECT qa.file_key FROM public.quote_attachments qa
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

-- 6. Attach trigger to quote_attachments so that deletions and cascades enqueue keys into outbox.
DROP TRIGGER IF EXISTS queue_r2_cleanup ON public.quote_attachments;
CREATE TRIGGER queue_r2_cleanup
  AFTER DELETE OR UPDATE OF file_key ON public.quote_attachments
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_r2_object_key_change();

COMMIT;

