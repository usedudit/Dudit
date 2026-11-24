-- ============================================================================
-- Migration: 20261124_store_deletion_system.sql
-- Goal:
--   1. Create public.store_deletion_requests table for 2-step email OTP
--      verification before permanently deleting a branch/store.
--   2. Create public.execute_store_deletion_db(p_store_id, p_partner_id, p_actor_user_id)
--      RPC that atomically deletes ALL data scoped to a single store/branch
--      across ERP and Marketplace without affecting the partner account or
--      any other store (e.g. headquarters / other branches).
-- ============================================================================

BEGIN;

-- ─── 1. Transient OTP Challenge Table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.store_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  verified_at TIMESTAMPTZ,
  request_ip TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_deletion_requests_user_store
  ON public.store_deletion_requests(user_id, store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_store_deletion_requests_created_at
  ON public.store_deletion_requests(created_at);

CREATE INDEX IF NOT EXISTS idx_store_deletion_requests_partner_id
  ON public.store_deletion_requests(partner_id);

ALTER TABLE public.store_deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_own_store_deletion_requests ON public.store_deletion_requests;
CREATE POLICY select_own_store_deletion_requests ON public.store_deletion_requests
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Mutations (INSERT, UPDATE, DELETE) are restricted to service_role / server actions.

-- ─── 2. Atomic Store-Scoped Cascade Deletion RPC ─────────────────────────────
CREATE OR REPLACE FUNCTION public.execute_store_deletion_db(
  p_store_id UUID,
  p_partner_id UUID,
  p_actor_user_id UUID DEFAULT NULL
) RETURNS INT AS $$
DECLARE
  v_store RECORD;
  v_store_count INT := 0;
  v_affected_rows INT := 0;
  v_temp_rows INT := 0;
  v_order_ids UUID[];
  v_return_ids UUID[];
  v_appt_ids UUID[];
  v_so_ids UUID[];
  v_rec_sub_ids UUID[];
  v_rec_plan_ids UUID[];
  v_quote_ids UUID[];
  v_tx_ids UUID[];
  v_product_ids UUID[];
  v_service_ids UUID[];
  v_kit_ids UUID[];
  v_err_msg TEXT;
  v_err_detail TEXT;
BEGIN
  -- Bypass protective triggers during full store deletion
  PERFORM set_config('dudit.bypass_payment_method_guard', 'true', true);

  -- 1. Lock and validate store
  SELECT id, partner_id, is_headquarters
  INTO v_store
  FROM public.stores
  WHERE id = p_store_id
    AND partner_id = p_partner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loja não encontrada para este parceiro.';
  END IF;

  IF v_store.is_headquarters IS TRUE THEN
    RAISE EXCEPTION 'A loja matriz não pode ser excluída.';
  END IF;

  SELECT COUNT(*) INTO v_store_count
  FROM public.stores
  WHERE partner_id = p_partner_id;

  IF v_store_count <= 1 THEN
    RAISE EXCEPTION 'Não é possível excluir a única loja cadastrada.';
  END IF;

  -- 2. Collect primary entity IDs belonging strictly to this store
  SELECT array_agg(id) INTO v_order_ids
  FROM public.orders
  WHERE partner_id = p_partner_id AND store_id = p_store_id;

  SELECT array_agg(id) INTO v_product_ids
  FROM public.products
  WHERE partner_id = p_partner_id AND store_id = p_store_id;

  SELECT array_agg(id) INTO v_service_ids
  FROM public.services
  WHERE partner_id = p_partner_id AND store_id = p_store_id;

  SELECT array_agg(id) INTO v_kit_ids
  FROM public.product_kits
  WHERE partner_id = p_partner_id AND store_id = p_store_id;

  SELECT array_agg(id) INTO v_return_ids
  FROM public.return_requests
  WHERE partner_id = p_partner_id
    AND (
      store_id = p_store_id
      OR (v_order_ids IS NOT NULL AND order_id = ANY(v_order_ids))
    );

  SELECT array_agg(id) INTO v_appt_ids
  FROM public.appointments
  WHERE partner_id = p_partner_id AND store_id = p_store_id;

  SELECT array_agg(id) INTO v_so_ids
  FROM public.service_orders
  WHERE partner_id = p_partner_id AND store_id = p_store_id;

  SELECT array_agg(id) INTO v_quote_ids
  FROM public.quotes
  WHERE partner_id = p_partner_id AND store_id = p_store_id;

  SELECT array_agg(id) INTO v_rec_sub_ids
  FROM public.recurring_subscriptions
  WHERE partner_id = p_partner_id AND store_id = p_store_id;

  SELECT array_agg(id) INTO v_rec_plan_ids
  FROM public.recurring_plans
  WHERE partner_id = p_partner_id AND store_id = p_store_id;

  SELECT array_agg(id) INTO v_tx_ids
  FROM public.transactions
  WHERE partner_id = p_partner_id AND store_id = p_store_id;

  -- ── A. Return Requests & Related (some have ON DELETE RESTRICT on store_id) ──
  IF v_return_ids IS NOT NULL AND array_length(v_return_ids, 1) > 0 THEN
    DELETE FROM public.return_evidence
    WHERE return_request_id = ANY(v_return_ids) OR store_id = p_store_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;

    DELETE FROM public.return_items
    WHERE return_request_id = ANY(v_return_ids);
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;

    IF to_regclass('public.return_events') IS NOT NULL THEN
      EXECUTE 'DELETE FROM public.return_events WHERE return_request_id = ANY($1) OR store_id = $2'
        USING v_return_ids, p_store_id;
      GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
      v_affected_rows := v_affected_rows + v_temp_rows;
    END IF;

    IF to_regclass('public.return_messages') IS NOT NULL THEN
      EXECUTE 'DELETE FROM public.return_messages WHERE return_request_id = ANY($1)'
        USING v_return_ids;
      GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
      v_affected_rows := v_affected_rows + v_temp_rows;
    END IF;

    DELETE FROM public.return_notifications
    WHERE return_request_id = ANY(v_return_ids) OR store_id = p_store_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;

    DELETE FROM public.return_refunds
    WHERE return_request_id = ANY(v_return_ids) OR store_id = p_store_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;

    DELETE FROM public.store_credits
    WHERE store_id = p_store_id OR return_request_id = ANY(v_return_ids);
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;

    DELETE FROM public.return_requests
    WHERE id = ANY(v_return_ids) OR store_id = p_store_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  ELSE
    -- Clean up any stray rows referencing store_id directly
    DELETE FROM public.return_evidence WHERE store_id = p_store_id;
    IF to_regclass('public.return_events') IS NOT NULL THEN
      EXECUTE 'DELETE FROM public.return_events WHERE store_id = $1' USING p_store_id;
    END IF;
    DELETE FROM public.return_notifications WHERE store_id = p_store_id;
    DELETE FROM public.return_refunds WHERE store_id = p_store_id;
    DELETE FROM public.store_credits WHERE store_id = p_store_id;
    DELETE FROM public.return_requests WHERE store_id = p_store_id;
  END IF;

  -- ── B. Checkout Fulfillments & Delivery / Logistics ──
  IF to_regclass('public.checkout_fulfillments') IS NOT NULL THEN
    DELETE FROM public.checkout_fulfillments
    WHERE store_id = p_store_id
      OR (v_order_ids IS NOT NULL AND order_id = ANY(v_order_ids));
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  IF v_order_ids IS NOT NULL AND array_length(v_order_ids, 1) > 0 THEN
    IF to_regclass('public.delivery_assignments') IS NOT NULL THEN
      DELETE FROM public.delivery_assignments
      WHERE order_id = ANY(v_order_ids);
      GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
      v_affected_rows := v_affected_rows + v_temp_rows;
    END IF;
  END IF;

  IF to_regclass('public.delivery_orders') IS NOT NULL THEN
    DELETE FROM public.delivery_orders
    WHERE store_id = p_store_id
      OR (v_order_ids IS NOT NULL AND order_id = ANY(v_order_ids));
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  IF to_regclass('public.deliveries') IS NOT NULL THEN
    DELETE FROM public.deliveries
    WHERE store_id = p_store_id
      OR (v_order_ids IS NOT NULL AND order_id = ANY(v_order_ids));
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  IF to_regclass('public.delivery_fee_rules') IS NOT NULL THEN
    DELETE FROM public.delivery_fee_rules WHERE store_id = p_store_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  IF to_regclass('public.delivery_settings') IS NOT NULL THEN
    DELETE FROM public.delivery_settings WHERE store_id = p_store_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  IF to_regclass('public.dispatch_settings') IS NOT NULL THEN
    DELETE FROM public.dispatch_settings WHERE store_id = p_store_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  IF to_regclass('public.store_ready_estimates') IS NOT NULL THEN
    DELETE FROM public.store_ready_estimates WHERE store_id = p_store_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  -- ── C. Recurring Subscriptions & Plans (store-scoped) ──
  IF v_rec_sub_ids IS NOT NULL AND array_length(v_rec_sub_ids, 1) > 0 THEN
    IF to_regclass('public.subscription_item_credit_ledger') IS NOT NULL THEN
      DELETE FROM public.subscription_item_credit_ledger
      WHERE subscription_id = ANY(v_rec_sub_ids);
      GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
      v_affected_rows := v_affected_rows + v_temp_rows;
    END IF;

    IF to_regclass('public.subscription_item_credits') IS NOT NULL THEN
      DELETE FROM public.subscription_item_credits
      WHERE subscription_id = ANY(v_rec_sub_ids);
      GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
      v_affected_rows := v_affected_rows + v_temp_rows;
    END IF;

    DELETE FROM public.recurring_subscription_items
    WHERE subscription_id = ANY(v_rec_sub_ids);
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;

    DELETE FROM public.recurring_subscriptions
    WHERE id = ANY(v_rec_sub_ids);
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  IF v_rec_plan_ids IS NOT NULL AND array_length(v_rec_plan_ids, 1) > 0 THEN
    DELETE FROM public.recurring_plan_items
    WHERE plan_id = ANY(v_rec_plan_ids);
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;

    DELETE FROM public.recurring_plans
    WHERE id = ANY(v_rec_plan_ids);
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  -- ── D. Appointments (store-scoped) ──
  IF v_appt_ids IS NOT NULL AND array_length(v_appt_ids, 1) > 0 THEN
    DELETE FROM public.appointment_items WHERE appointment_id = ANY(v_appt_ids);
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;

    DELETE FROM public.appointments WHERE id = ANY(v_appt_ids);
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  -- ── E. Service Orders (store-scoped) ──
  IF v_so_ids IS NOT NULL AND array_length(v_so_ids, 1) > 0 THEN
    IF to_regclass('public.service_order_items') IS NOT NULL THEN
      DELETE FROM public.service_order_items WHERE service_order_id = ANY(v_so_ids);
      GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
      v_affected_rows := v_affected_rows + v_temp_rows;
    END IF;

    DELETE FROM public.service_orders WHERE id = ANY(v_so_ids);
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  -- ── F. Quotes & Quote Items (store-scoped) ──
  IF v_quote_ids IS NOT NULL AND array_length(v_quote_ids, 1) > 0 THEN
    DELETE FROM public.quote_items
    WHERE quote_id = ANY(v_quote_ids) OR store_id = p_store_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;

    DELETE FROM public.quotes WHERE id = ANY(v_quote_ids);
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  ELSE
    DELETE FROM public.quote_items WHERE store_id = p_store_id;
  END IF;

  -- ── G. Financials (store-scoped) ──
  IF to_regclass('public.transaction_payments') IS NOT NULL THEN
    DELETE FROM public.transaction_payments
    WHERE store_id = p_store_id
      OR (v_tx_ids IS NOT NULL AND transaction_id = ANY(v_tx_ids));
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  IF v_tx_ids IS NOT NULL AND array_length(v_tx_ids, 1) > 0 THEN
    DELETE FROM public.transactions WHERE id = ANY(v_tx_ids);
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  IF to_regclass('public.recurring_transactions') IS NOT NULL THEN
    DELETE FROM public.recurring_transactions
    WHERE partner_id = p_partner_id AND store_id = p_store_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  IF to_regclass('public.installment_groups') IS NOT NULL THEN
    DELETE FROM public.installment_groups
    WHERE partner_id = p_partner_id AND store_id = p_store_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  IF to_regclass('public.payments') IS NOT NULL THEN
    DELETE FROM public.payments
    WHERE partner_id = p_partner_id
      AND (
        store_id = p_store_id
        OR (v_order_ids IS NOT NULL AND order_id = ANY(v_order_ids))
      );
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  IF to_regclass('public.receivables') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.receivables WHERE store_id = $1' USING p_store_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  IF to_regclass('public.accounts_payable') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.accounts_payable WHERE store_id = $1' USING p_store_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  IF to_regclass('public.accounts_receivable') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.accounts_receivable WHERE store_id = $1' USING p_store_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  -- ── H. Cart Items, Reviews & Orders (store-scoped) ──
  DELETE FROM public.cart_items
  WHERE store_id = p_store_id
    OR (v_product_ids IS NOT NULL AND product_id = ANY(v_product_ids))
    OR (v_service_ids IS NOT NULL AND service_id = ANY(v_service_ids));
  GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
  v_affected_rows := v_affected_rows + v_temp_rows;

  DELETE FROM public.reviews
  WHERE store_id = p_store_id
    OR (v_order_ids IS NOT NULL AND order_id = ANY(v_order_ids))
    OR (v_product_ids IS NOT NULL AND product_id = ANY(v_product_ids))
    OR (v_service_ids IS NOT NULL AND service_id = ANY(v_service_ids));
  GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
  v_affected_rows := v_affected_rows + v_temp_rows;

  IF v_order_ids IS NOT NULL AND array_length(v_order_ids, 1) > 0 THEN
    IF to_regclass('public.orders_history') IS NOT NULL THEN
      DELETE FROM public.orders_history WHERE order_id = ANY(v_order_ids);
      GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
      v_affected_rows := v_affected_rows + v_temp_rows;
    END IF;

    DELETE FROM public.order_items WHERE order_id = ANY(v_order_ids);
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;

    -- Clear self-referencing exchange links before deleting orders
    UPDATE public.orders
    SET exchange_parent_order_id = NULL
    WHERE exchange_parent_order_id = ANY(v_order_ids);

    DELETE FROM public.orders WHERE id = ANY(v_order_ids);
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  -- ── I. Products, Variants, Kits, Stock & XML Imports (store-scoped) ──
  DELETE FROM public.stock_movements
  WHERE store_id = p_store_id
    OR (v_product_ids IS NOT NULL AND product_id = ANY(v_product_ids));
  GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
  v_affected_rows := v_affected_rows + v_temp_rows;

  IF to_regclass('public.product_kit_items') IS NOT NULL THEN
    DELETE FROM public.product_kit_items
    WHERE (v_kit_ids IS NOT NULL AND kit_id = ANY(v_kit_ids))
      OR (v_product_ids IS NOT NULL AND product_id = ANY(v_product_ids));
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  IF v_kit_ids IS NOT NULL AND array_length(v_kit_ids, 1) > 0 THEN
    DELETE FROM public.product_kits WHERE id = ANY(v_kit_ids);
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  IF to_regclass('public.product_fiscal_profiles') IS NOT NULL THEN
    DELETE FROM public.product_fiscal_profiles
    WHERE store_id = p_store_id
      OR (v_product_ids IS NOT NULL AND product_id = ANY(v_product_ids));
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  IF v_product_ids IS NOT NULL AND array_length(v_product_ids, 1) > 0 THEN
    IF to_regclass('public.product_logistics') IS NOT NULL THEN
      DELETE FROM public.product_logistics WHERE product_id = ANY(v_product_ids);
      GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
      v_affected_rows := v_affected_rows + v_temp_rows;
    END IF;

    IF to_regclass('public.product_suppliers') IS NOT NULL THEN
      DELETE FROM public.product_suppliers WHERE product_id = ANY(v_product_ids);
      GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
      v_affected_rows := v_affected_rows + v_temp_rows;
    END IF;

    IF to_regclass('public.product_variants') IS NOT NULL THEN
      DELETE FROM public.product_variants WHERE product_id = ANY(v_product_ids);
      GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
      v_affected_rows := v_affected_rows + v_temp_rows;
    END IF;

    IF to_regclass('public.favorites') IS NOT NULL THEN
      DELETE FROM public.favorites WHERE product_id = ANY(v_product_ids);
      GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
      v_affected_rows := v_affected_rows + v_temp_rows;
    END IF;

    DELETE FROM public.products WHERE id = ANY(v_product_ids);
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  IF to_regclass('public.xml_import_items') IS NOT NULL THEN
    DELETE FROM public.xml_import_items WHERE store_id = p_store_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  IF to_regclass('public.xml_imports') IS NOT NULL THEN
    DELETE FROM public.xml_imports WHERE store_id = p_store_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  -- ── J. Services (store-scoped) ──
  IF to_regclass('public.service_attendance_settings') IS NOT NULL THEN
    DELETE FROM public.service_attendance_settings WHERE store_id = p_store_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  IF v_service_ids IS NOT NULL AND array_length(v_service_ids, 1) > 0 THEN
    IF to_regclass('public.favorites') IS NOT NULL THEN
      DELETE FROM public.favorites WHERE service_id = ANY(v_service_ids);
      GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
      v_affected_rows := v_affected_rows + v_temp_rows;
    END IF;

    DELETE FROM public.services WHERE id = ANY(v_service_ids);
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  -- ── K. Customers & Suppliers (store-scoped) ──
  DELETE FROM public.customers
  WHERE partner_id = p_partner_id AND store_id = p_store_id;
  GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
  v_affected_rows := v_affected_rows + v_temp_rows;

  DELETE FROM public.suppliers
  WHERE partner_id = p_partner_id AND store_id = p_store_id;
  GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
  v_affected_rows := v_affected_rows + v_temp_rows;

  -- ── L. Marketing, Community Videos & WhatsApp (store-scoped) ──
  IF to_regclass('public.coupons') IS NOT NULL THEN
    DELETE FROM public.coupons WHERE partner_id = p_partner_id AND store_id = p_store_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  IF to_regclass('public.promotions') IS NOT NULL THEN
    DELETE FROM public.promotions WHERE partner_id = p_partner_id AND store_id = p_store_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  IF to_regclass('public.campaigns') IS NOT NULL THEN
    DELETE FROM public.campaigns WHERE partner_id = p_partner_id AND store_id = p_store_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  IF to_regclass('public.community_videos') IS NOT NULL THEN
    DELETE FROM public.community_videos WHERE store_id = p_store_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  IF to_regclass('public.whatsapp_messages') IS NOT NULL THEN
    DELETE FROM public.whatsapp_messages WHERE store_id = p_store_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  IF to_regclass('public.partner_whatsapp_connections') IS NOT NULL THEN
    DELETE FROM public.partner_whatsapp_connections
    WHERE partner_id = p_partner_id AND store_id = p_store_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  END IF;

  -- ── M. Shared/Selective Cadastros (delete store-exclusive rows, prune store_ids arrays) ──
  -- payment_methods
  DELETE FROM public.payment_methods
  WHERE partner_id = p_partner_id
    AND (store_id = p_store_id OR store_ids = ARRAY[p_store_id]);
  GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
  v_affected_rows := v_affected_rows + v_temp_rows;

  UPDATE public.payment_methods
  SET store_ids = array_remove(store_ids, p_store_id)
  WHERE partner_id = p_partner_id
    AND store_ids IS NOT NULL
    AND p_store_id = ANY(store_ids);

  -- finance_accounts
  DELETE FROM public.finance_accounts
  WHERE partner_id = p_partner_id
    AND (store_id = p_store_id OR store_ids = ARRAY[p_store_id]);
  GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
  v_affected_rows := v_affected_rows + v_temp_rows;

  UPDATE public.finance_accounts
  SET store_ids = array_remove(store_ids, p_store_id)
  WHERE partner_id = p_partner_id
    AND store_ids IS NOT NULL
    AND p_store_id = ANY(store_ids);

  -- financial_categories
  UPDATE public.financial_categories
  SET parent_id = NULL
  WHERE partner_id = p_partner_id
    AND parent_id IN (
      SELECT id FROM public.financial_categories
      WHERE partner_id = p_partner_id
        AND (store_id = p_store_id OR store_ids = ARRAY[p_store_id])
    );

  DELETE FROM public.financial_categories
  WHERE partner_id = p_partner_id
    AND (store_id = p_store_id OR store_ids = ARRAY[p_store_id]);
  GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
  v_affected_rows := v_affected_rows + v_temp_rows;

  UPDATE public.financial_categories
  SET store_ids = array_remove(store_ids, p_store_id)
  WHERE partner_id = p_partner_id
    AND store_ids IS NOT NULL
    AND p_store_id = ANY(store_ids);

  -- transaction_contacts
  DELETE FROM public.transaction_contacts
  WHERE partner_id = p_partner_id
    AND (store_id = p_store_id OR store_ids = ARRAY[p_store_id]);
  GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
  v_affected_rows := v_affected_rows + v_temp_rows;

  UPDATE public.transaction_contacts
  SET store_ids = array_remove(store_ids, p_store_id)
  WHERE partner_id = p_partner_id
    AND store_ids IS NOT NULL
    AND p_store_id = ANY(store_ids);

  -- product_categories (store_ids only)
  UPDATE public.product_categories
  SET parent_id = NULL
  WHERE partner_id = p_partner_id
    AND parent_id IN (
      SELECT id FROM public.product_categories
      WHERE partner_id = p_partner_id AND store_ids = ARRAY[p_store_id]
    );

  DELETE FROM public.product_categories
  WHERE partner_id = p_partner_id AND store_ids = ARRAY[p_store_id];
  GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
  v_affected_rows := v_affected_rows + v_temp_rows;

  UPDATE public.product_categories
  SET store_ids = array_remove(store_ids, p_store_id)
  WHERE partner_id = p_partner_id
    AND store_ids IS NOT NULL
    AND p_store_id = ANY(store_ids);

  -- service_categories (store_ids only)
  UPDATE public.service_categories
  SET parent_id = NULL
  WHERE partner_id = p_partner_id
    AND parent_id IN (
      SELECT id FROM public.service_categories
      WHERE partner_id = p_partner_id AND store_ids = ARRAY[p_store_id]
    );

  DELETE FROM public.service_categories
  WHERE partner_id = p_partner_id AND store_ids = ARRAY[p_store_id];
  GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
  v_affected_rows := v_affected_rows + v_temp_rows;

  UPDATE public.service_categories
  SET store_ids = array_remove(store_ids, p_store_id)
  WHERE partner_id = p_partner_id
    AND store_ids IS NOT NULL
    AND p_store_id = ANY(store_ids);

  -- brands (store_ids only)
  DELETE FROM public.brands
  WHERE partner_id = p_partner_id AND store_ids = ARRAY[p_store_id];
  GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
  v_affected_rows := v_affected_rows + v_temp_rows;

  UPDATE public.brands
  SET store_ids = array_remove(store_ids, p_store_id)
  WHERE partner_id = p_partner_id
    AND store_ids IS NOT NULL
    AND p_store_id = ANY(store_ids);

  -- storage_locations (store_ids only)
  DELETE FROM public.storage_locations
  WHERE partner_id = p_partner_id AND store_ids = ARRAY[p_store_id];
  GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
  v_affected_rows := v_affected_rows + v_temp_rows;

  UPDATE public.storage_locations
  SET store_ids = array_remove(store_ids, p_store_id)
  WHERE partner_id = p_partner_id
    AND store_ids IS NOT NULL
    AND p_store_id = ANY(store_ids);

  -- unavailable_types (store_ids only)
  IF to_regclass('public.unavailable_types') IS NOT NULL THEN
    DELETE FROM public.unavailable_types
    WHERE partner_id = p_partner_id AND store_ids = ARRAY[p_store_id];
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;

    UPDATE public.unavailable_types
    SET store_ids = array_remove(store_ids, p_store_id)
    WHERE partner_id = p_partner_id
      AND store_ids IS NOT NULL
      AND p_store_id = ANY(store_ids);
  END IF;

  -- ── N. Store Members & Addresses ──
  DELETE FROM public.store_members WHERE store_id = p_store_id;
  GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
  v_affected_rows := v_affected_rows + v_temp_rows;

  DELETE FROM public.addresses WHERE store_id = p_store_id;
  GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
  v_affected_rows := v_affected_rows + v_temp_rows;

  -- ── O. Delete the Store Row Itself ──
  BEGIN
    DELETE FROM public.stores
    WHERE id = p_store_id AND partner_id = p_partner_id;
    GET DIAGNOSTICS v_temp_rows = ROW_COUNT;
    v_affected_rows := v_affected_rows + v_temp_rows;
  EXCEPTION WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_detail = PG_EXCEPTION_DETAIL;
    RAISE EXCEPTION 'Exclusão da filial abortada: vínculo ativo detectado. Detalhe: %, Mensagem: %', v_err_detail, v_err_msg;
  END;

  RETURN v_affected_rows;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.execute_store_deletion_db(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_store_deletion_db(UUID, UUID, UUID) TO service_role;

COMMIT;
