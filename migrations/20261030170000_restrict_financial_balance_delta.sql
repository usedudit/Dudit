BEGIN;

-- Direct authenticated callers could alter account balances in their partner
-- without the ERP's financial/store permission checks. Application call sites
-- now invoke this RPC with the service-role client after server authorization.
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
  v_trusted_executor boolean := COALESCE(auth.role(), '') IN ('service_role', '');
BEGIN
  IF p_delta IS NULL OR p_account_id IS NULL OR p_partner_id IS NULL THEN
    RAISE EXCEPTION 'Account, partner and balance delta are required'
      USING ERRCODE = '22004';
  END IF;
  IF p_delta = 0 THEN RETURN NULL; END IF;

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
    RAISE EXCEPTION 'Finance account not found or outside partner context'
      USING ERRCODE = '42501';
  END IF;

  v_new := ROUND(COALESCE(v_current, 0) + p_delta, 2);
  UPDATE public.finance_accounts
  SET current_balance = v_new,
      updated_at = NOW()
  WHERE id = p_account_id
    AND partner_id = p_partner_id;

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_account_balance_delta(uuid, uuid, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_account_balance_delta(uuid, uuid, numeric)
  TO service_role;

CREATE OR REPLACE FUNCTION public.create_commission_payment_atomic(
  p_partner_id uuid,
  p_seller_partner_user_id uuid,
  p_amount numeric,
  p_account_id uuid,
  p_category text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_balance numeric;
  v_seller_name text;
  v_category text;
  v_amount numeric;
  v_transaction_id uuid;
  v_now timestamptz := now();
BEGIN
  IF p_partner_id IS NULL OR p_seller_partner_user_id IS NULL
     OR p_account_id IS NULL OR p_user_id IS NULL OR p_amount IS NULL THEN
    RAISE EXCEPTION 'Partner, seller, account, user and amount are required'
      USING ERRCODE = '22004';
  END IF;

  v_amount := round(p_amount, 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero' USING ERRCODE = '22023';
  END IF;

  v_category := CASE WHEN p_category = 'Metas e Bônus' THEN p_category ELSE 'Comissões' END;

  SELECT fa.current_balance
    INTO v_balance
  FROM public.finance_accounts fa
  WHERE fa.id = p_account_id
    AND fa.partner_id = p_partner_id
    AND fa.is_active = true
    AND fa.store_id IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Global active finance account not found for this partner'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(up.full_name, 'Vendedor')
    INTO v_seller_name
  FROM public.partner_users pu
  LEFT JOIN public.user_profiles up ON up.user_id = pu.user_id
  WHERE pu.id = p_seller_partner_user_id
    AND pu.partner_id = p_partner_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Seller not found for this partner' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.transactions (
    partner_id, description, category, amount, original_amount, fee_amount,
    status, payment_date, transaction_date, payment_type, transaction_type,
    origin, notes, account_id, seller_partner_user_id, contact_id,
    contact_type, created_by_user_id
  ) VALUES (
    p_partner_id,
    CASE WHEN v_category = 'Metas e Bônus' THEN 'Pagamento de bônus de meta' ELSE 'Pagamento de comissão' END,
    v_category, v_amount, v_amount, 0, 'paid', v_now, v_now,
    CASE WHEN v_category = 'Metas e Bônus' THEN 'Bônus meta' ELSE 'Comissão' END,
    'expense', 'manual',
    CASE WHEN v_category = 'Metas e Bônus'
      THEN 'Pagamento manual de bônus de meta. (' || v_seller_name || ')'
      ELSE 'Pagamento manual de comissão. (' || v_seller_name || ')'
    END,
    p_account_id, p_seller_partner_user_id, NULL, 'employee', p_user_id
  )
  RETURNING id INTO v_transaction_id;

  UPDATE public.finance_accounts
  SET current_balance = round(COALESCE(v_balance, 0) - v_amount, 2),
      updated_at = v_now
  WHERE id = p_account_id
    AND partner_id = p_partner_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Finance account disappeared during commission payment'
      USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object('id', v_transaction_id, 'amount', v_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.create_commission_payment_atomic(uuid, uuid, numeric, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_commission_payment_atomic(uuid, uuid, numeric, uuid, text, uuid)
  TO service_role;

-- Pay complete bonus transactions and debit the selected partner-wide account
-- in one transaction. Row locks prevent two concurrent requests from paying
-- the same pending bonuses twice.
CREATE OR REPLACE FUNCTION public.pay_seller_bonus_atomic(
  p_partner_id uuid,
  p_seller_partner_user_id uuid,
  p_requested_amount numeric,
  p_account_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_tx record;
  v_account_balance numeric;
  v_remaining numeric;
  v_paid numeric := 0;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_updated integer;
  v_now timestamptz := now();
BEGIN
  IF p_partner_id IS NULL OR p_seller_partner_user_id IS NULL
     OR p_account_id IS NULL OR p_requested_amount IS NULL
     OR p_requested_amount <= 0 THEN
    RAISE EXCEPTION 'Partner, seller, account and positive amount are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT fa.current_balance
    INTO v_account_balance
  FROM public.finance_accounts fa
  WHERE fa.id = p_account_id
    AND fa.partner_id = p_partner_id
    AND fa.is_active = true
    AND fa.store_id IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Global active finance account not found for this partner'
      USING ERRCODE = '42501';
  END IF;

  v_remaining := round(p_requested_amount, 2);
  FOR v_tx IN
    SELECT t.id, abs(t.amount) AS amount
    FROM public.transactions t
    WHERE t.partner_id = p_partner_id
      AND t.seller_partner_user_id = p_seller_partner_user_id
      AND t.category = 'Metas e Bônus'
      AND t.status = 'pending'
    ORDER BY t.created_at, t.id
    FOR UPDATE
  LOOP
    IF v_tx.amount <= 0 THEN CONTINUE; END IF;
    IF v_remaining + 0.0001 < v_tx.amount THEN EXIT; END IF;
    v_ids := array_append(v_ids, v_tx.id);
    v_paid := v_paid + v_tx.amount;
    v_remaining := round(v_remaining - v_tx.amount, 2);
  END LOOP;

  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'No complete pending bonus is covered by the requested amount'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.transactions
  SET status = 'paid',
      payment_date = v_now,
      account_id = p_account_id,
      updated_at = v_now
  WHERE partner_id = p_partner_id
    AND id = ANY(v_ids)
    AND status = 'pending';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'Bonus rows changed while being paid'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.finance_accounts
  SET current_balance = round(COALESCE(v_account_balance, 0) - v_paid, 2),
      updated_at = v_now
  WHERE id = p_account_id
    AND partner_id = p_partner_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Finance account disappeared during bonus payment'
      USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'paidAmount', round(v_paid, 2),
    'settledCount', cardinality(v_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pay_seller_bonus_atomic(uuid, uuid, numeric, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_seller_bonus_atomic(uuid, uuid, numeric, uuid)
  TO service_role;

COMMIT;
