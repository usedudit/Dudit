-- MVP security hardening
--
-- Scope is intentionally narrow: identity-sensitive RPCs, public exposure of
-- operational data, active membership checks, and DDL-like grants on the
-- operational tables below. Do not generalize these revokes to Storage or to
-- every public relation without a separate consumer audit.

BEGIN;

-- ---------------------------------------------------------------------------
-- Common authorization helper for RLS and SECURITY DEFINER functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_has_active_partner_role(
    p_partner_id uuid,
    p_roles text[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.partners p
        WHERE p.id = p_partner_id
          AND p.user_id = auth.uid()
          AND COALESCE(p.is_active, true)
          AND COALESCE(p.erp_disabled, false) = false
          AND (p_roles IS NULL OR 'owner' = ANY(p_roles))
    )
    OR EXISTS (
        SELECT 1
        FROM public.partner_users pu
        JOIN public.partners p ON p.id = pu.partner_id
        WHERE pu.partner_id = p_partner_id
          AND pu.user_id = auth.uid()
          AND pu.is_active = true
          AND COALESCE(p.is_active, true)
          AND COALESCE(p.erp_disabled, false) = false
          AND (p_roles IS NULL OR lower(COALESCE(pu.role_id, pu.role)) = ANY(p_roles))
    );
$$;

REVOKE ALL ON FUNCTION public.user_has_active_partner_role(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_active_partner_role(uuid, text[]) TO authenticated, service_role;

-- The helper remains available to RLS policies, but now requires an active
-- partner and active store membership. It is not a public data source.
CREATE OR REPLACE FUNCTION public.user_has_store_access(p_store_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.stores s
        JOIN public.partners p ON p.id = s.partner_id
        WHERE s.id = p_store_id
          AND COALESCE(p.is_active, true)
          AND COALESCE(p.erp_disabled, false) = false
          AND (
              p.user_id = auth.uid()
              OR EXISTS (
                  SELECT 1
                  FROM public.store_members sm
                  JOIN public.partner_users pu ON pu.id = sm.partner_user_id
                  WHERE sm.store_id = s.id
                    AND pu.user_id = auth.uid()
                    AND pu.is_active = true
                    AND pu.partner_id = s.partner_id
              )
          )
    );
$$;

CREATE OR REPLACE FUNCTION public.user_has_partner_access(p_partner_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.partners p
        WHERE p.id = p_partner_id
          AND p.user_id = p_user_id
          AND COALESCE(p.is_active, true)
          AND COALESCE(p.erp_disabled, false) = false
    )
    OR EXISTS (
        SELECT 1
        FROM public.partner_users pu
        JOIN public.partners p ON p.id = pu.partner_id
        WHERE pu.partner_id = p_partner_id
          AND pu.user_id = p_user_id
          AND pu.is_active = true
          AND COALESCE(p.is_active, true)
          AND COALESCE(p.erp_disabled, false) = false
    );
$$;

REVOKE ALL ON FUNCTION public.user_has_partner_access(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_partner_access(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Public Data API: no raw operational service or fraud data
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins can view fraud checks" ON public.fraud_checks;
DROP POLICY IF EXISTS fraud_checks_select_own ON public.fraud_checks;
REVOKE ALL ON TABLE public.fraud_checks FROM anon, authenticated;
GRANT INSERT ON TABLE public.fraud_checks TO authenticated;

DROP POLICY IF EXISTS services_select_all ON public.services;
DROP POLICY IF EXISTS services_select_policy ON public.services;
DROP POLICY IF EXISTS admin_select_services ON public.services;
DROP POLICY IF EXISTS services_insert_own ON public.services;
DROP POLICY IF EXISTS services_insert_policy ON public.services;
DROP POLICY IF EXISTS services_update_own ON public.services;
DROP POLICY IF EXISTS services_update_policy ON public.services;
DROP POLICY IF EXISTS services_delete_own ON public.services;
DROP POLICY IF EXISTS services_delete_policy ON public.services;

REVOKE ALL ON TABLE public.services FROM anon;

ALTER POLICY admin_update_services ON public.services TO authenticated;

CREATE POLICY services_select_partner ON public.services
    FOR SELECT TO authenticated
    USING (public.user_has_active_partner_role(
        partner_id,
        ARRAY['owner', 'admin', 'manager', 'operator', 'delivery']::text[]
    ));

CREATE POLICY admin_select_services ON public.services
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.admin_roles ar
        WHERE ar.user_id = auth.uid()
          AND ar.role = ANY(ARRAY['moderator', 'admin', 'super_admin']::text[])
    ));

CREATE POLICY services_insert_partner ON public.services
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_active_partner_role(
        partner_id,
        ARRAY['owner', 'admin', 'manager']::text[]
    ));

CREATE POLICY services_update_partner ON public.services
    FOR UPDATE TO authenticated
    USING (public.user_has_active_partner_role(
        partner_id,
        ARRAY['owner', 'admin', 'manager']::text[]
    ))
    WITH CHECK (public.user_has_active_partner_role(
        partner_id,
        ARRAY['owner', 'admin', 'manager']::text[]
    ));

CREATE POLICY services_delete_partner ON public.services
    FOR DELETE TO authenticated
    USING (public.user_has_active_partner_role(
        partner_id,
        ARRAY['owner', 'admin']::text[]
    ));

-- ---------------------------------------------------------------------------
-- RLS cutover for core partner-owned tables
-- ---------------------------------------------------------------------------

-- Products: the public marketplace uses the already-created safe projection;
-- the operational table remains partner-scoped.
DROP POLICY IF EXISTS "Partner owners can delete products" ON public.products;
DROP POLICY IF EXISTS "Partner owners can update products" ON public.products;
DROP POLICY IF EXISTS admin_select_products ON public.products;
DROP POLICY IF EXISTS admin_update_products ON public.products;
DROP POLICY IF EXISTS products_delete_own ON public.products;
DROP POLICY IF EXISTS products_delete_policy ON public.products;
DROP POLICY IF EXISTS products_insert_authenticated ON public.products;
DROP POLICY IF EXISTS products_insert_policy ON public.products;
DROP POLICY IF EXISTS products_select_own ON public.products;
DROP POLICY IF EXISTS products_select_policy ON public.products;
DROP POLICY IF EXISTS products_update_own ON public.products;
DROP POLICY IF EXISTS products_update_policy ON public.products;

CREATE POLICY products_select_partner ON public.products
    FOR SELECT TO authenticated
    USING (public.user_has_active_partner_role(
        partner_id,
        ARRAY['owner', 'admin', 'manager', 'operator', 'delivery']::text[]
    ));

CREATE POLICY admin_select_products ON public.products
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.admin_roles ar
        WHERE ar.user_id = auth.uid()
          AND ar.role = ANY(ARRAY['moderator', 'admin', 'super_admin']::text[])
    ));

CREATE POLICY products_insert_partner ON public.products
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_active_partner_role(
        partner_id,
        ARRAY['owner', 'admin', 'manager']::text[]
    ));

CREATE POLICY products_update_partner ON public.products
    FOR UPDATE TO authenticated
    USING (public.user_has_active_partner_role(
        partner_id,
        ARRAY['owner', 'admin', 'manager']::text[]
    ))
    WITH CHECK (public.user_has_active_partner_role(
        partner_id,
        ARRAY['owner', 'admin', 'manager']::text[]
    ));

CREATE POLICY products_delete_partner ON public.products
    FOR DELETE TO authenticated
    USING (public.user_has_active_partner_role(
        partner_id,
        ARRAY['owner', 'admin']::text[]
    ));

-- Orders: preserve buyer access for authenticated marketplace users and keep
-- seller access active-partner scoped. Server-side checkout continues to use
-- the canonical PostgreSQL validations and service_role only as executor.
DROP POLICY IF EXISTS "Buyer and seller can view orders" ON public.orders;
DROP POLICY IF EXISTS "Seller can update order status" ON public.orders;
DROP POLICY IF EXISTS orders_delete_buyer_pending ON public.orders;
DROP POLICY IF EXISTS orders_delete_policy ON public.orders;
DROP POLICY IF EXISTS orders_insert_buyer ON public.orders;
DROP POLICY IF EXISTS orders_insert_policy ON public.orders;
DROP POLICY IF EXISTS orders_select_buyer ON public.orders;
DROP POLICY IF EXISTS orders_select_partner ON public.orders;
DROP POLICY IF EXISTS orders_select_policy ON public.orders;
DROP POLICY IF EXISTS orders_update_partner ON public.orders;
DROP POLICY IF EXISTS orders_update_policy ON public.orders;

CREATE POLICY orders_select_buyer ON public.orders
    FOR SELECT TO authenticated USING (buyer_id = auth.uid());

CREATE POLICY orders_select_partner ON public.orders
    FOR SELECT TO authenticated
    USING (
        public.user_has_active_partner_role(
            partner_id,
            ARRAY['owner', 'admin', 'manager', 'operator', 'delivery']::text[]
        )
        AND (store_id IS NULL OR public.user_has_store_access(store_id))
    );

CREATE POLICY orders_insert_buyer ON public.orders
    FOR INSERT TO authenticated WITH CHECK (buyer_id = auth.uid());

CREATE POLICY orders_insert_partner ON public.orders
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_active_partner_role(
        partner_id,
        ARRAY['owner', 'admin', 'manager', 'operator']::text[]
    ));

CREATE POLICY orders_update_buyer ON public.orders
    FOR UPDATE TO authenticated
    USING (buyer_id = auth.uid())
    WITH CHECK (buyer_id = auth.uid());

CREATE POLICY orders_update_partner ON public.orders
    FOR UPDATE TO authenticated
    USING (public.user_has_active_partner_role(
        partner_id,
        ARRAY['owner', 'admin', 'manager', 'operator']::text[]
    ))
    WITH CHECK (public.user_has_active_partner_role(
        partner_id,
        ARRAY['owner', 'admin', 'manager', 'operator']::text[]
    ));

CREATE POLICY orders_delete_buyer_pending ON public.orders
    FOR DELETE TO authenticated
    USING (buyer_id = auth.uid() AND situation = 'pending');

CREATE POLICY orders_delete_partner ON public.orders
    FOR DELETE TO authenticated
    USING (public.user_has_active_partner_role(
        partner_id,
        ARRAY['owner', 'admin']::text[]
    ));

-- Appointments: partner membership and the partner itself must be active for
-- every direct RLS-bound operation. The store helper adds store isolation.
DROP POLICY IF EXISTS appointments_delete_partner ON public.appointments;
DROP POLICY IF EXISTS appointments_insert_partner ON public.appointments;
DROP POLICY IF EXISTS appointments_select_partner ON public.appointments;
DROP POLICY IF EXISTS appointments_update_partner ON public.appointments;

CREATE POLICY appointments_select_partner ON public.appointments
    FOR SELECT TO authenticated
    USING (
        public.user_has_active_partner_role(
            partner_id,
            ARRAY['owner', 'admin', 'manager', 'operator', 'delivery']::text[]
        )
        AND (store_id IS NULL OR public.user_has_store_access(store_id))
    );

CREATE POLICY appointments_insert_partner ON public.appointments
    FOR INSERT TO authenticated
    WITH CHECK (
        public.user_has_active_partner_role(
            partner_id,
            ARRAY['owner', 'admin', 'manager', 'operator']::text[]
        )
        AND (store_id IS NULL OR public.user_has_store_access(store_id))
    );

CREATE POLICY appointments_update_partner ON public.appointments
    FOR UPDATE TO authenticated
    USING (
        public.user_has_active_partner_role(
            partner_id,
            ARRAY['owner', 'admin', 'manager', 'operator']::text[]
        )
        AND (store_id IS NULL OR public.user_has_store_access(store_id))
    )
    WITH CHECK (
        public.user_has_active_partner_role(
            partner_id,
            ARRAY['owner', 'admin', 'manager', 'operator']::text[]
        )
        AND (store_id IS NULL OR public.user_has_store_access(store_id))
    );

CREATE POLICY appointments_delete_partner ON public.appointments
    FOR DELETE TO authenticated
    USING (
        public.user_has_active_partner_role(
            partner_id,
            ARRAY['owner', 'admin', 'manager', 'operator']::text[]
        )
        AND (store_id IS NULL OR public.user_has_store_access(store_id))
    );

-- Financial transactions remain owner-only for direct RLS access, but inactive
-- partners are now excluded. Existing server actions remain compatible.
DROP POLICY IF EXISTS transactions_delete_own ON public.transactions;
DROP POLICY IF EXISTS transactions_insert_own ON public.transactions;
DROP POLICY IF EXISTS transactions_select_own ON public.transactions;
DROP POLICY IF EXISTS transactions_update_own ON public.transactions;

CREATE POLICY transactions_select_owner ON public.transactions
    FOR SELECT TO authenticated
    USING (
        public.user_has_active_partner_role(partner_id, ARRAY['owner']::text[])
        AND (store_id IS NULL OR public.user_has_store_access(store_id))
    );

CREATE POLICY transactions_insert_owner ON public.transactions
    FOR INSERT TO authenticated
    WITH CHECK (
        public.user_has_active_partner_role(partner_id, ARRAY['owner']::text[])
        AND (store_id IS NULL OR public.user_has_store_access(store_id))
    );

CREATE POLICY transactions_update_owner ON public.transactions
    FOR UPDATE TO authenticated
    USING (
        public.user_has_active_partner_role(partner_id, ARRAY['owner']::text[])
        AND (store_id IS NULL OR public.user_has_store_access(store_id))
    )
    WITH CHECK (
        public.user_has_active_partner_role(partner_id, ARRAY['owner']::text[])
        AND (store_id IS NULL OR public.user_has_store_access(store_id))
    );

CREATE POLICY transactions_delete_owner ON public.transactions
    FOR DELETE TO authenticated
    USING (
        public.user_has_active_partner_role(partner_id, ARRAY['owner']::text[])
        AND (store_id IS NULL OR public.user_has_store_access(store_id))
    );

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_account_balance_delta(
    p_account_id uuid,
    p_partner_id uuid,
    p_delta numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_current numeric;
    v_new numeric;
    -- SECURITY DEFINER changes current_user to the function owner. Trust only
    -- the verified JWT role, or a database-internal call without JWT claims.
    v_trusted_executor boolean := COALESCE(auth.role(), '') IN ('service_role', '');
BEGIN
    IF p_delta IS NULL OR p_delta = 0 OR p_account_id IS NULL OR p_partner_id IS NULL THEN
        RETURN NULL;
    END IF;

    IF NOT v_trusted_executor
       AND NOT public.user_has_active_partner_role(p_partner_id, NULL) THEN
        RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
    END IF;

    SELECT fa.current_balance
      INTO v_current
      FROM public.finance_accounts fa
     WHERE fa.id = p_account_id
       AND fa.partner_id = p_partner_id
       AND EXISTS (
           SELECT 1 FROM public.partners p
           WHERE p.id = fa.partner_id
             AND COALESCE(p.is_active, true)
             AND COALESCE(p.erp_disabled, false) = false
       )
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    v_new := ROUND(COALESCE(v_current, 0) + p_delta, 2);

    UPDATE public.finance_accounts
       SET current_balance = v_new, updated_at = NOW()
     WHERE id = p_account_id AND partner_id = p_partner_id;

    RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_store_stock(
    p_from_store_product_id uuid,
    p_to_store_product_id uuid,
    p_quantity integer,
    p_partner_id uuid,
    p_created_by uuid DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_trusted_executor boolean := COALESCE(auth.role(), '') IN ('service_role', '');
BEGIN
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Quantidade inválida');
    END IF;

    IF p_partner_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Parceiro inválido');
    END IF;

    IF NOT v_trusted_executor THEN
        IF auth.uid() IS NULL OR p_created_by IS DISTINCT FROM auth.uid()
           OR NOT public.user_has_active_partner_role(p_partner_id, NULL) THEN
            RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
        END IF;
    END IF;
    -- The direct-store migration removed store_products. Keep this legacy
    -- signature callable only by an authorized context, but fail closed until
    -- a canonical direct-store transfer contract is introduced. This avoids a
    -- dangling SECURITY DEFINER function referencing a dropped table.
    IF p_from_store_product_id IS NULL OR p_to_store_product_id IS NULL
       OR p_partner_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Parâmetros inválidos');
    END IF;

    RETURN jsonb_build_object(
        'success', false,
        'error', 'Transferência entre lojas indisponível após a simplificação do estoque'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_partner_invitation(
    p_invitation_id uuid,
    p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_invitation record;
    v_inviter_active boolean;
    v_partner_active boolean;
    v_valid_roles text[] := ARRAY['OWNER','ADMIN','MANAGER','OPERATOR','DELIVERY','VIEWER'];
    v_role_id text;
    v_partner_user_id uuid;
    v_has_store_ids boolean;
    v_trusted_executor boolean := COALESCE(auth.role(), '') IN ('service_role', '');
BEGIN
    IF NOT v_trusted_executor
       AND (auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid()) THEN
        RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_invitation
      FROM public.partner_invitations
     WHERE id = p_invitation_id
     FOR UPDATE;

    IF v_invitation IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Convite não encontrado.');
    END IF;

    SELECT COALESCE(p.is_active, true) AND COALESCE(p.erp_disabled, false) = false
      INTO v_partner_active
      FROM public.partners p
     WHERE p.id = v_invitation.partner_id;

    IF NOT COALESCE(v_partner_active, false) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Parceiro inativo.');
    END IF;

    IF v_invitation.locked_at IS NOT NULL OR v_invitation.used_at IS NOT NULL
       OR v_invitation.revoked_at IS NOT NULL OR v_invitation.expires_at < now() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Convite inválido ou expirado.');
    END IF;

    IF NOT (UPPER(COALESCE(v_invitation.role, '')) = ANY(v_valid_roles)) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cargo inválido no convite.');
    END IF;

    SELECT EXISTS (
        SELECT 1
          FROM public.partner_users pu
          JOIN public.partners p ON p.id = pu.partner_id
         WHERE pu.partner_id = v_invitation.partner_id
           AND pu.user_id = v_invitation.created_by_user_id
           AND pu.is_active = true
           AND COALESCE(p.is_active, true)
           AND COALESCE(p.erp_disabled, false) = false
    ) OR EXISTS (
        SELECT 1
          FROM public.partners p
         WHERE p.id = v_invitation.partner_id
           AND p.user_id = v_invitation.created_by_user_id
           AND COALESCE(p.is_active, true)
           AND COALESCE(p.erp_disabled, false) = false
    ) INTO v_inviter_active;

    IF NOT v_inviter_active THEN
        RETURN jsonb_build_object('success', false, 'error', 'O membro que enviou este convite não faz mais parte da equipe.');
    END IF;

    v_role_id := CASE
        WHEN btrim(COALESCE(v_invitation.role_id, '')) <> '' THEN lower(btrim(v_invitation.role_id))
        ELSE CASE UPPER(COALESCE(v_invitation.role, ''))
            WHEN 'OWNER' THEN 'owner'
            WHEN 'ADMIN' THEN 'admin'
            WHEN 'MANAGER' THEN 'manager'
            WHEN 'OPERATOR' THEN 'operator'
            WHEN 'DELIVERY' THEN 'delivery'
            WHEN 'EDITOR' THEN 'operator'
            WHEN 'VIEWER' THEN 'delivery'
            ELSE 'delivery'
        END
    END;

    IF v_role_id NOT IN ('owner', 'admin', 'manager', 'operator', 'delivery') THEN
        v_role_id := 'delivery';
    END IF;

    UPDATE public.partner_invitations
       SET used_at = now(), used_by = p_user_id
     WHERE id = p_invitation_id;

    INSERT INTO public.partner_users (
        partner_id, user_id, role, role_id, permissions, created_by_user_id
    ) VALUES (
        v_invitation.partner_id, p_user_id, v_invitation.role, v_role_id,
        v_invitation.permissions, v_invitation.created_by_user_id
    ) ON CONFLICT (partner_id, user_id) DO UPDATE
       SET role = EXCLUDED.role, role_id = EXCLUDED.role_id,
           is_active = true;

    SELECT id INTO v_partner_user_id
      FROM public.partner_users
     WHERE partner_id = v_invitation.partner_id AND user_id = p_user_id;

    IF v_partner_user_id IS NOT NULL THEN
        v_has_store_ids := jsonb_typeof(
            COALESCE(v_invitation.permissions, '{}'::jsonb) -> '_store_ids_'
        ) = 'array';

        IF v_has_store_ids THEN
            INSERT INTO public.store_members (partner_user_id, store_id, role, permissions)
            SELECT v_partner_user_id, t.store_id, v_invitation.role, v_invitation.permissions
              FROM (
                  SELECT (jsonb_array_elements_text(
                      COALESCE(v_invitation.permissions, '{}'::jsonb) -> '_store_ids_'
                  ))::uuid AS store_id
              ) t
              JOIN public.stores s ON s.id = t.store_id
             WHERE s.partner_id = v_invitation.partner_id
            ON CONFLICT (partner_user_id, store_id) DO NOTHING;
        ELSE
            INSERT INTO public.store_members (partner_user_id, store_id, role, permissions)
            SELECT v_partner_user_id, s.id, v_invitation.role, v_invitation.permissions
              FROM public.stores s
             WHERE s.partner_id = v_invitation.partner_id
            ON CONFLICT (partner_user_id, store_id) DO NOTHING;
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'partner_id', v_invitation.partner_id);
END;
$$;

-- The recurring advancement is a database/cron operation, not a client RPC.
-- Keep the trusted executor path and remove public execution.
REVOKE ALL ON FUNCTION public.advance_recurring_subscription(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_recurring_subscription(uuid, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.apply_account_balance_delta(uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_account_balance_delta(uuid, uuid, numeric) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.transfer_store_stock(uuid, uuid, integer, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_store_stock(uuid, uuid, integer, uuid, uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.accept_partner_invitation(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_partner_invitation(uuid, uuid) TO authenticated, service_role;

-- This RPC already validates auth.uid() internally; revoke its accidental anon
-- exposure while preserving authenticated ERP clients and trusted server jobs.
REVOKE ALL ON FUNCTION public.update_product_transaction(uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_product_transaction(uuid, jsonb, jsonb, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Controlled DDL-like grant reduction
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    relation_name text;
BEGIN
    FOREACH relation_name IN ARRAY ARRAY[
        'fraud_checks', 'services', 'products', 'orders', 'appointments',
        'transactions', 'customers', 'customers_operator_safe',
        'customers_delivery_safe'
    ] LOOP
        EXECUTE format(
            'REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM anon, authenticated',
            relation_name
        );
    END LOOP;
END;
$$;

COMMIT;
