BEGIN;

-- Return processing is exposed through server actions that enforce
-- orders.can_refund and store-level authorization. The SECURITY DEFINER RPCs
-- are called with a service-role client by ERP and moderation actions; direct
-- authenticated execution would bypass those application permission checks.
-- Function overloads changed over time, and deployed databases can have a
-- different subset of those signatures. Resolve existing functions through
-- pg_proc so this migration never references a stale overload.
DO $$
DECLARE
  v_function RECORD;
  v_found_create_return_request BOOLEAN := FALSE;
  v_found_process_return_request BOOLEAN := FALSE;
  v_signature TEXT;
BEGIN
  FOR v_function IN
    SELECT n.nspname, p.proname, p.proargtypes AS arg_types
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname IN ('create_return_request', 'process_return_request')
  LOOP
    v_signature := format(
      '%I.%I(%s)',
      v_function.nspname,
      v_function.proname,
      pg_catalog.oidvectortypes(v_function.arg_types)
    );

    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      v_signature
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO service_role',
      v_signature
    );

    IF v_function.proname = 'create_return_request' THEN
      v_found_create_return_request := TRUE;
    ELSE
      v_found_process_return_request := TRUE;
    END IF;
  END LOOP;

  IF NOT v_found_create_return_request THEN
    RAISE EXCEPTION 'public.create_return_request was not found';
  END IF;
  IF NOT v_found_process_return_request THEN
    RAISE EXCEPTION 'public.process_return_request was not found';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
