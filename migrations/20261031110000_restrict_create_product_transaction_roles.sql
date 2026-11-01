BEGIN;

-- The RPC is used by the authenticated product-creation action. Keep its
-- existing EXECUTE grant and tenant/store checks, but align the role gate with
-- the standard product RBAC preset: OPERATOR has products.view only and must
-- not create products through direct PostgREST RPC calls.
CREATE OR REPLACE FUNCTION public.mvp_assert_product_payload(p_product jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_partner_id uuid := NULLIF(p_product->>'partner_id', '')::uuid;
  v_store_id uuid := NULLIF(p_product->>'store_id', '')::uuid;
BEGIN
  PERFORM public.mvp_assert_rpc_context(
    v_partner_id,
    NULL,
    NULL,
    NULL,
    NULL,
    v_store_id,
    NULL,
    NULL,
    false,
    false,
    ARRAY['owner','admin','manager']::text[]
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mvp_assert_product_payload(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mvp_assert_product_payload(jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
