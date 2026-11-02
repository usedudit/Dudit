BEGIN;

-- Historical migrations disagree on transaction_type. Current financial flows
-- use adjustment and refund as well as income/expense/transfer. Preserve any
-- existing legacy rows while enforcing the supported values for new writes.
DO $$
DECLARE
  v_constraint record;
BEGIN
  FOR v_constraint IN
    SELECT c.conname
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class t ON t.oid = c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'transactions'
      AND c.contype = 'c'
      AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%transaction_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.transactions DROP CONSTRAINT %I', v_constraint.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_transaction_type_check
  CHECK (transaction_type IN ('income', 'expense', 'transfer', 'adjustment', 'refund'))
  NOT VALID;

-- Insert manual financial rows and apply their account balance effects as one
-- database transaction. The service-role-only RPC is called after Server Action
-- authorization and reference validation.
CREATE OR REPLACE FUNCTION public.create_manual_financial_transactions_atomic(
  p_partner_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_count integer;
  v_ids uuid[];
  v_account record;
BEGIN
  IF p_partner_id IS NULL OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Partner and transaction rows are required' USING ERRCODE = '22004';
  END IF;

  v_count := jsonb_array_length(p_rows);
  IF v_count < 1 OR v_count > 50 THEN
    RAISE EXCEPTION 'Transaction row count is outside the allowed range' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_rows) AS r(
      partner_id uuid, transaction_type text, status text, amount numeric,
      refund_kind text, account_id uuid, store_id uuid, description text
    )
    WHERE r.partner_id IS DISTINCT FROM p_partner_id
       OR r.transaction_type IS NULL
       OR r.transaction_type NOT IN ('income', 'expense', 'adjustment', 'refund')
       OR r.status IS NULL OR r.status NOT IN ('pending', 'paid')
       OR r.amount IS NULL OR abs(r.amount) > 99999999
       OR r.description IS NULL OR btrim(r.description) = ''
       OR (r.transaction_type = 'refund' AND r.refund_kind NOT IN ('expense_refund', 'revenue_refund'))
  ) THEN
    RAISE EXCEPTION 'Invalid or out-of-scope transaction row' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_rows) AS r(
      partner_id uuid, transaction_type text, status text, amount numeric,
      refund_kind text, account_id uuid, store_id uuid, description text
    )
    WHERE r.account_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.finance_accounts fa
        WHERE fa.id = r.account_id
          AND fa.partner_id = p_partner_id
          AND coalesce(fa.is_active, true)
          AND (fa.store_id IS NULL OR fa.store_id = r.store_id)
      )
  ) THEN
    RAISE EXCEPTION 'Finance account is outside the partner/store context or inactive'
      USING ERRCODE = '42501';
  END IF;

  -- Lock in stable order to reduce deadlocks for transfers across shared accounts.
  FOR v_account IN
    SELECT fa.id
    FROM public.finance_accounts fa
    WHERE fa.partner_id = p_partner_id
      AND fa.id IN (SELECT r.account_id FROM jsonb_to_recordset(p_rows) AS r(account_id uuid))
    ORDER BY fa.id
    FOR UPDATE OF fa
  LOOP
    NULL;
  END LOOP;

  WITH rows AS (
    SELECT *
    FROM jsonb_to_recordset(p_rows) AS r(
      partner_id uuid, store_id uuid, description text, category text,
      category_id uuid, subcategory_id uuid, account_id uuid, contact_id uuid,
      customer_id uuid, contact_type text, amount numeric, due_date date,
      payment_date timestamptz, transaction_date timestamptz, status text,
      notes text, payment_type text, payment_method_id uuid, original_amount numeric,
      interest_amount numeric, fee_amount numeric, transaction_type text,
      origin text, refund_kind text, reference_note text, created_by_user_id uuid,
      transfer_group_id uuid
    )
  ), inserted AS (
    INSERT INTO public.transactions (
      partner_id, store_id, description, category, category_id, subcategory_id,
      account_id, contact_id, customer_id, contact_type, amount, due_date,
      payment_date, transaction_date, status, notes, payment_type,
      payment_method_id, original_amount, interest_amount, fee_amount,
      transaction_type, origin, refund_kind, reference_note,
      created_by_user_id, transfer_group_id
    )
    SELECT
      p_partner_id, r.store_id, r.description, coalesce(r.category, 'Outros'),
      r.category_id, r.subcategory_id, r.account_id, r.contact_id,
      r.customer_id, r.contact_type, r.amount, r.due_date, r.payment_date,
      r.transaction_date, r.status, r.notes, r.payment_type,
      r.payment_method_id, r.original_amount, r.interest_amount,
      coalesce(r.fee_amount, 0), r.transaction_type, coalesce(r.origin, 'manual'),
      r.refund_kind, r.reference_note, r.created_by_user_id, r.transfer_group_id
    FROM rows r
    RETURNING id
  )
  SELECT array_agg(id) INTO v_ids FROM inserted;

  WITH rows AS (
    SELECT *
    FROM jsonb_to_recordset(p_rows) AS r(
      account_id uuid, status text, transaction_type text, amount numeric,
      refund_kind text
    )
  ), deltas AS (
    SELECT account_id,
      round(sum(CASE
        WHEN transaction_type = 'income' THEN round(abs(amount), 2)
        WHEN transaction_type = 'expense' THEN -round(abs(amount), 2)
        WHEN transaction_type = 'adjustment' THEN round(amount, 2)
        WHEN transaction_type = 'refund' AND refund_kind = 'expense_refund' THEN round(abs(amount), 2)
        WHEN transaction_type = 'refund' AND refund_kind = 'revenue_refund' THEN -round(abs(amount), 2)
        ELSE 0
      END), 2) AS delta
    FROM rows
    WHERE status = 'paid' AND account_id IS NOT NULL
    GROUP BY account_id
  )
  UPDATE public.finance_accounts fa
  SET current_balance = round(coalesce(fa.current_balance, 0) + d.delta, 2),
      updated_at = now()
  FROM deltas d
  WHERE fa.id = d.account_id
    AND fa.partner_id = p_partner_id;

  IF (SELECT count(*) FROM unnest(v_ids)) <> v_count THEN
    RAISE EXCEPTION 'Not all transaction rows were created' USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object('success', true, 'ids', to_jsonb(v_ids));
END;
$$;

REVOKE ALL ON FUNCTION public.create_manual_financial_transactions_atomic(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_manual_financial_transactions_atomic(uuid, jsonb)
  TO service_role;

COMMIT;
