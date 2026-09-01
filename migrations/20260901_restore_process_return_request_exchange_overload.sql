-- Restore the 13-param exchange overload of process_return_request
-- Dropped by 20260813 but still called by the ERP server action with
-- p_exchange_items + p_exchange_balance_resolution parameters.
BEGIN;

CREATE OR REPLACE FUNCTION public.process_return_request(
    p_request_id uuid,
    p_actor_user_id uuid,
    p_action text,
    p_next_status text,
    p_refund_amount numeric,
    p_refund_status text,
    p_refund_payment_method text,
    p_return_to_inventory boolean,
    p_store_credit_amount numeric,
    p_exchange_items jsonb,
    p_exchange_balance_resolution text,
    p_notes text,
    p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_partner_id uuid;
BEGIN
    SELECT rr.partner_id INTO v_partner_id
    FROM public.return_requests rr
    WHERE rr.id = p_request_id;
    IF v_partner_id IS NULL THEN
        RAISE EXCEPTION 'Return request not found' USING ERRCODE = '42501';
    END IF;
    PERFORM public.mvp_assert_rpc_context(
        v_partner_id,
        p_actor_user_id,
        NULL, NULL, NULL, NULL, NULL, NULL,
        false, true,
        ARRAY['owner','admin','manager','operator']::text[]
    );
    RETURN public.__mvp_unsafe_process_return_request_exchange(
        p_request_id,
        p_actor_user_id,
        p_action,
        p_next_status,
        p_refund_amount,
        p_refund_status,
        p_refund_payment_method,
        p_return_to_inventory,
        p_store_credit_amount,
        p_exchange_items,
        p_exchange_balance_resolution,
        p_notes,
        p_idempotency_key
    );
END;
$$;

REVOKE ALL ON FUNCTION public.process_return_request(uuid,uuid,text,text,numeric,text,text,boolean,numeric,jsonb,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_return_request(uuid,uuid,text,text,numeric,text,text,boolean,numeric,jsonb,text,text,text) TO authenticated, service_role;

COMMIT;
