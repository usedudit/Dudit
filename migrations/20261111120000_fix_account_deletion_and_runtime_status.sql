-- Fix account deletion DB execution, protective triggers during deletion,
-- and runtime status check so failed deletions do not lock out or half-delete accounts.

BEGIN;

-- 1. Fix get_secure_runtime_status so 'failed' deletions do not lock out the user
CREATE OR REPLACE FUNCTION public.get_secure_runtime_status(
    p_partner_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_banned_at timestamptz;
    v_banned_until timestamptz;
    v_user_deletion boolean := false;
    v_partner_access boolean := false;
    v_partner_deletion boolean := false;
    v_partner_status jsonb := NULL;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'is_banned', false,
            'ban_expired', false,
            'user_deletion', false,
            'partner_access', false,
            'partner_deletion', false,
            'partner_status', NULL
        );
    END IF;

    SELECT up.banned_at, up.banned_until
      INTO v_banned_at, v_banned_until
      FROM public.user_profiles AS up
     WHERE up.user_id = v_user_id;

    v_user_deletion := EXISTS (
        SELECT 1
          FROM public.account_deletions AS ad
         WHERE ad.user_id = v_user_id
           AND ad.status NOT IN ('completed', 'failed')
    );

    IF p_partner_id IS NOT NULL THEN
        v_partner_access := EXISTS (
            SELECT 1
              FROM public.partners AS p
             WHERE p.id = p_partner_id
               AND (
                   p.user_id = v_user_id
                   OR EXISTS (
                       SELECT 1
                         FROM public.partner_users AS pu
                        WHERE pu.partner_id = p_partner_id
                          AND pu.user_id = v_user_id
                   )
               )
        );

        IF v_partner_access THEN
            SELECT jsonb_build_object(
                       'is_active', p.is_active,
                       'erp_disabled', p.erp_disabled
                   )
              INTO v_partner_status
              FROM public.partners AS p
             WHERE p.id = p_partner_id;

            v_partner_deletion := EXISTS (
                SELECT 1
                  FROM public.account_deletions AS ad
                 WHERE ad.partner_id = p_partner_id
                   AND ad.status NOT IN ('completed', 'failed')
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'is_banned', v_banned_at IS NOT NULL
            AND (v_banned_until IS NULL OR v_banned_until > now()),
        'ban_expired', v_banned_at IS NOT NULL
            AND v_banned_until IS NOT NULL
            AND v_banned_until <= now(),
        'user_deletion', v_user_deletion,
        'partner_access', v_partner_access,
        'partner_deletion', v_partner_deletion,
        'partner_status', v_partner_status
    );
END;
$$;

-- 2. Allow delivery_assignments.driver_id to be set to NULL when a delivery_driver is deleted
ALTER TABLE public.delivery_assignments
  DROP CONSTRAINT IF EXISTS delivery_assignments_driver_id_fkey;

ALTER TABLE public.delivery_assignments
  ADD CONSTRAINT delivery_assignments_driver_id_fkey
  FOREIGN KEY (driver_id) REFERENCES public.delivery_drivers(user_id) ON DELETE SET NULL;

-- 3. Update validate_delivery_assignment_tenant to allow deletion bypass & non-driver updates
CREATE OR REPLACE FUNCTION public.validate_delivery_assignment_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  order_partner uuid;
  delivery_partner uuid;
BEGIN
  IF current_setting('dudit.bypass_payment_method_guard', true) = 'true' THEN
    RETURN NEW;
  END IF;

  SELECT o.partner_id INTO order_partner
  FROM public.orders o
  WHERE o.id = NEW.order_id;

  IF order_partner IS NULL OR order_partner <> NEW.partner_id THEN
    RAISE EXCEPTION 'delivery_assignment_partner_mismatch';
  END IF;

  IF NEW.delivery_id IS NOT NULL THEN
    SELECT d.partner_id INTO delivery_partner
    FROM public.deliveries d
    WHERE d.id = NEW.delivery_id;

    IF delivery_partner IS NULL OR delivery_partner <> NEW.partner_id THEN
      RAISE EXCEPTION 'delivery_assignment_delivery_mismatch';
    END IF;
  END IF;

  -- Only check driver active status when assigning or changing a non-null driver_id
  IF (TG_OP = 'INSERT' OR NEW.driver_id IS DISTINCT FROM OLD.driver_id)
     AND NEW.driver_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.delivery_drivers dd
       WHERE dd.user_id = NEW.driver_id AND dd.is_active = true
     ) THEN
    RAISE EXCEPTION 'delivery_driver_inactive';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.order_id <> OLD.order_id OR
    NEW.partner_id <> OLD.partner_id OR
    (OLD.driver_id IS NOT NULL AND NEW.driver_id IS NOT NULL AND NEW.driver_id <> OLD.driver_id)
  ) THEN
    RAISE EXCEPTION 'delivery_assignment_ownership_immutable';
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Update quote triggers & audit_trigger_func to respect deletion bypass
CREATE OR REPLACE FUNCTION public.prevent_item_change_on_finalized_quote()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  quote_status TEXT;
  target_quote_id UUID;
BEGIN
  IF current_setting('dudit.bypass_payment_method_guard', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  target_quote_id := COALESCE(NEW.quote_id, OLD.quote_id);

  SELECT status INTO quote_status
  FROM public.quotes WHERE id = target_quote_id;

  IF quote_status IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF quote_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Itens do orçamento só podem ser alterados em status Rascunho. Status atual: %', quote_status;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.lock_finalized_quote()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('dudit.bypass_payment_method_guard', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.partner_id IS DISTINCT FROM OLD.partner_id
     OR NEW.quote_number IS DISTINCT FROM OLD.quote_number
     OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Campos imutáveis do orçamento não podem ser alterados';
  END IF;

  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
       OR NEW.expiration_date IS DISTINCT FROM OLD.expiration_date
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.discount_type IS DISTINCT FROM OLD.discount_type
       OR NEW.discount_value IS DISTINCT FROM OLD.discount_value
       OR NEW.shipping_cost IS DISTINCT FROM OLD.shipping_cost
       OR NEW.additional_costs IS DISTINCT FROM OLD.additional_costs
       OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
    THEN
      RAISE EXCEPTION 'Altere apenas o status nesta operação, sem mudar outros dados do orçamento.';
    END IF;

    IF OLD.status = 'sent' AND NEW.status NOT IN ('pending_client', 'viewed', 'approved', 'rejected', 'draft', 'cancelled', 'expired') THEN
      RAISE EXCEPTION 'Transição de status inválida para orçamento enviado';
    END IF;

    IF OLD.status = 'pending_client' AND NEW.status NOT IN ('viewed', 'approved', 'rejected', 'draft', 'cancelled', 'expired') THEN
      RAISE EXCEPTION 'Transição de status inválida para orçamento pendente';
    END IF;

    IF OLD.status = 'viewed' AND NEW.status NOT IN ('approved', 'rejected', 'draft', 'cancelled', 'expired') THEN
      RAISE EXCEPTION 'Transição de status inválida para orçamento visualizado';
    END IF;

    IF OLD.status = 'approved' AND NEW.status NOT IN ('expired', 'cancelled', 'converted_to_order') THEN
      RAISE EXCEPTION 'Orçamento aprovado só pode ser marcado como expirado, cancelado ou convertido em pedido';
    END IF;

    IF OLD.status = 'rejected' AND NEW.status NOT IN ('draft') THEN
      RAISE EXCEPTION 'Orçamento rejeitado só pode ser reaberto como rascunho';
    END IF;

    IF OLD.status = 'expired' AND NEW.status NOT IN ('draft') THEN
      RAISE EXCEPTION 'Orçamento expirado só pode ser reaberto como rascunho';
    END IF;

    IF OLD.status = 'cancelled' AND NEW.status NOT IN ('draft') THEN
      RAISE EXCEPTION 'Orçamento cancelado só pode ser reaberto como rascunho';
    END IF;

    IF OLD.status = 'converted_to_order' THEN
      RAISE EXCEPTION 'Orçamento convertido em pedido não pode ter seu status alterado';
    END IF;

    RETURN NEW;
  END IF;

  IF OLD.status IN ('pending_client', 'viewed', 'sent') THEN
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
       OR NEW.discount_type IS DISTINCT FROM OLD.discount_type
       OR NEW.discount_value IS DISTINCT FROM OLD.discount_value
       OR NEW.shipping_cost IS DISTINCT FROM OLD.shipping_cost
       OR NEW.additional_costs IS DISTINCT FROM OLD.additional_costs
       OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
    THEN
      RAISE EXCEPTION 'Orçamento enviado/pendente: não é permitido alterar dados financeiros ou comerciais. Reabra como rascunho.';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('approved', 'rejected', 'expired', 'cancelled', 'converted_to_order') THEN
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
       OR NEW.expiration_date IS DISTINCT FROM OLD.expiration_date
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.discount_type IS DISTINCT FROM OLD.discount_type
       OR NEW.discount_value IS DISTINCT FROM OLD.discount_value
       OR NEW.shipping_cost IS DISTINCT FROM OLD.shipping_cost
       OR NEW.additional_costs IS DISTINCT FROM OLD.additional_costs
       OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
    THEN
      RAISE EXCEPTION 'Orçamento finalizado: alterações de dados comerciais ou financeiros não são permitidas.';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_diff jsonb := '{}'::jsonb;
  v_new_diff jsonb := '{}'::jsonb;
  v_key text;
  v_old_val jsonb;
  v_new_val jsonb;
  v_old_json jsonb;
  v_new_json jsonb;
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_actor_email text;
  v_partner_name text;
  v_store_name text;
  v_partner_id uuid;
  v_store_id uuid;
BEGIN
  IF current_setting('dudit.bypass_payment_method_guard', true) = 'true' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  IF v_actor_id IS NOT NULL THEN
    SELECT
      COALESCE(NULLIF(trim(up.full_name), ''), 'Usuário'),
      au.email
    INTO v_actor_name, v_actor_email
    FROM public.user_profiles up
    LEFT JOIN auth.users au ON au.id = up.user_id
    WHERE up.user_id = v_actor_id;
  END IF;

  IF (TG_OP = 'DELETE') THEN
    v_old_json := row_to_json(OLD)::jsonb;
    v_partner_id := (v_old_json->>'partner_id')::uuid;
    v_store_id := (v_old_json->>'store_id')::uuid;

    IF v_partner_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.partners WHERE id = v_partner_id) THEN
        RETURN OLD;
      END IF;
      SELECT s.name INTO v_partner_name FROM public.stores s WHERE s.partner_id = v_partner_id ORDER BY s.created_at ASC LIMIT 1;
    END IF;
    IF v_store_id IS NOT NULL THEN
      SELECT name INTO v_store_name FROM public.stores WHERE id = v_store_id;
    END IF;

    INSERT INTO public.audit_logs (
      table_name, action, old_values, user_id, actor_user_id, partner_id, store_id,
      actor_name, actor_email, partner_name, store_name
    )
    VALUES (
      TG_TABLE_NAME, TG_OP, v_old_json, v_actor_id, v_actor_id, v_partner_id, v_store_id,
      v_actor_name, v_actor_email, v_partner_name, v_store_name
    );
    RETURN OLD;

  ELSIF (TG_OP = 'UPDATE') THEN
    v_old_json := row_to_json(OLD)::jsonb;
    v_new_json := row_to_json(NEW)::jsonb;
    v_partner_id := COALESCE((v_new_json->>'partner_id')::uuid, (v_old_json->>'partner_id')::uuid);
    v_store_id := COALESCE((v_new_json->>'store_id')::uuid, (v_old_json->>'store_id')::uuid);

    FOR v_key IN SELECT jsonb_object_keys(v_new_json) LOOP
      v_old_val := v_old_json->v_key;
      v_new_val := v_new_json->v_key;
      IF v_old_val IS DISTINCT FROM v_new_val THEN
        v_old_diff := jsonb_set(v_old_diff, ARRAY[v_key], COALESCE(v_old_val, 'null'::jsonb));
        v_new_diff := jsonb_set(v_new_diff, ARRAY[v_key], COALESCE(v_new_val, 'null'::jsonb));
      END IF;
    END LOOP;

    IF v_old_diff != '{}'::jsonb OR v_new_diff != '{}'::jsonb THEN
      IF v_partner_id IS NOT NULL THEN
        SELECT s.name INTO v_partner_name FROM public.stores s WHERE s.partner_id = v_partner_id ORDER BY s.created_at ASC LIMIT 1;
      END IF;
      IF v_store_id IS NOT NULL THEN
        SELECT name INTO v_store_name FROM public.stores WHERE id = v_store_id;
      END IF;

      INSERT INTO public.audit_logs (
        table_name, action, old_values, new_values, user_id, actor_user_id, partner_id, store_id,
        actor_name, actor_email, partner_name, store_name
      )
      VALUES (
        TG_TABLE_NAME, TG_OP, v_old_diff, v_new_diff, v_actor_id, v_actor_id, v_partner_id, v_store_id,
        v_actor_name, v_actor_email, v_partner_name, v_store_name
      );
    END IF;
    RETURN NEW;

  ELSIF (TG_OP = 'INSERT') THEN
    v_new_json := row_to_json(NEW)::jsonb;
    v_partner_id := (v_new_json->>'partner_id')::uuid;
    v_store_id := (v_new_json->>'store_id')::uuid;

    IF v_partner_id IS NOT NULL THEN
      SELECT s.name INTO v_partner_name FROM public.stores s WHERE s.partner_id = v_partner_id ORDER BY s.created_at ASC LIMIT 1;
    END IF;
    IF v_store_id IS NOT NULL THEN
      SELECT name INTO v_store_name FROM public.stores WHERE id = v_store_id;
    END IF;

    INSERT INTO public.audit_logs (
      table_name, action, new_values, user_id, actor_user_id, partner_id, store_id,
      actor_name, actor_email, partner_name, store_name
    )
    VALUES (
      TG_TABLE_NAME, TG_OP, v_new_json, v_actor_id, v_actor_id, v_partner_id, v_store_id,
      v_actor_name, v_actor_email, v_partner_name, v_store_name
    );
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

-- 5. Restore and complete execute_account_deletion_db
CREATE OR REPLACE FUNCTION public.execute_account_deletion_db(
  p_user_id UUID,
  p_partner_id UUID
) RETURNS INT AS $$
DECLARE
  v_affected_rows INT := 0;
  v_temp_rows INT := 0;
  v_return_ids UUID[];
  v_appt_ids UUID[];
  v_rec_sub_ids UUID[];
  v_rec_plan_ids UUID[];
  v_quote_ids UUID[];
  v_err_msg TEXT;
  v_err_detail TEXT;
BEGIN
  -- Bypass protective triggers during account deletion
  PERFORM set_config('dudit.bypass_payment_method_guard', 'true', true);

  -- 1. Lock the account_deletions row to prevent concurrent worker execution
  PERFORM 1 FROM public.account_deletions 
  WHERE user_id = p_user_id AND status != 'completed' 
  FOR UPDATE;

  IF p_partner_id IS NOT NULL THEN
    -- A. Collect and delete Return Requests & related tables
    SELECT array_agg(id) INTO v_return_ids FROM public.return_requests WHERE partner_id = p_partner_id;

    IF v_return_ids IS NOT NULL AND array_length(v_return_ids, 1) > 0 THEN
      DELETE FROM public.return_evidence WHERE return_request_id = ANY(v_return_ids);
      GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
      v_affected_rows := v_affected_rows + v_temp_rows;

      DELETE FROM public.return_items WHERE return_request_id = ANY(v_return_ids);
      GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
      v_affected_rows := v_affected_rows + v_temp_rows;

      DELETE FROM public.audit_logs WHERE entity_type = 'return_request' AND entity_id = ANY(v_return_ids);
      GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
      v_affected_rows := v_affected_rows + v_temp_rows;
    END IF;

    DELETE FROM public.return_messages WHERE partner_id = p_partner_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;

    DELETE FROM public.return_notifications WHERE partner_id = p_partner_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;

    DELETE FROM public.return_refunds WHERE partner_id = p_partner_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;

    DELETE FROM public.return_requests WHERE partner_id = p_partner_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;

    -- B. Collect and delete Appointments
    SELECT array_agg(id) INTO v_appt_ids FROM public.appointments WHERE partner_id = p_partner_id;
    IF v_appt_ids IS NOT NULL AND array_length(v_appt_ids, 1) > 0 THEN
      DELETE FROM public.appointment_items WHERE appointment_id = ANY(v_appt_ids);
      GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
      v_affected_rows := v_affected_rows + v_temp_rows;
    END IF;

    DELETE FROM public.appointments WHERE partner_id = p_partner_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;

    -- C. Collect and delete Customer Subscriptions / Plans
    DELETE FROM public.subscription_item_credit_ledger WHERE partner_id = p_partner_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;

    DELETE FROM public.subscription_item_credits WHERE partner_id = p_partner_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;

    SELECT array_agg(id) INTO v_rec_sub_ids FROM public.recurring_subscriptions WHERE partner_id = p_partner_id;
    IF v_rec_sub_ids IS NOT NULL AND array_length(v_rec_sub_ids, 1) > 0 THEN
      DELETE FROM public.recurring_subscription_items WHERE subscription_id = ANY(v_rec_sub_ids);
      GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
      v_affected_rows := v_affected_rows + v_temp_rows;
    END IF;

    DELETE FROM public.recurring_subscriptions WHERE partner_id = p_partner_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;

    SELECT array_agg(id) INTO v_rec_plan_ids FROM public.recurring_plans WHERE partner_id = p_partner_id;
    IF v_rec_plan_ids IS NOT NULL AND array_length(v_rec_plan_ids, 1) > 0 THEN
      DELETE FROM public.recurring_plan_items WHERE plan_id = ANY(v_rec_plan_ids);
      GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
      v_affected_rows := v_affected_rows + v_temp_rows;
    END IF;

    DELETE FROM public.recurring_plans WHERE partner_id = p_partner_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;

    -- D. Delete Store Credits
    DELETE FROM public.store_credits WHERE partner_id = p_partner_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;

    -- E. Delete Quotes & Quote Items before Partner delete
    SELECT array_agg(id) INTO v_quote_ids FROM public.quotes WHERE partner_id = p_partner_id;
    IF v_quote_ids IS NOT NULL AND array_length(v_quote_ids, 1) > 0 THEN
      DELETE FROM public.quote_items WHERE quote_id = ANY(v_quote_ids);
      GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
      v_affected_rows := v_affected_rows + v_temp_rows;
    END IF;

    DELETE FROM public.quotes WHERE partner_id = p_partner_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;

    -- F. Delete Delivery Assignments of Partner
    DELETE FROM public.delivery_assignments WHERE partner_id = p_partner_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;

    -- G. Zero circular references
    UPDATE public.product_categories SET parent_id = NULL WHERE partner_id = p_partner_id;
    UPDATE public.financial_categories SET parent_id = NULL WHERE partner_id = p_partner_id;
    UPDATE public.service_categories SET parent_id = NULL WHERE partner_id = p_partner_id;

    -- H. Delete Partner
    BEGIN
      DELETE FROM public.partners WHERE id = p_partner_id;
      GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
      v_affected_rows := v_affected_rows + v_temp_rows;
    EXCEPTION WHEN foreign_key_violation THEN
      GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_detail = PG_EXCEPTION_DETAIL;
      RAISE EXCEPTION 'Exclusão abortada: FK RESTRICT ativa detectada. Detalhe: %, Mensagem: %', v_err_detail, v_err_msg;
    END;
  END IF;

  -- 2. Detach user from any remaining staff / delivery assignments across other partners
  UPDATE public.appointments
  SET staff_partner_user_id = NULL
  WHERE staff_partner_user_id IN (SELECT id FROM public.partner_users WHERE user_id = p_user_id);

  UPDATE public.recurring_plan_items
  SET staff_partner_user_id = NULL
  WHERE staff_partner_user_id IN (SELECT id FROM public.partner_users WHERE user_id = p_user_id);

  UPDATE public.recurring_subscription_items
  SET staff_partner_user_id = NULL
  WHERE staff_partner_user_id IN (SELECT id FROM public.partner_users WHERE user_id = p_user_id);

  UPDATE public.delivery_assignments SET driver_id = NULL WHERE driver_id = p_user_id;
  UPDATE public.delivery_assignments SET assigned_by = NULL WHERE assigned_by = p_user_id;
  UPDATE public.delivery_assignments SET payment_confirmed_by = NULL WHERE payment_confirmed_by = p_user_id;

  DELETE FROM public.delivery_drivers WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
  v_affected_rows := v_affected_rows + v_temp_rows;

  -- 3. Anonymize audit_logs and admin_audit_logs (runs as SECURITY DEFINER postgres)
  UPDATE public.audit_logs
  SET user_id = NULL,
      actor_user_id = NULL,
      actor_name = '[DADOS ANONIMIZADOS]',
      actor_email = NULL,
      change_lines = ARRAY['[DADOS ANONIMIZADOS - CONTA EXCLUÍDA]'],
      new_values = NULL
  WHERE user_id = p_user_id OR actor_user_id = p_user_id;

  UPDATE public.admin_audit_logs
  SET admin_user_id = NULL
  WHERE admin_user_id = p_user_id;

  -- 4. Delete User Addresses and Profiles
  DELETE FROM public.addresses WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
  v_affected_rows := v_affected_rows + v_temp_rows;

  DELETE FROM public.user_profiles WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
  v_affected_rows := v_affected_rows + v_temp_rows;

  RETURN v_affected_rows;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMIT;
