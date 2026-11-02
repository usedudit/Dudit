BEGIN;

CREATE OR REPLACE FUNCTION public.create_order_settlement_atomic(
  p_partner_id uuid,
  p_reference_note text,
  p_row jsonb,
  p_balance_delta numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_row record;
  v_existing_id uuid;
  v_transaction_id uuid;
  v_balance numeric;
BEGIN
  IF p_partner_id IS NULL OR p_reference_note IS NULL OR btrim(p_reference_note) = ''
     OR jsonb_typeof(p_row) IS DISTINCT FROM 'object'
     OR p_balance_delta IS NULL OR p_balance_delta < 0 THEN
    RAISE EXCEPTION 'Order settlement values are invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_partner_id::text || ':' || p_reference_note, 0)
  );

  SELECT r.* INTO v_row
  FROM jsonb_to_record(p_row) AS r(
    partner_id uuid, store_id uuid, description text, category text,
    customer_id uuid, amount numeric, original_amount numeric,
    due_date date, payment_date timestamptz,
    transaction_date timestamptz, status text, notes text, installment_number integer,
    total_installments integer, interest_amount numeric, fee_amount numeric,
    discount_amount numeric, payment_type text, payment_method_id uuid,
    transaction_type text, origin text, account_id uuid, kind text,
    payment_id uuid, reference_note text, created_by_user_id uuid
  );
  IF v_row.partner_id IS DISTINCT FROM p_partner_id
     OR v_row.reference_note IS DISTINCT FROM p_reference_note
     OR v_row.transaction_type IS DISTINCT FROM 'income'
     OR v_row.status IS DISTINCT FROM 'paid'
     OR v_row.kind IS DISTINCT FROM 'settlement'
     OR v_row.description IS NULL OR btrim(v_row.description) = ''
     OR v_row.amount IS NULL OR v_row.amount <= 0
     OR v_row.account_id IS NULL AND p_balance_delta <> 0 THEN
    RAISE EXCEPTION 'Order settlement row does not match its financial context'
      USING ERRCODE = '22023';
  END IF;

  SELECT t.id INTO v_existing_id
  FROM public.transactions t
  WHERE t.partner_id = p_partner_id AND t.reference_note = p_reference_note
    AND t.kind = 'settlement' AND t.transaction_type = 'income'
  ORDER BY t.created_at, t.id
  LIMIT 1
  FOR UPDATE;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'alreadyProcessed', true, 'transactionId', v_existing_id);
  END IF;

  IF v_row.account_id IS NOT NULL THEN
    SELECT fa.current_balance INTO v_balance
    FROM public.finance_accounts fa
    WHERE fa.id = v_row.account_id AND fa.partner_id = p_partner_id
      AND coalesce(fa.is_active, true)
      AND (fa.store_id IS NULL OR fa.store_id = v_row.store_id)
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Finance account is outside the partner/store context or inactive'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.transactions (
    partner_id, store_id, description, category, customer_id, amount,
    original_amount, due_date, payment_date, transaction_date, status, notes,
    installment_number, total_installments, interest_amount, fee_amount,
    discount_amount, payment_type, payment_method_id, transaction_type,
    origin, account_id, kind, payment_id, reference_note, created_by_user_id
  ) VALUES (
    p_partner_id, v_row.store_id, v_row.description, coalesce(v_row.category, 'Vendas'),
    v_row.customer_id, round(v_row.amount, 2), round(coalesce(v_row.original_amount, v_row.amount), 2),
    v_row.due_date, v_row.payment_date, coalesce(v_row.transaction_date, v_row.payment_date),
    v_row.status, v_row.notes, v_row.installment_number, v_row.total_installments,
    v_row.interest_amount, coalesce(v_row.fee_amount, 0), coalesce(v_row.discount_amount, 0),
    v_row.payment_type, v_row.payment_method_id, v_row.transaction_type,
    coalesce(v_row.origin, 'system'), v_row.account_id, v_row.kind, v_row.payment_id,
    p_reference_note, v_row.created_by_user_id
  ) RETURNING id INTO v_transaction_id;

  IF v_row.account_id IS NOT NULL AND round(p_balance_delta, 2) <> 0 THEN
    UPDATE public.finance_accounts
    SET current_balance = round(coalesce(v_balance, 0) + p_balance_delta, 2),
        updated_at = now()
    WHERE id = v_row.account_id AND partner_id = p_partner_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'alreadyProcessed', false, 'transactionId', v_transaction_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.refine_order_settlement_atomic(
  p_partner_id uuid,
  p_reference_note text,
  p_expected_gross numeric,
  p_target_net numeric,
  p_balance_delta numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_tx public.transactions%ROWTYPE;
  v_balance numeric;
BEGIN
  IF p_partner_id IS NULL OR p_reference_note IS NULL OR btrim(p_reference_note) = ''
     OR p_expected_gross IS NULL OR p_target_net IS NULL OR p_balance_delta IS NULL
     OR p_expected_gross <= 0 OR p_target_net <= 0 OR p_balance_delta > 0 THEN
    RAISE EXCEPTION 'Order settlement refinement values are invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_partner_id::text || ':' || p_reference_note, 0)
  );
  SELECT t.* INTO v_tx
  FROM public.transactions t
  WHERE t.partner_id = p_partner_id AND t.reference_note = p_reference_note
    AND t.kind = 'settlement' AND t.transaction_type = 'income' AND t.status = 'paid'
  ORDER BY t.created_at, t.id
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'updated', false, 'reason', 'not_found');
  END IF;

  IF abs(round(coalesce(v_tx.amount, 0), 2) - round(p_expected_gross, 2)) > 0.005 THEN
    RETURN jsonb_build_object('success', true, 'updated', false, 'reason', 'amount_changed');
  END IF;

  IF v_tx.account_id IS NOT NULL AND round(p_balance_delta, 2) <> 0 THEN
    SELECT fa.current_balance INTO v_balance
    FROM public.finance_accounts fa
    WHERE fa.id = v_tx.account_id AND fa.partner_id = p_partner_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Settlement account is outside this partner' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.transactions
  SET amount = round(p_target_net, 2),
      original_amount = round(p_target_net, 2),
      updated_at = now()
  WHERE id = v_tx.id AND partner_id = p_partner_id;

  IF v_tx.account_id IS NOT NULL AND round(p_balance_delta, 2) <> 0 THEN
    UPDATE public.finance_accounts
    SET current_balance = round(coalesce(v_balance, 0) + p_balance_delta, 2),
        updated_at = now()
    WHERE id = v_tx.account_id AND partner_id = p_partner_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'updated', true, 'transactionId', v_tx.id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_settlement_atomic(uuid, text, jsonb, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_settlement_atomic(uuid, text, jsonb, numeric)
  TO service_role;
REVOKE ALL ON FUNCTION public.refine_order_settlement_atomic(uuid, text, numeric, numeric, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refine_order_settlement_atomic(uuid, text, numeric, numeric, numeric)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
