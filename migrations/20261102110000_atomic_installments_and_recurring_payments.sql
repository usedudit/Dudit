BEGIN;

CREATE OR REPLACE FUNCTION public.create_installment_group_atomic(
  p_partner_id uuid,
  p_user_id uuid,
  p_group jsonb,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_group record;
  v_group_id uuid;
  v_ids uuid[];
  v_count integer;
  v_balance numeric;
  v_delta numeric;
BEGIN
  IF p_partner_id IS NULL OR p_user_id IS NULL
     OR jsonb_typeof(p_group) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Partner, user, group and installment rows are required'
      USING ERRCODE = '22004';
  END IF;

  SELECT g.* INTO v_group
  FROM jsonb_to_record(p_group) AS g(
    store_id uuid, description text, total_amount numeric,
    installments_count integer, frequency text, interval_value integer,
    start_date timestamptz, category_id uuid, subcategory_id uuid,
    account_id uuid, contact_id uuid, payment_method_id uuid
  );
  v_count := jsonb_array_length(p_rows);
  IF v_count < 1 OR v_count > 48
     OR v_group.installments_count IS DISTINCT FROM v_count
     OR v_group.total_amount IS NULL OR v_group.total_amount <= 0
     OR v_group.description IS NULL OR btrim(v_group.description) = ''
     OR v_group.frequency NOT IN ('daily', 'weekly', 'monthly', 'yearly')
     OR coalesce(v_group.interval_value, 0) < 1
     OR v_group.start_date IS NULL THEN
    RAISE EXCEPTION 'Installment group values are invalid' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_rows) AS r(
      partner_id uuid, store_id uuid, amount numeric, status text,
      transaction_type text, installment_number integer, due_date date,
      account_id uuid
    )
    WHERE r.partner_id IS DISTINCT FROM p_partner_id
       OR r.amount IS NULL OR r.amount <= 0 OR r.amount > 99999999
       OR r.status IS NULL OR r.status NOT IN ('pending', 'paid')
       OR r.transaction_type IS NULL OR r.transaction_type NOT IN ('income', 'expense')
       OR r.installment_number IS NULL OR r.installment_number < 1 OR r.installment_number > v_count
       OR r.due_date IS NULL
       OR r.store_id IS DISTINCT FROM v_group.store_id
       OR r.account_id IS DISTINCT FROM v_group.account_id
  ) OR (
    SELECT count(DISTINCT r.installment_number)
    FROM jsonb_to_recordset(p_rows) AS r(installment_number integer)
  ) <> v_count OR (
    SELECT round(sum(r.amount), 2)
    FROM jsonb_to_recordset(p_rows) AS r(amount numeric)
  ) <> round(v_group.total_amount, 2) OR (
    SELECT count(*) FROM jsonb_to_recordset(p_rows) AS r(status text)
    WHERE r.status = 'paid'
  ) > 1 OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_rows) AS r(status text, installment_number integer)
    WHERE r.status = 'paid' AND r.installment_number <> 1
  ) THEN
    RAISE EXCEPTION 'Installment rows do not match their group' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_rows) AS r(account_id uuid, store_id uuid)
    WHERE r.account_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.finance_accounts fa
        WHERE fa.id = r.account_id AND fa.partner_id = p_partner_id
          AND coalesce(fa.is_active, true)
          AND (fa.store_id IS NULL OR fa.store_id = r.store_id)
      )
  ) THEN
    RAISE EXCEPTION 'Finance account is outside the partner/store context or inactive'
      USING ERRCODE = '42501';
  END IF;

  IF v_group.account_id IS NOT NULL THEN
    SELECT fa.current_balance INTO v_balance
    FROM public.finance_accounts fa
    WHERE fa.id = v_group.account_id AND fa.partner_id = p_partner_id
      AND coalesce(fa.is_active, true)
      AND (fa.store_id IS NULL OR fa.store_id = v_group.store_id)
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Finance account is outside the partner/store context or inactive'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.installment_groups (
    partner_id, store_id, description, total_amount, installments_count,
    frequency, "interval", interval_value, start_date, category_id,
    subcategory_id, account_id, contact_id, payment_method_id, created_by_user_id
  ) VALUES (
    p_partner_id, v_group.store_id, v_group.description, round(v_group.total_amount, 2),
    v_group.installments_count, v_group.frequency, v_group.interval_value,
    v_group.interval_value, v_group.start_date, v_group.category_id,
    v_group.subcategory_id, v_group.account_id, v_group.contact_id,
    v_group.payment_method_id, p_user_id
  ) RETURNING id INTO v_group_id;

  WITH rows AS (
    SELECT * FROM jsonb_to_recordset(p_rows) AS r(
      partner_id uuid, store_id uuid, description text, category text,
      category_id uuid, subcategory_id uuid, account_id uuid, contact_id uuid,
      customer_id uuid, contact_type text, amount numeric, due_date date,
      payment_date timestamptz, transaction_date timestamptz, status text,
      notes text, payment_type text, payment_method_id uuid, original_amount numeric,
      interest_amount numeric, fee_amount numeric, transaction_type text,
      origin text, installment_number integer
    )
  ), inserted AS (
    INSERT INTO public.transactions (
      partner_id, store_id, description, category, category_id, subcategory_id,
      account_id, contact_id, customer_id, contact_type, amount, due_date,
      payment_date, transaction_date, status, notes, payment_type,
      payment_method_id, original_amount, interest_amount, fee_amount,
      transaction_type, origin, installment_group_id, installment_number,
      created_by_user_id
    )
    SELECT p_partner_id, r.store_id, r.description, coalesce(r.category, 'Outros'),
      r.category_id, r.subcategory_id, r.account_id, r.contact_id, r.customer_id,
      r.contact_type, round(r.amount, 2), r.due_date, r.payment_date,
      r.transaction_date, r.status, r.notes, r.payment_type, r.payment_method_id,
      round(coalesce(r.original_amount, r.amount), 2), r.interest_amount,
      coalesce(r.fee_amount, 0), r.transaction_type, coalesce(r.origin, 'manual'),
      v_group_id, r.installment_number, p_user_id
    FROM rows r
    RETURNING id
  )
  SELECT array_agg(id) INTO v_ids FROM inserted;

  IF v_group.account_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_rows) AS r(status text)
    WHERE r.status = 'paid'
  ) THEN
    SELECT round(sum(CASE
      WHEN r.transaction_type = 'income' THEN round(abs(r.amount), 2)
      WHEN r.transaction_type = 'expense' THEN -round(abs(r.amount), 2)
      ELSE 0
    END), 2) INTO v_delta
    FROM jsonb_to_recordset(p_rows) AS r(
      status text, transaction_type text, amount numeric, account_id uuid
    )
    WHERE r.status = 'paid' AND r.account_id = v_group.account_id;

    IF coalesce(v_delta, 0) <> 0 THEN
      UPDATE public.finance_accounts
      SET current_balance = round(coalesce(v_balance, 0) + v_delta, 2), updated_at = now()
      WHERE id = v_group.account_id AND partner_id = p_partner_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'groupId', v_group_id, 'transactionIds', to_jsonb(v_ids),
    'createdCount', coalesce(cardinality(v_ids), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_installment_group_atomic(uuid, uuid, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_installment_group_atomic(uuid, uuid, jsonb, jsonb)
  TO service_role;

-- Create/settle a recurring occurrence in the same transaction. Locking the
-- recurring template serializes attempts for the same occurrence date; the
-- stable payment idempotency key protects retries in the payment ledger.
CREATE OR REPLACE FUNCTION public.record_recurring_occurrence_payment_atomic(
  p_partner_id uuid,
  p_recurring_id uuid,
  p_user_id uuid,
  p_due_date date,
  p_account_id uuid,
  p_payment_method_id uuid,
  p_payment_type text,
  p_category_name text,
  p_payment_amount numeric,
  p_interest_amount numeric,
  p_discount_amount numeric,
  p_transaction_date timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_rec public.recurring_transactions%ROWTYPE;
  v_tx public.transactions%ROWTYPE;
  v_tx_id uuid;
  v_result jsonb;
  v_idempotency_key text;
BEGIN
  IF p_partner_id IS NULL OR p_recurring_id IS NULL OR p_user_id IS NULL
     OR p_due_date IS NULL OR p_account_id IS NULL OR p_payment_amount IS NULL
     OR p_interest_amount IS NULL OR p_discount_amount IS NULL
     OR p_transaction_date IS NULL OR p_payment_amount <= 0
     OR p_interest_amount < 0 OR p_discount_amount < 0 THEN
    RAISE EXCEPTION 'Recurring payment fields are invalid' USING ERRCODE = '22023';
  END IF;

  SELECT r.* INTO v_rec
  FROM public.recurring_transactions r
  WHERE r.id = p_recurring_id AND r.partner_id = p_partner_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recurring transaction not found for this partner' USING ERRCODE = '42501';
  END IF;

  v_idempotency_key := 'recurring:' || p_recurring_id::text || ':' || p_due_date::text;

  SELECT t.* INTO v_tx
  FROM public.transactions t
  WHERE t.partner_id = p_partner_id
    AND t.recurring_id = p_recurring_id
    AND t.due_date = p_due_date
  FOR UPDATE;

  IF FOUND THEN
    IF lower(coalesce(v_tx.status, '')) = 'paid' THEN
      RETURN jsonb_build_object(
        'success', true, 'alreadyProcessed', true, 'transactionId', v_tx.id
      );
    END IF;
    IF lower(coalesce(v_tx.status, '')) <> 'pending' THEN
      RAISE EXCEPTION 'Recurring occurrence is no longer pending' USING ERRCODE = '23514';
    END IF;
    IF v_tx.transaction_type IS DISTINCT FROM v_rec.type THEN
      RAISE EXCEPTION 'Recurring occurrence type does not match its template' USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.transaction_payments tp
      WHERE tp.partner_id = p_partner_id AND tp.transaction_id = v_tx.id
    ) THEN
      UPDATE public.transactions
      SET amount = round(p_payment_amount, 2),
          original_amount = round(p_payment_amount, 2),
          paid_amount = 0,
          interest_amount = p_interest_amount,
          discount_amount = p_discount_amount,
          updated_at = now()
      WHERE id = v_tx.id AND partner_id = p_partner_id;
    END IF;
    v_tx_id := v_tx.id;
  ELSE
    INSERT INTO public.transactions (
      partner_id, store_id, description, category, category_id, subcategory_id,
      contact_id, contact_type, customer_id, amount, original_amount,
      due_date, payment_date, transaction_date, status, notes, payment_type,
      payment_method_id, transaction_type, account_id, origin, recurring_id,
      interest_amount, discount_amount, paid_amount, fee_amount, created_by_user_id
    ) VALUES (
      p_partner_id, v_rec.store_id, v_rec.description,
      coalesce(p_category_name, 'Outros'), v_rec.category_id, v_rec.subcategory_id,
      v_rec.contact_id, v_rec.contact_type, v_rec.customer_id,
      round(p_payment_amount, 2), round(p_payment_amount, 2), p_due_date,
      NULL, p_transaction_date, 'pending', NULL, p_payment_type,
      p_payment_method_id, v_rec.type, p_account_id, 'system', p_recurring_id,
      0, 0, 0, 0, p_user_id
    ) RETURNING id INTO v_tx_id;
  END IF;

  v_result := public.record_transaction_payment_atomic(
    p_partner_id, v_tx_id, p_user_id, p_payment_amount,
    p_interest_amount, p_discount_amount, p_payment_method_id,
    p_payment_type, p_account_id, v_idempotency_key, false
  );
  IF coalesce((v_result ->> 'fullyPaid')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Recurring occurrence payment did not settle the full occurrence'
      USING ERRCODE = '23514';
  END IF;

  RETURN v_result || jsonb_build_object('transactionId', v_tx_id);
END;
$$;

REVOKE ALL ON FUNCTION public.record_recurring_occurrence_payment_atomic(
  uuid, uuid, uuid, date, uuid, uuid, text, text, numeric, numeric, numeric, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_recurring_occurrence_payment_atomic(
  uuid, uuid, uuid, date, uuid, uuid, text, text, numeric, numeric, numeric, timestamptz
) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
