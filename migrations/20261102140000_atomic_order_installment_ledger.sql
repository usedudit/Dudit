BEGIN;

ALTER TABLE public.installment_groups
  ADD COLUMN IF NOT EXISTS ledger_reference text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_installment_groups_partner_ledger_reference
  ON public.installment_groups(partner_id, ledger_reference)
  WHERE ledger_reference IS NOT NULL;

CREATE OR REPLACE FUNCTION public.upsert_order_installment_ledger_atomic(
  p_partner_id uuid,
  p_settlement_reference text,
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
  v_row record;
  v_tx public.transactions%ROWTYPE;
  v_group_id uuid;
  v_transaction_id uuid;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_count integer;
  v_balance numeric;
  v_target numeric;
  v_delta numeric;
BEGIN
  IF p_partner_id IS NULL OR p_settlement_reference IS NULL
     OR btrim(p_settlement_reference) = ''
     OR jsonb_typeof(p_group) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Order installment values are invalid' USING ERRCODE = '22023';
  END IF;
  v_count := jsonb_array_length(p_rows);
  IF v_count < 2 OR v_count > 48 THEN
    RAISE EXCEPTION 'Order installment count is outside the allowed range' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_partner_id::text || ':' || p_settlement_reference, 0)
  );

  SELECT g.* INTO v_group
  FROM jsonb_to_record(p_group) AS g(
    store_id uuid, description text, total_amount numeric,
    frequency text, start_date timestamptz, account_id uuid,
    payment_method_id uuid, order_id uuid, payment_id uuid, customer_id uuid
  );
  IF v_group.description IS NULL OR btrim(v_group.description) = ''
     OR v_group.total_amount IS NULL OR v_group.total_amount <= 0
     OR v_group.start_date IS NULL OR v_group.frequency IS DISTINCT FROM 'monthly' THEN
    RAISE EXCEPTION 'Order installment group metadata is invalid' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_rows) AS r(
      partner_id uuid, store_id uuid, amount numeric, status text,
      transaction_type text, kind text, installment_number integer,
      reference_note text, due_date date, account_id uuid
    )
    WHERE r.partner_id IS DISTINCT FROM p_partner_id
       OR r.store_id IS DISTINCT FROM v_group.store_id
       OR r.amount IS NULL OR r.amount <= 0
       OR r.status IS DISTINCT FROM 'pending'
       OR r.transaction_type IS DISTINCT FROM 'income'
       OR r.kind IS DISTINCT FROM 'settlement'
       OR r.installment_number IS NULL OR r.installment_number < 1 OR r.installment_number > v_count
       OR r.reference_note IS DISTINCT FROM p_settlement_reference || ':' || r.installment_number::text
       OR r.due_date IS NULL
       OR r.account_id IS DISTINCT FROM v_group.account_id
  ) OR (
    SELECT count(DISTINCT r.installment_number)
    FROM jsonb_to_recordset(p_rows) AS r(installment_number integer)
  ) <> v_count OR (
    SELECT round(sum(r.amount), 2)
    FROM jsonb_to_recordset(p_rows) AS r(amount numeric)
  ) <> round(v_group.total_amount, 2) THEN
    RAISE EXCEPTION 'Order installment rows do not match their group'
      USING ERRCODE = '22023';
  END IF;

  IF v_group.account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.finance_accounts fa
    WHERE fa.id = v_group.account_id AND fa.partner_id = p_partner_id
      AND (fa.store_id IS NULL OR fa.store_id = v_group.store_id)
  ) THEN
    RAISE EXCEPTION 'Finance account is outside the partner/store context'
      USING ERRCODE = '42501';
  END IF;

  SELECT ig.id INTO v_group_id
  FROM public.installment_groups ig
  WHERE ig.partner_id = p_partner_id AND ig.ledger_reference = p_settlement_reference
  FOR UPDATE;

  IF v_group_id IS NULL THEN
    -- Recover the original group when a previous version inserted some rows
    -- before failing, then attach the stable ledger reference to it.
    SELECT t.installment_group_id INTO v_group_id
    FROM public.transactions t
    JOIN jsonb_to_recordset(p_rows) AS r(installment_number integer, reference_note text)
      ON r.reference_note = t.reference_note
    WHERE t.partner_id = p_partner_id
      AND t.installment_group_id IS NOT NULL
    ORDER BY r.installment_number
    LIMIT 1;
    IF v_group_id IS NOT NULL THEN
      UPDATE public.installment_groups ig
      SET ledger_reference = p_settlement_reference
      WHERE ig.id = v_group_id AND ig.partner_id = p_partner_id
        AND ig.ledger_reference IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Existing installment group is already linked elsewhere'
          USING ERRCODE = '23505';
      END IF;
    ELSE
      INSERT INTO public.installment_groups (
        partner_id, store_id, description, total_amount, installments_count,
        frequency, "interval", interval_value, start_date, account_id,
        payment_method_id, order_id, payment_id, customer_id, ledger_reference
      ) VALUES (
        p_partner_id, v_group.store_id, v_group.description,
        round(v_group.total_amount, 2), v_count, 'monthly', 1, 1,
        v_group.start_date, v_group.account_id, v_group.payment_method_id,
        v_group.order_id, v_group.payment_id, v_group.customer_id,
        p_settlement_reference
      ) RETURNING id INTO v_group_id;
    END IF;
  END IF;

  UPDATE public.installment_groups ig
  SET store_id = v_group.store_id,
      description = v_group.description,
      total_amount = round(v_group.total_amount, 2),
      installments_count = v_count,
      frequency = 'monthly',
      "interval" = 1,
      interval_value = 1,
      start_date = v_group.start_date,
      account_id = v_group.account_id,
      payment_method_id = v_group.payment_method_id,
      order_id = v_group.order_id,
      payment_id = coalesce(v_group.payment_id, ig.payment_id),
      customer_id = v_group.customer_id
  WHERE ig.id = v_group_id AND ig.partner_id = p_partner_id;

  FOR v_row IN
    SELECT * FROM jsonb_to_recordset(p_rows) AS r(
      store_id uuid, description text, category text, customer_id uuid,
      contact_id uuid, contact_type text, amount numeric, due_date date,
      payment_date timestamptz, transaction_date timestamptz, status text,
      notes text, installment_number integer, total_installments integer,
      interest_amount numeric, fee_amount numeric, discount_amount numeric,
      payment_type text, payment_method_id uuid, transaction_type text,
      origin text, account_id uuid, kind text, payment_id uuid,
      reference_note text
    ) ORDER BY installment_number
  LOOP
    SELECT t.* INTO v_tx
    FROM public.transactions t
    WHERE t.partner_id = p_partner_id AND t.reference_note = v_row.reference_note
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      IF v_tx.transaction_type IS DISTINCT FROM 'income'
         OR v_tx.kind IS DISTINCT FROM 'settlement'
         OR v_tx.installment_group_id IS NOT NULL AND v_tx.installment_group_id <> v_group_id
         OR v_tx.account_id IS DISTINCT FROM v_row.account_id
         OR lower(coalesce(v_tx.status, '')) NOT IN ('pending', 'paid') THEN
        RAISE EXCEPTION 'Existing order installment conflicts with the ledger'
          USING ERRCODE = '23514';
      END IF;
      v_target := round(v_row.amount, 2);
      v_delta := CASE WHEN lower(coalesce(v_tx.status, '')) = 'paid'
        THEN round(v_target - coalesce(v_tx.amount, 0), 2) ELSE 0 END;

      IF v_delta <> 0 AND v_tx.account_id IS NOT NULL THEN
        SELECT fa.current_balance INTO v_balance
        FROM public.finance_accounts fa
        WHERE fa.id = v_tx.account_id AND fa.partner_id = p_partner_id
        FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Installment account is outside this partner' USING ERRCODE = '42501';
        END IF;
      END IF;

      UPDATE public.transactions t
      SET amount = v_target, original_amount = v_target,
          installment_group_id = v_group_id,
          total_installments = v_count,
          payment_id = coalesce(v_row.payment_id, t.payment_id),
          updated_at = now()
      WHERE t.id = v_tx.id AND t.partner_id = p_partner_id;

      IF v_delta <> 0 AND v_tx.account_id IS NOT NULL THEN
        UPDATE public.finance_accounts
        SET current_balance = round(coalesce(v_balance, 0) + v_delta, 2), updated_at = now()
        WHERE id = v_tx.account_id AND partner_id = p_partner_id;
      END IF;
      v_ids := array_append(v_ids, v_tx.id);
    ELSE
      INSERT INTO public.transactions (
        partner_id, store_id, description, category, customer_id, contact_id,
        contact_type, amount, original_amount, due_date, payment_date,
        transaction_date, status, notes, installment_number, total_installments,
        interest_amount, fee_amount, discount_amount, payment_type,
        payment_method_id, transaction_type, origin, account_id, kind,
        payment_id, installment_group_id, reference_note
      ) VALUES (
        p_partner_id, v_row.store_id, v_row.description, coalesce(v_row.category, 'Vendas'),
        v_row.customer_id, v_row.contact_id, v_row.contact_type,
        round(v_row.amount, 2), round(v_row.amount, 2), v_row.due_date,
        v_row.payment_date, v_row.transaction_date, 'pending', v_row.notes,
        v_row.installment_number, v_count, coalesce(v_row.interest_amount, 0),
        coalesce(v_row.fee_amount, 0), coalesce(v_row.discount_amount, 0),
        v_row.payment_type, v_row.payment_method_id, 'income',
        coalesce(v_row.origin, 'system'), v_row.account_id, 'settlement',
        v_row.payment_id, v_group_id, v_row.reference_note
      ) RETURNING id INTO v_transaction_id;
      v_ids := array_append(v_ids, v_transaction_id);
    END IF;
  END LOOP;

  IF cardinality(v_ids) <> v_count THEN
    RAISE EXCEPTION 'Not all order installment rows were created or recovered'
      USING ERRCODE = '40001';
  END IF;
  RETURN jsonb_build_object(
    'success', true, 'groupId', v_group_id,
    'transactionIds', to_jsonb(v_ids), 'createdCount', cardinality(v_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_order_installment_ledger_atomic(uuid, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_order_installment_ledger_atomic(uuid, text, jsonb, jsonb)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
