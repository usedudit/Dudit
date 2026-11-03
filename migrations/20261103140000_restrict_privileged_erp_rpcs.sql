BEGIN;

-- The legacy updater checks only that the supplied JWT user is a member of
-- the product's partner. Put it behind a service-only wrapper that binds the
-- already-authorized server action's actor to the transaction-local JWT claim
-- before invoking it.
CREATE OR REPLACE FUNCTION public.update_product_transaction_server(
  p_actor_user_id uuid,
  p_product_id uuid,
  p_product_data jsonb,
  p_fiscal_data jsonb,
  p_logistics_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_partner_id uuid;
  v_store_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT p.partner_id, p.store_id
  INTO v_partner_id, v_store_id
  FROM public.products p
  WHERE p.id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  IF NOT public.user_has_active_partner_role(
    v_partner_id,
    ARRAY['owner', 'admin', 'manager']::text[]
  ) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF v_store_id IS NOT NULL AND NOT public.user_has_store_access(v_store_id) THEN
    RAISE EXCEPTION 'not authorized for this store' USING ERRCODE = '42501';
  END IF;

  RETURN public.update_product_transaction(
    p_product_id,
    p_product_data,
    p_fiscal_data,
    p_logistics_data
  );
END;
$$;
REVOKE ALL ON FUNCTION public.update_product_transaction_server(uuid, uuid, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_product_transaction_server(uuid, uuid, jsonb, jsonb, jsonb)
  TO service_role;
REVOKE ALL ON FUNCTION public.update_product_transaction(uuid, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_product_transaction(uuid, jsonb, jsonb, jsonb)
  TO service_role;

-- These SECURITY DEFINER RPCs are invoked only by authorized server actions
-- or by another SECURITY DEFINER function. Direct authenticated RPC calls
-- could spoof the actor UUID or bypass application-level store permissions.
REVOKE ALL ON FUNCTION public.execute_xml_import(uuid, uuid, uuid, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.execute_xml_import(uuid, uuid, uuid, jsonb, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revert_xml_import(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revert_xml_import(uuid, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_exchange_order(uuid, uuid, uuid, uuid, jsonb, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_return_to_dudit(uuid, uuid, text, text, boolean, text, text, text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.execute_xml_import(uuid, uuid, uuid, jsonb, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.execute_xml_import(uuid, uuid, uuid, jsonb, jsonb, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.revert_xml_import(uuid, text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.revert_xml_import(uuid, text, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.create_exchange_order(uuid, uuid, uuid, uuid, jsonb, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.report_return_to_dudit(uuid, uuid, text, text, boolean, text, text, text, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
