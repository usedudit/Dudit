BEGIN;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_partner_idempotency_key
  ON public.transactions(partner_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_order_cancellation_refunds_atomic(
  p_partner_id uuid,
  p_order_id uuid,
  p_account_id uuid,
  p_created_by_user_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_account_balance numeric;
  v_paid_amount numeric;
  v_already_refunded numeric;
  v_remaining numeric;
  v_requested numeric := 0;
  v_row jsonb;
  v_amount numeric;
  v_payment_type text;
  v_payment_method_id uuid;
  v_idempotency_key text;
  v_index integer := 0;
  v_existing_count integer := 0;
  v_created_count integer := 0;
  v_now timestamptz := now();
BEGIN
  IF p_partner_id IS NULL OR p_order_id IS NULL OR p_account_id IS NULL
     OR p_rows IS NULL OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Order refund fields are invalid' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_rows) < 1 OR jsonb_array_length(p_rows) > 20 THEN
    RAISE EXCEPTION 'Refund row count is outside the allowed range' USING ERRCODE = '22023';
  END IF;

  SELECT o.* INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id AND o.partner_id = p_partner_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found for this partner' USING ERRCODE = '42501';
  END IF;
  IF lower(coalesce(v_order.situation, '')) <> 'cancelled' THEN
    RAISE EXCEPTION 'Order must be cancelled before a cancellation refund' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_existing_count
  FROM generate_series(1, jsonb_array_length(p_rows)) AS seq(idx)
  JOIN public.transactions t
    ON t.partner_id = p_partner_id
   AND t.idempotency_key = 'order-cancel-refund:' || p_order_id::text || ':' || seq.idx::text;
  IF v_existing_count > 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'alreadyProcessed', true,
      'created', 0
    );
  END IF;

  v_paid_amount := round(greatest(0, coalesce(v_order.paid_amount, 0)), 2);
  SELECT round(coalesce(sum(t.amount), 0), 2) INTO v_already_refunded
  FROM public.transactions t
  WHERE t.partner_id = p_partner_id
    AND t.reference_note = p_order_id::text
    AND (t.kind = 'refund' OR t.refund_kind = 'revenue_refund')
    AND lower(coalesce(t.status, '')) <> 'cancelled';

  v_remaining := greatest(0, round(v_paid_amount - v_already_refunded, 2));
  IF v_remaining <= 0.009 THEN
    RETURN jsonb_build_object('success', true, 'alreadyProcessed', true, 'created', 0);
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_index := v_index + 1;
    IF jsonb_typeof(v_row) IS DISTINCT FROM 'object'
       OR nullif(btrim(v_row->>'amount'), '') IS NULL
       OR nullif(btrim(v_row->>'payment_type'), '') IS NULL THEN
      RAISE EXCEPTION 'Refund row is invalid' USING ERRCODE = '22023';
    END IF;

    v_amount := round((v_row->>'amount')::numeric, 2);
    v_payment_type := left(btrim(v_row->>'payment_type'), 120);
    v_payment_method_id := nullif(v_row->>'payment_method_id', '')::uuid;
    IF v_amount <= 0 OR v_payment_type = '' THEN
      RAISE EXCEPTION 'Refund amount or payment type is invalid' USING ERRCODE = '22023';
    END IF;
    v_requested := v_requested + v_amount;

    IF v_payment_method_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.payment_methods pm
      WHERE pm.id = v_payment_method_id
        AND pm.partner_id = p_partner_id
        AND (pm.store_id IS NULL OR pm.store_id = v_order.store_id)
    ) THEN
      RAISE EXCEPTION 'Refund payment method is outside the partner/store context'
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  IF v_requested > v_remaining + 0.009 THEN
    RAISE EXCEPTION 'Refund exceeds the remaining refundable amount' USING ERRCODE = '22023';
  END IF;

  SELECT fa.current_balance INTO v_account_balance
  FROM public.finance_accounts fa
  WHERE fa.id = p_account_id
    AND fa.partner_id = p_partner_id
    AND (fa.store_id IS NULL OR fa.store_id = v_order.store_id)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Refund account is outside the partner/store context'
      USING ERRCODE = '42501';
  END IF;

  v_index := 0;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_index := v_index + 1;
    v_amount := round((v_row->>'amount')::numeric, 2);
    v_payment_type := left(btrim(v_row->>'payment_type'), 120);
    v_payment_method_id := nullif(v_row->>'payment_method_id', '')::uuid;
    v_idempotency_key := 'order-cancel-refund:' || p_order_id::text || ':' || v_index::text;

    INSERT INTO public.transactions (
      partner_id, store_id, description, category, customer_id, contact_id,
      contact_type, amount, original_amount, due_date, payment_date,
      transaction_date, status, notes, payment_type, interest_amount,
      fee_amount, transaction_type, origin, refund_kind, reference_note,
      account_id, payment_method_id, kind, created_by_user_id, idempotency_key
    ) VALUES (
      p_partner_id, v_order.store_id,
      'Reembolso automático da venda ' || coalesce(v_order.order_number, v_order.id::text),
      'Reembolso', v_order.customer_id, NULL, 'customer',
      v_amount, v_amount, NULL, v_now, v_now, 'paid',
      'Gerado automaticamente ao cancelar venda.', v_payment_type, 0, 0,
      'refund', 'system', 'revenue_refund', v_order.id::text,
      p_account_id, v_payment_method_id, 'refund', p_created_by_user_id, v_idempotency_key
    );
    v_created_count := v_created_count + 1;
  END LOOP;

  UPDATE public.finance_accounts
  SET current_balance = round(coalesce(v_account_balance, 0) - v_requested, 2),
      updated_at = v_now
  WHERE id = p_account_id AND partner_id = p_partner_id;

  RETURN jsonb_build_object(
    'success', true,
    'alreadyProcessed', false,
    'created', v_created_count,
    'refunded', v_requested
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_cancellation_refunds_atomic(uuid, uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_cancellation_refunds_atomic(uuid, uuid, uuid, uuid, jsonb)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
