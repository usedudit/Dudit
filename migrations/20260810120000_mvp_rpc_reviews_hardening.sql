-- MVP launch hardening: mutable RPC context guards and safe review projection.
-- This migration deliberately keeps the existing RPC implementations private
-- and adds narrow, session-aware wrappers under their public names.

BEGIN;

CREATE OR REPLACE FUNCTION public.mvp_assert_rpc_context(
    p_partner_id uuid,
    p_actor_user_id uuid DEFAULT NULL,
    p_order_id uuid DEFAULT NULL,
    p_product_id uuid DEFAULT NULL,
    p_variant_id uuid DEFAULT NULL,
    p_store_id uuid DEFAULT NULL,
    p_customer_id uuid DEFAULT NULL,
    p_items jsonb DEFAULT NULL,
    p_allow_buyer boolean DEFAULT false,
    p_allow_platform_admin boolean DEFAULT false,
    p_required_roles text[] DEFAULT ARRAY['owner','admin','manager','operator']::text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_role text := auth.role();
    v_order_partner uuid;
    v_order_buyer uuid;
    v_order_store uuid;
    v_product_partner uuid;
    v_variant_product uuid;
    v_store_partner uuid;
    v_customer_partner uuid;
    v_item jsonb;
    v_item_product uuid;
    v_item_variant uuid;
BEGIN
    -- NULL auth.role() is reserved for trusted server-side database calls.
    -- PostgREST anon is explicitly rejected; service_role remains the
    -- server executor for checkout and background jobs.
    IF v_role IS NULL OR v_role IN ('service_role', 'supabase_admin') THEN
        RETURN;
    END IF;

    IF v_role <> 'authenticated' OR v_uid IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    IF p_actor_user_id IS NOT NULL AND p_actor_user_id IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'Actor does not match authenticated user' USING ERRCODE = '42501';
    END IF;

    IF p_partner_id IS NULL THEN
        RAISE EXCEPTION 'partner_id is required' USING ERRCODE = '22004';
    END IF;

    IF p_allow_platform_admin AND EXISTS (
        SELECT 1 FROM public.admin_roles ar
        WHERE ar.user_id = v_uid
          AND ar.role = ANY(ARRAY['moderator','admin','super_admin']::text[])
    ) THEN
        NULL;
    ELSIF p_allow_buyer AND p_order_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = p_order_id
          AND o.partner_id = p_partner_id
          AND o.buyer_id = v_uid
    ) THEN
        NULL;
    ELSIF NOT public.user_has_active_partner_role(p_partner_id, p_required_roles) THEN
        RAISE EXCEPTION 'Active partner membership required' USING ERRCODE = '42501';
    END IF;

    IF p_order_id IS NOT NULL THEN
        SELECT o.partner_id, o.buyer_id, o.store_id
          INTO v_order_partner, v_order_buyer, v_order_store
        FROM public.orders o
        WHERE o.id = p_order_id;
        IF NOT FOUND OR v_order_partner IS DISTINCT FROM p_partner_id THEN
            RAISE EXCEPTION 'Order is outside the partner context' USING ERRCODE = '42501';
        END IF;
        IF p_store_id IS NOT NULL AND v_order_store IS DISTINCT FROM p_store_id THEN
            RAISE EXCEPTION 'Order is outside the store context' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF p_store_id IS NOT NULL THEN
        SELECT s.partner_id INTO v_store_partner
        FROM public.stores s WHERE s.id = p_store_id;
        IF NOT FOUND OR v_store_partner IS DISTINCT FROM p_partner_id THEN
            RAISE EXCEPTION 'Store is outside the partner context' USING ERRCODE = '42501';
        END IF;
        IF v_role = 'authenticated'
           AND NOT (p_allow_buyer AND v_order_buyer = v_uid)
           AND NOT public.user_has_store_access(p_store_id) THEN
            RAISE EXCEPTION 'Store membership required' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF p_product_id IS NOT NULL THEN
        SELECT p.partner_id INTO v_product_partner
        FROM public.products p WHERE p.id = p_product_id;
        IF NOT FOUND OR v_product_partner IS DISTINCT FROM p_partner_id THEN
            RAISE EXCEPTION 'Product is outside the partner context' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF p_variant_id IS NOT NULL THEN
        SELECT pv.product_id INTO v_variant_product
        FROM public.product_variants pv
        WHERE pv.id = p_variant_id;
        IF NOT FOUND OR (p_product_id IS NOT NULL AND v_variant_product IS DISTINCT FROM p_product_id)
           OR NOT EXISTS (
               SELECT 1 FROM public.products p
               WHERE p.id = v_variant_product AND p.partner_id = p_partner_id
           ) THEN
            RAISE EXCEPTION 'Variant is outside the partner context' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF p_customer_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.id = p_customer_id AND c.partner_id = p_partner_id
    ) THEN
        RAISE EXCEPTION 'Customer is outside the partner context' USING ERRCODE = '42501';
    END IF;

    IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
        FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
            v_item_product := NULLIF(v_item->>'product_id', '')::uuid;
            v_item_variant := NULLIF(v_item->>'variant_id', '')::uuid;
            IF v_item_product IS NULL THEN CONTINUE; END IF;
            IF NOT EXISTS (
                SELECT 1 FROM public.products p
                WHERE p.id = v_item_product AND p.partner_id = p_partner_id
            ) THEN
                RAISE EXCEPTION 'Item product is outside the partner context' USING ERRCODE = '42501';
            END IF;
            IF v_item_variant IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM public.product_variants pv
                WHERE pv.id = v_item_variant AND pv.product_id = v_item_product
            ) THEN
                RAISE EXCEPTION 'Item variant is outside the product context' USING ERRCODE = '42501';
            END IF;
        END LOOP;
    END IF;
END;
$$;

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
        v_partner_id, NULL, NULL, NULL, NULL, v_store_id, NULL, NULL,
        false, false, ARRAY['owner','admin','manager','operator']::text[]
    );
END;
$$;

REVOKE ALL ON FUNCTION public.mvp_assert_rpc_context(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,boolean,boolean,text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mvp_assert_product_payload(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mvp_assert_rpc_context(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,boolean,boolean,text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mvp_assert_product_payload(jsonb) TO authenticated, service_role;

ALTER FUNCTION public.create_product_transaction(jsonb,jsonb,jsonb) RENAME TO __mvp_unsafe_create_product_transaction;
ALTER FUNCTION public.create_manual_stock_movement(uuid,uuid,text,integer,text,text,uuid,uuid) RENAME TO __mvp_unsafe_create_manual_stock_movement;
ALTER FUNCTION public.create_manual_stock_movement(uuid,uuid,text,integer,text,text,uuid,uuid,uuid) RENAME TO __mvp_unsafe_create_manual_stock_movement_store;
ALTER FUNCTION public.reserve_order_inventory(uuid,uuid,jsonb) RENAME TO __mvp_unsafe_reserve_order_inventory;
ALTER FUNCTION public.reserve_order_inventory(uuid,uuid,jsonb,uuid) RENAME TO __mvp_unsafe_reserve_order_inventory_store;
ALTER FUNCTION public.reserve_order_inventory(uuid,uuid,uuid) RENAME TO __mvp_unsafe_reserve_order_inventory_legacy;
ALTER FUNCTION public.release_order_inventory(uuid,uuid,jsonb) RENAME TO __mvp_unsafe_release_order_inventory;
ALTER FUNCTION public.release_order_inventory(uuid,uuid,jsonb,uuid) RENAME TO __mvp_unsafe_release_order_inventory_store;
ALTER FUNCTION public.release_order_inventory(uuid,uuid,uuid) RENAME TO __mvp_unsafe_release_order_inventory_legacy;
ALTER FUNCTION public.settle_installment_group(uuid,uuid,uuid,jsonb) RENAME TO __mvp_unsafe_settle_installment_group;
ALTER FUNCTION public.create_return_request(uuid,uuid,uuid,text,text,text,text,jsonb,jsonb,text,timestamptz,text,uuid,text) RENAME TO __mvp_unsafe_create_return_request;
ALTER FUNCTION public.create_return_request(uuid,uuid,uuid,jsonb,varchar,varchar,jsonb,text,varchar,varchar,text) RENAME TO __mvp_unsafe_create_return_request_legacy;
ALTER FUNCTION public.process_return_request(uuid,uuid,text,text,numeric,text,text,boolean,numeric,text,text) RENAME TO __mvp_unsafe_process_return_request;
ALTER FUNCTION public.process_return_request(uuid,uuid,text,text,numeric,text,text,boolean,numeric,jsonb,text,text,text) RENAME TO __mvp_unsafe_process_return_request_exchange;
ALTER FUNCTION public.process_return_request(uuid,uuid,varchar,text,numeric,varchar,varchar,numeric,boolean,jsonb,varchar,text) RENAME TO __mvp_unsafe_process_return_request_legacy;
ALTER FUNCTION public.create_quote_with_items(uuid,uuid,uuid,text,date,date,text,text,text,numeric,numeric,numeric,jsonb) RENAME TO __mvp_unsafe_create_quote_with_items;

CREATE OR REPLACE FUNCTION public.create_product_transaction(p_product jsonb, p_variants jsonb DEFAULT '[]'::jsonb, p_suppliers jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.mvp_assert_product_payload(p_product);
    RETURN public.__mvp_unsafe_create_product_transaction(p_product, p_variants, p_suppliers);
END; $$;

CREATE OR REPLACE FUNCTION public.create_manual_stock_movement(p_partner_id uuid, p_product_id uuid, p_movement_type text, p_quantity integer, p_reason text, p_notes text, p_created_by uuid DEFAULT NULL, p_variant_id uuid DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.mvp_assert_rpc_context(p_partner_id, p_created_by, NULL, p_product_id, p_variant_id, NULL, NULL, NULL, false, false, ARRAY['owner','admin','manager','operator']::text[]);
    IF p_quantity IS NULL OR p_quantity <= 0 OR p_movement_type NOT IN ('in','out') THEN RAISE EXCEPTION 'Invalid stock movement'; END IF;
    RETURN public.__mvp_unsafe_create_manual_stock_movement(p_partner_id, p_product_id, p_movement_type, p_quantity, p_reason, p_notes, p_created_by, p_variant_id);
END; $$;

CREATE OR REPLACE FUNCTION public.create_manual_stock_movement(p_partner_id uuid, p_product_id uuid, p_movement_type text, p_quantity integer, p_reason text, p_notes text, p_created_by uuid DEFAULT NULL, p_variant_id uuid DEFAULT NULL, p_store_id uuid DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.mvp_assert_rpc_context(p_partner_id, p_created_by, NULL, p_product_id, p_variant_id, p_store_id, NULL, NULL, false, false, ARRAY['owner','admin','manager','operator']::text[]);
    IF p_store_id IS NOT NULL THEN RAISE EXCEPTION 'Store-scoped stock movement is not available in MVP'; END IF;
    RETURN public.__mvp_unsafe_create_manual_stock_movement_store(p_partner_id, p_product_id, p_movement_type, p_quantity, p_reason, p_notes, p_created_by, p_variant_id, p_store_id);
END; $$;

CREATE OR REPLACE FUNCTION public.reserve_order_inventory(p_partner_id uuid, p_order_id uuid, p_items jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.mvp_assert_rpc_context(p_partner_id, NULL, p_order_id, NULL, NULL, NULL, NULL, p_items, true, false, ARRAY['owner','admin','manager','operator']::text[]);
    RETURN public.__mvp_unsafe_reserve_order_inventory(p_partner_id, p_order_id, p_items);
END; $$;

CREATE OR REPLACE FUNCTION public.reserve_order_inventory(p_partner_id uuid, p_order_id uuid, p_items jsonb DEFAULT '[]'::jsonb, p_store_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.mvp_assert_rpc_context(p_partner_id, NULL, p_order_id, NULL, NULL, p_store_id, NULL, p_items, true, false, ARRAY['owner','admin','manager','operator']::text[]);
    RETURN public.__mvp_unsafe_reserve_order_inventory_store(p_partner_id, p_order_id, p_items, p_store_id);
END; $$;

CREATE OR REPLACE FUNCTION public.reserve_order_inventory(p_partner_id uuid, p_order_id uuid, p_store_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.mvp_assert_rpc_context(p_partner_id, NULL, p_order_id, NULL, NULL, p_store_id, NULL, NULL, true, false, ARRAY['owner','admin','manager','operator']::text[]);
    PERFORM public.__mvp_unsafe_reserve_order_inventory_legacy(p_partner_id, p_order_id, p_store_id);
    RETURN;
END; $$;

CREATE OR REPLACE FUNCTION public.release_order_inventory(p_partner_id uuid, p_order_id uuid, p_items jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.mvp_assert_rpc_context(p_partner_id, NULL, p_order_id, NULL, NULL, NULL, NULL, p_items, true, false, ARRAY['owner','admin','manager','operator']::text[]);
    RETURN public.__mvp_unsafe_release_order_inventory(p_partner_id, p_order_id, p_items);
END; $$;

CREATE OR REPLACE FUNCTION public.release_order_inventory(p_partner_id uuid, p_order_id uuid, p_items jsonb DEFAULT '[]'::jsonb, p_store_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.mvp_assert_rpc_context(p_partner_id, NULL, p_order_id, NULL, NULL, p_store_id, NULL, p_items, true, false, ARRAY['owner','admin','manager','operator']::text[]);
    RETURN public.__mvp_unsafe_release_order_inventory_store(p_partner_id, p_order_id, p_items, p_store_id);
END; $$;

CREATE OR REPLACE FUNCTION public.release_order_inventory(p_partner_id uuid, p_order_id uuid, p_store_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.mvp_assert_rpc_context(p_partner_id, NULL, p_order_id, NULL, NULL, p_store_id, NULL, NULL, true, false, ARRAY['owner','admin','manager','operator']::text[]);
    PERFORM public.__mvp_unsafe_release_order_inventory_legacy(p_partner_id, p_order_id, p_store_id);
    RETURN;
END; $$;

CREATE OR REPLACE FUNCTION public.settle_installment_group(p_partner_id uuid, p_installment_group_id uuid, p_user_id uuid, p_custom_payments jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.mvp_assert_rpc_context(p_partner_id, p_user_id, NULL, NULL, NULL, NULL, NULL, NULL, false, false, ARRAY['owner','admin','manager','operator']::text[]);
    IF NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.installment_group_id = p_installment_group_id AND t.partner_id = p_partner_id) THEN RAISE EXCEPTION 'Installment group is outside the partner context' USING ERRCODE = '42501'; END IF;
    RETURN public.__mvp_unsafe_settle_installment_group(p_partner_id, p_installment_group_id, p_user_id, p_custom_payments);
END; $$;

CREATE OR REPLACE FUNCTION public.create_return_request(p_partner_id uuid, p_order_id uuid, p_created_by uuid, p_source text, p_resolution text, p_reason text, p_message text, p_items jsonb, p_evidence jsonb DEFAULT '[]'::jsonb, p_idempotency_key text DEFAULT NULL, p_expires_at timestamptz DEFAULT NULL, p_request_type text DEFAULT NULL, p_origin_request_id uuid DEFAULT NULL, p_origin_type text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.mvp_assert_rpc_context(p_partner_id, p_created_by, p_order_id, NULL, NULL, NULL, NULL, NULL, true, false, ARRAY['owner','admin','manager','operator']::text[]);
    RETURN public.__mvp_unsafe_create_return_request(p_partner_id, p_order_id, p_created_by, p_source, p_resolution, p_reason, p_message, p_items, p_evidence, p_idempotency_key, p_expires_at, p_request_type, p_origin_request_id, p_origin_type);
END; $$;

CREATE OR REPLACE FUNCTION public.create_return_request(p_partner_id uuid, p_order_id uuid, p_created_by uuid, p_items jsonb, p_resolution varchar DEFAULT 'refund', p_reason varchar DEFAULT 'outro', p_evidence jsonb DEFAULT '[]'::jsonb, p_customer_message text DEFAULT NULL, p_customer_phone varchar DEFAULT NULL, p_source varchar DEFAULT 'user', p_idempotency_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.mvp_assert_rpc_context(p_partner_id, p_created_by, p_order_id, NULL, NULL, NULL, NULL, NULL, true, false, ARRAY['owner','admin','manager','operator']::text[]);
    RETURN public.__mvp_unsafe_create_return_request_legacy(p_partner_id, p_order_id, p_created_by, p_items, p_resolution, p_reason, p_evidence, p_customer_message, p_customer_phone, p_source, p_idempotency_key);
END; $$;

CREATE OR REPLACE FUNCTION public.process_return_request(p_request_id uuid, p_actor_user_id uuid, p_action text, p_next_status text DEFAULT NULL, p_refund_amount numeric DEFAULT 0, p_refund_status text DEFAULT 'PENDING', p_refund_payment_method text DEFAULT NULL, p_return_to_inventory boolean DEFAULT false, p_store_credit_amount numeric DEFAULT 0, p_notes text DEFAULT NULL, p_idempotency_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_partner_id uuid; BEGIN
    SELECT rr.partner_id INTO v_partner_id FROM public.return_requests rr WHERE rr.id = p_request_id;
    IF v_partner_id IS NULL THEN RAISE EXCEPTION 'Return request not found' USING ERRCODE = '42501'; END IF;
    PERFORM public.mvp_assert_rpc_context(v_partner_id, p_actor_user_id, NULL, NULL, NULL, NULL, NULL, NULL, false, true, ARRAY['owner','admin','manager','operator']::text[]);
    RETURN public.__mvp_unsafe_process_return_request(p_request_id, p_actor_user_id, p_action, p_next_status, p_refund_amount, p_refund_status, p_refund_payment_method, p_return_to_inventory, p_store_credit_amount, p_notes, p_idempotency_key);
END; $$;

CREATE OR REPLACE FUNCTION public.process_return_request(p_request_id uuid, p_actor_user_id uuid, p_action text, p_next_status text, p_refund_amount numeric, p_refund_status text, p_refund_payment_method text, p_return_to_inventory boolean, p_store_credit_amount numeric, p_exchange_items jsonb, p_exchange_balance_resolution text, p_notes text, p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_partner_id uuid; BEGIN
    SELECT rr.partner_id INTO v_partner_id FROM public.return_requests rr WHERE rr.id = p_request_id;
    IF v_partner_id IS NULL THEN RAISE EXCEPTION 'Return request not found' USING ERRCODE = '42501'; END IF;
    PERFORM public.mvp_assert_rpc_context(v_partner_id, p_actor_user_id, NULL, NULL, NULL, NULL, NULL, NULL, false, true, ARRAY['owner','admin','manager','operator']::text[]);
    RETURN public.__mvp_unsafe_process_return_request_exchange(p_request_id, p_actor_user_id, p_action, p_next_status, p_refund_amount, p_refund_status, p_refund_payment_method, p_return_to_inventory, p_store_credit_amount, p_exchange_items, p_exchange_balance_resolution, p_notes, p_idempotency_key);
END; $$;

CREATE OR REPLACE FUNCTION public.process_return_request(p_request_id uuid, p_actor_user_id uuid, p_action varchar, p_notes text DEFAULT NULL, p_refund_amount numeric DEFAULT NULL, p_refund_status varchar DEFAULT NULL, p_refund_payment_method varchar DEFAULT NULL, p_store_credit_amount numeric DEFAULT NULL, p_return_to_inventory boolean DEFAULT true, p_exchange_items jsonb DEFAULT '[]'::jsonb, p_exchange_balance_resolution varchar DEFAULT NULL, p_idempotency_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_partner_id uuid; BEGIN
    SELECT rr.partner_id INTO v_partner_id FROM public.return_requests rr WHERE rr.id = p_request_id;
    IF v_partner_id IS NULL THEN RAISE EXCEPTION 'Return request not found' USING ERRCODE = '42501'; END IF;
    PERFORM public.mvp_assert_rpc_context(v_partner_id, p_actor_user_id, NULL, NULL, NULL, NULL, NULL, NULL, false, true, ARRAY['owner','admin','manager','operator']::text[]);
    RETURN public.__mvp_unsafe_process_return_request_legacy(p_request_id, p_actor_user_id, p_action, p_notes, p_refund_amount, p_refund_status, p_refund_payment_method, p_store_credit_amount, p_return_to_inventory, p_exchange_items, p_exchange_balance_resolution, p_idempotency_key);
END; $$;

CREATE OR REPLACE FUNCTION public.create_quote_with_items(p_partner_id uuid, p_user_id uuid, p_customer_id uuid, p_status text, p_issue_date date, p_expiration_date date, p_notes text, p_internal_notes text, p_discount_type text, p_discount_value numeric, p_shipping_cost numeric, p_additional_costs numeric, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.mvp_assert_rpc_context(p_partner_id, p_user_id, NULL, NULL, NULL, NULL, p_customer_id, p_items, false, false, ARRAY['owner','admin','manager','operator']::text[]);
    RETURN public.__mvp_unsafe_create_quote_with_items(p_partner_id, p_user_id, p_customer_id, p_status, p_issue_date, p_expiration_date, p_notes, p_internal_notes, p_discount_type, p_discount_value, p_shipping_cost, p_additional_costs, p_items);
END; $$;

-- Private implementations are callable only by the function owner or the
-- trusted server role. Public names below are the guarded API surface.
REVOKE ALL ON FUNCTION public.__mvp_unsafe_create_product_transaction(jsonb,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.__mvp_unsafe_create_manual_stock_movement(uuid,uuid,text,integer,text,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.__mvp_unsafe_create_manual_stock_movement_store(uuid,uuid,text,integer,text,text,uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.__mvp_unsafe_reserve_order_inventory(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.__mvp_unsafe_reserve_order_inventory_store(uuid,uuid,jsonb,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.__mvp_unsafe_reserve_order_inventory_legacy(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.__mvp_unsafe_release_order_inventory(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.__mvp_unsafe_release_order_inventory_store(uuid,uuid,jsonb,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.__mvp_unsafe_release_order_inventory_legacy(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.__mvp_unsafe_settle_installment_group(uuid,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.__mvp_unsafe_create_return_request(uuid,uuid,uuid,text,text,text,text,jsonb,jsonb,text,timestamptz,text,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.__mvp_unsafe_create_return_request_legacy(uuid,uuid,uuid,jsonb,varchar,varchar,jsonb,text,varchar,varchar,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.__mvp_unsafe_process_return_request(uuid,uuid,text,text,numeric,text,text,boolean,numeric,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.__mvp_unsafe_process_return_request_exchange(uuid,uuid,text,text,numeric,text,text,boolean,numeric,jsonb,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.__mvp_unsafe_process_return_request_legacy(uuid,uuid,varchar,text,numeric,varchar,varchar,numeric,boolean,jsonb,varchar,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.__mvp_unsafe_create_quote_with_items(uuid,uuid,uuid,text,date,date,text,text,text,numeric,numeric,numeric,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_product_transaction(jsonb,jsonb,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_manual_stock_movement(uuid,uuid,text,integer,text,text,uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_manual_stock_movement(uuid,uuid,text,integer,text,text,uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_order_inventory(uuid,uuid,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reserve_order_inventory(uuid,uuid,jsonb,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reserve_order_inventory(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_order_inventory(uuid,uuid,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_order_inventory(uuid,uuid,jsonb,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_order_inventory(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_installment_group(uuid,uuid,uuid,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_return_request(uuid,uuid,uuid,text,text,text,text,jsonb,jsonb,text,timestamptz,text,uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_return_request(uuid,uuid,uuid,jsonb,varchar,varchar,jsonb,text,varchar,varchar,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.process_return_request(uuid,uuid,text,text,numeric,text,text,boolean,numeric,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.process_return_request(uuid,uuid,text,text,numeric,text,text,boolean,numeric,jsonb,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.process_return_request(uuid,uuid,varchar,text,numeric,varchar,varchar,numeric,boolean,jsonb,varchar,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_quote_with_items(uuid,uuid,uuid,text,date,date,text,text,text,numeric,numeric,numeric,jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_product_transaction(jsonb,jsonb,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_manual_stock_movement(uuid,uuid,text,integer,text,text,uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_manual_stock_movement(uuid,uuid,text,integer,text,text,uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_order_inventory(uuid,uuid,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_order_inventory(uuid,uuid,jsonb,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_order_inventory(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_order_inventory(uuid,uuid,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_order_inventory(uuid,uuid,jsonb,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_order_inventory(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_installment_group(uuid,uuid,uuid,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_return_request(uuid,uuid,uuid,text,text,text,text,jsonb,jsonb,text,timestamptz,text,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_return_request(uuid,uuid,uuid,jsonb,varchar,varchar,jsonb,text,varchar,varchar,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_return_request(uuid,uuid,text,text,numeric,text,text,boolean,numeric,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_return_request(uuid,uuid,text,text,numeric,text,text,boolean,numeric,jsonb,text,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_return_request(uuid,uuid,varchar,text,numeric,varchar,varchar,numeric,boolean,jsonb,varchar,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_quote_with_items(uuid,uuid,uuid,text,date,date,text,text,text,numeric,numeric,numeric,jsonb) TO authenticated, service_role;

-- Expose only a review projection through the Data API. Server-side actions
-- continue to use their existing authenticated/admin execution paths.
DROP POLICY IF EXISTS reviews_select_all ON public.reviews;
REVOKE ALL ON TABLE public.reviews FROM anon;
REVOKE SELECT, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.reviews FROM authenticated;
DROP VIEW IF EXISTS public.reviews_public;
CREATE VIEW public.reviews_public
WITH (security_barrier = true)
AS
SELECT
    rating,
    comment,
    created_at,
    product_id,
    service_id,
    store_id
FROM public.reviews;
REVOKE ALL ON public.reviews_public FROM PUBLIC;
REVOKE ALL ON public.reviews_public FROM anon, authenticated;
GRANT SELECT ON public.reviews_public TO anon, authenticated;

COMMIT;
