BEGIN;

-- The ERP invokes this SECURITY DEFINER RPC from the authenticated server
-- action using the service-role client. Direct authenticated execution bypasses
-- the finer financial and per-store permission checks in that action.
REVOKE ALL ON FUNCTION public.settle_installment_group(uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_installment_group(uuid, uuid, uuid, jsonb)
  TO service_role;

COMMIT;
