-- Public approval actions validate the customer token, identity, or code in
-- server actions before calling these SECURITY DEFINER RPCs with service_role.
-- Direct PostgREST access would bypass those checks (including p_method).
REVOKE ALL ON FUNCTION public.approve_public_quote(uuid, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_public_quote(uuid, text, text, text, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.reject_public_quote(uuid, text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_public_quote(uuid, text, text, text, text, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.sign_public_service_order(uuid, text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sign_public_service_order(uuid, text, text, text, text, text, text)
  TO service_role;

-- These helpers support authenticated RLS policies; anonymous callers do not
-- need them. The user-context helpers also bind their results to auth.uid().
REVOKE ALL ON FUNCTION public.get_address_partner_id(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_address_partner_id(uuid, uuid, uuid, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_user_full_context()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_full_context()
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_user_partner_ids()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_partner_ids()
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.user_has_store_access(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_store_access(uuid)
  TO authenticated, service_role;

-- Internal queue/financial/consent mutations have no direct client caller.
REVOKE ALL ON FUNCTION public.claim_whatsapp_messages(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_messages(integer) TO service_role;

REVOKE ALL ON FUNCTION public.claim_whatsapp_scheduled_jobs(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_scheduled_jobs(integer) TO service_role;

REVOKE ALL ON FUNCTION public.increment_invite_failed_attempts(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_invite_failed_attempts(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.recalc_service_order_totals(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_service_order_totals(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.mark_recurring_plan_price_change(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_recurring_plan_price_change(uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.apply_recurring_plan_change(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_recurring_plan_change(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.seed_default_financial_categories(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_default_financial_categories(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.billing_generate_invoice_for_purchase(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_generate_invoice_for_purchase(uuid) TO service_role;

-- Trigger functions run through their attached triggers and are not RPC APIs.
-- Remove their otherwise-default public EXECUTE grants without changing triggers.
DO $revoke_trigger_function_exec$
DECLARE
  v_function record;
BEGIN
  FOR v_function IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      v_function.signature
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO service_role',
      v_function.signature
    );
  END LOOP;
END;
$revoke_trigger_function_exec$;

NOTIFY pgrst, 'reload schema';
