-- Up Migration: Create Account Deletion and Compliance Log tables

CREATE TABLE IF NOT EXISTS public.account_deletions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN (
    'pending_deletion',
    'cancelling_subscription',
    'waiting_grace_period',
    'deleting_storage',
    'deleting_database',
    'deleting_auth',
    'completed',
    'failed'
  )),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  grace_period_ends_at TIMESTAMPTZ NOT NULL,
  checkpoints JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_ip TEXT NOT NULL DEFAULT 'unknown',
  request_country TEXT NOT NULL DEFAULT 'BR',
  user_agent TEXT,
  reason TEXT,
  trigger_run_id TEXT,
  error_log TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_deletions_user_id ON public.account_deletions(user_id);
CREATE INDEX IF NOT EXISTS idx_account_deletions_partner_id ON public.account_deletions(partner_id);

CREATE TABLE IF NOT EXISTS public.compliance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  partner_id UUID,
  email_hash TEXT NOT NULL,
  mp_subscription_id TEXT,
  mp_customer_id TEXT,
  request_ip TEXT,
  request_country TEXT,
  user_agent TEXT,
  request_timestamp TIMESTAMPTZ NOT NULL,
  deletion_version TEXT NOT NULL,
  execution_time_ms INT,
  workflow_version TEXT NOT NULL,
  deletion_reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'completed',
  certificate JSONB
);

ALTER TABLE public.compliance_logs ADD COLUMN IF NOT EXISTS certificate JSONB;

CREATE INDEX IF NOT EXISTS idx_compliance_email_hash ON public.compliance_logs(email_hash);

-- PostgreSQL transaction execution helper function for account deletions
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
  v_err_msg TEXT;
  v_err_detail TEXT;
BEGIN
  -- Bypass payment method protection during deletion
  PERFORM set_config('dudit.bypass_payment_method_guard', 'true', true);

  -- 1. Lock the account_deletions row to prevent concurrent worker execution
  PERFORM 1 FROM public.account_deletions 
  WHERE user_id = p_user_id AND status != 'completed' 
  FOR UPDATE;

  IF p_partner_id IS NOT NULL THEN
    -- A. Collect Return IDs
    SELECT array_agg(id) INTO v_return_ids FROM public.return_requests WHERE partner_id = p_partner_id;

    IF v_return_ids IS NOT NULL AND array_length(v_return_ids, 1) > 0 THEN
      -- Delete return evidence
      DELETE FROM public.return_evidence WHERE return_request_id = ANY(v_return_ids);
      GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
      v_affected_rows := v_affected_rows + v_temp_rows;

      -- Delete return items
      DELETE FROM public.return_items WHERE return_request_id = ANY(v_return_ids);
      GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
      v_affected_rows := v_affected_rows + v_temp_rows;

      -- Delete return events (Fixing FK RESTRICT check)
      DELETE FROM public.return_events WHERE return_request_id = ANY(v_return_ids);
      GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
      v_affected_rows := v_affected_rows + v_temp_rows;
    END IF;

    -- Delete return messages, notifications, refunds
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
    -- First delete credit ledgers and credits (Fixing FK RESTRICT check)
    DELETE FROM public.subscription_item_credit_ledger WHERE partner_id = p_partner_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;

    DELETE FROM public.subscription_item_credits WHERE partner_id = p_partner_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;

    SELECT array_agg(id) INTO v_rec_sub_ids FROM public.recurring_subscriptions WHERE partner_id = p_partner_id;
    IF v_rec_sub_ids IS NOT NULL AND array_length(v_rec_sub_ids, 1) > 0 THEN
      DELETE FROM public.recurring_subscription_items WHERE recurring_subscription_id = ANY(v_rec_sub_ids);
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

    -- E. Zero circular references
    UPDATE public.product_categories SET parent_id = NULL WHERE partner_id = p_partner_id;
    UPDATE public.financial_categories SET parent_id = NULL WHERE partner_id = p_partner_id;
    UPDATE public.service_categories SET parent_id = NULL WHERE partner_id = p_partner_id;

    -- F. Delete Partner (wrapped in try-catch to log FK exceptions)
    BEGIN
      DELETE FROM public.partners WHERE id = p_partner_id;
      GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
      v_affected_rows := v_affected_rows + v_temp_rows;
    EXCEPTION WHEN foreign_key_violation THEN
      GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_detail = PG_EXCEPTION_DETAIL;
      RAISE EXCEPTION 'Exclusão abortada: FK RESTRICT ativa detectada. Detalhe: %, Mensagem: %', v_err_detail, v_err_msg;
    END;
  END IF;

  -- 7. Delete User Addresses and Profiles
  DELETE FROM public.addresses WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
  v_affected_rows := v_affected_rows + v_temp_rows;

  DELETE FROM public.user_profiles WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
  v_affected_rows := v_affected_rows + v_temp_rows;

  RETURN v_affected_rows;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
