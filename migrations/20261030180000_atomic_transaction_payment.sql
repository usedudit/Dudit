BEGIN;

-- Serializes partial and final payments for a financial transaction. The
-- payment ledger row, any settlement transaction, parent status/amount, and
-- finance account balance commit or roll back together.
CREATE OR REPLACE FUNCTION public.record_transaction_payment_atomic(
  p_partner_id uuid,
  p_transaction_id uuid,
  p_user_id uuid,
  p_payment_amount numeric,
  p_interest_amount numeric,
  p_discount_amount numeric,
  p_payment_method_id uuid,
  p_payment_type text,
  p_account_id uuid,
  p_idempotency_key text,
  p_require_installment boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_tx public.transactions%ROWTYPE;
  v_prior_payment public.transaction_payments%ROWTYPE;
  v_account_balance numeric;
  v_original numeric;
  v_paid_principal numeric := 0;
  v_paid_cash numeric := 0;
  v_total_interest numeric := 0;
  v_total_discount numeric := 0;
  v_remaining numeric;
  v_base numeric;
  v_paid_now numeric;
  v_paid_after numeric;
  v_fully_paid boolean;
  v_delta numeric := 0;
  v_settlement_id uuid;
  v_now timestamptz := now();
BEGIN
  IF p_partner_id IS NULL OR p_transaction_id IS NULL OR p_user_id IS NULL
     OR p_payment_amount IS NULL OR p_interest_amount IS NULL
     OR p_discount_amount IS NULL
     OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'Partner, transaction, user, amounts and idempotency key are required'
      USING ERRCODE = '22004';
  END IF;
  IF p_payment_amount <= 0 OR p_interest_amount < 0 OR p_discount_amount < 0 THEN
    RAISE EXCEPTION 'Payment must be positive and interest/discount cannot be negative'
      USING ERRCODE = '22023';
  END IF;

  SELECT t.* INTO v_tx
  FROM public.transactions t
  WHERE t.id = p_transaction_id
    AND t.partner_id = p_partner_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found for this partner' USING ERRCODE = '42501';
  END IF;
  IF p_require_installment AND v_tx.installment_group_id IS NULL THEN
    RAISE EXCEPTION 'Transaction is not an installment' USING ERRCODE = '22023';
  ELSIF NOT p_require_installment AND v_tx.installment_group_id IS NOT NULL THEN
    RAISE EXCEPTION 'Installments must use the installment payment flow' USING ERRCODE = '22023';
  END IF;

  -- Identical retries return the already committed result without a second
  -- ledger row or account delta.
  SELECT tp.* INTO v_prior_payment
  FROM public.transaction_payments tp
  WHERE tp.partner_id = p_partner_id
    AND tp.transaction_id = p_transaction_id
    AND tp.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    SELECT coalesce(sum(coalesce(tp.base_amount, tp.amount, 0)), 0),
           coalesce(sum(tp.amount), 0)
      INTO v_paid_principal, v_paid_cash
    FROM public.transaction_payments tp
    WHERE tp.partner_id = p_partner_id AND tp.transaction_id = p_transaction_id;
    SELECT t.id INTO v_settlement_id
    FROM public.transactions t
    WHERE t.partner_id = p_partner_id
      AND t.reference_note = CASE WHEN v_tx.reference_note IS NOT NULL
        THEN v_tx.reference_note || ':part:' || p_idempotency_key
        ELSE 'partial-tx:' || v_tx.id::text || ':' || p_idempotency_key
      END
      AND t.id <> v_tx.id
    LIMIT 1;
    RETURN jsonb_build_object(
      'success', true, 'alreadyProcessed', true,
      'originalAmount', abs(coalesce(v_tx.original_amount, v_tx.amount, 0)),
      'paidSoFar', greatest(0, v_paid_principal - coalesce(v_prior_payment.base_amount, v_prior_payment.amount, 0)),
      'remainingBefore', greatest(0, round(abs(coalesce(v_tx.original_amount, v_tx.amount, 0)) - (v_paid_principal - coalesce(v_prior_payment.base_amount, v_prior_payment.amount, 0)), 2)),
      'paidNow', v_prior_payment.amount,
      'principalApplied', coalesce(v_prior_payment.base_amount, v_prior_payment.amount),
      'remainingAfter', greatest(0, round(abs(coalesce(v_tx.original_amount, v_tx.amount, 0)) - v_paid_principal, 2)),
      'fullyPaid', lower(coalesce(v_tx.status, '')) = 'paid',
      'transactionId', v_tx.id,
      'settlementTransactionId', v_settlement_id
    );
  END IF;

  IF lower(coalesce(v_tx.status, '')) <> 'pending' THEN
    RAISE EXCEPTION 'Transaction is no longer pending' USING ERRCODE = '23514';
  END IF;
  IF p_account_id IS NULL THEN
    RAISE EXCEPTION 'A finance account is required for a new payment' USING ERRCODE = '22004';
  END IF;

  IF p_payment_method_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.payment_methods pm
    WHERE pm.id = p_payment_method_id
      AND pm.partner_id = p_partner_id
      AND (pm.store_id IS NULL OR pm.store_id = v_tx.store_id)
  ) THEN
    RAISE EXCEPTION 'Payment method is outside the partner/store context'
      USING ERRCODE = '42501';
  END IF;

  SELECT fa.current_balance INTO v_account_balance
  FROM public.finance_accounts fa
  WHERE fa.id = p_account_id
    AND fa.partner_id = p_partner_id
    AND fa.is_active = true
    AND (fa.store_id IS NULL OR fa.store_id = v_tx.store_id)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Finance account is outside the partner/store context or inactive'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    coalesce(sum(coalesce(tp.base_amount, tp.amount, 0)), 0),
    coalesce(sum(tp.amount), 0),
    coalesce(sum(tp.interest_amount), 0),
    coalesce(sum(tp.discount_amount), 0)
  INTO v_paid_principal, v_paid_cash, v_total_interest, v_total_discount
  FROM public.transaction_payments tp
  WHERE tp.partner_id = p_partner_id
    AND tp.transaction_id = p_transaction_id;

  v_original := abs(coalesce(v_tx.original_amount, v_tx.amount, 0));
  IF v_original <= 0 THEN
    RAISE EXCEPTION 'Transaction has no payable principal' USING ERRCODE = '23514';
  END IF;

  v_remaining := greatest(0, round(v_original - v_paid_principal, 2));
  v_base := round(least(v_remaining, p_payment_amount), 2);
  v_paid_now := round(v_base + p_interest_amount - p_discount_amount, 2);
  IF v_paid_now <= 0 THEN
    RAISE EXCEPTION 'Net payment must be greater than zero' USING ERRCODE = '23514';
  END IF;
  IF v_base < 0.0001 AND v_remaining > 0.01 THEN
    RAISE EXCEPTION 'A principal payment is required while principal remains' USING ERRCODE = '23514';
  END IF;

  v_fully_paid := v_paid_principal + v_base + 0.0001 >= v_original;
  v_paid_after := v_paid_principal + v_base;

  INSERT INTO public.transaction_payments (
    partner_id, transaction_id, store_id, amount, base_amount,
    interest_amount, discount_amount, payment_method_id,
    created_by_user_id, created_at, idempotency_key
  ) VALUES (
    p_partner_id, p_transaction_id, v_tx.store_id, v_paid_now, v_base,
    p_interest_amount, p_discount_amount, p_payment_method_id,
    p_user_id, v_now, p_idempotency_key
  );

  IF v_tx.transaction_type = 'income' THEN
    v_delta := abs(v_paid_now);
  ELSIF v_tx.transaction_type = 'expense' THEN
    v_delta := -abs(v_paid_now);
  ELSIF v_tx.transaction_type = 'adjustment' THEN
    v_delta := v_paid_now;
  ELSIF v_tx.transaction_type = 'refund' AND v_tx.refund_kind = 'expense_refund' THEN
    v_delta := abs(v_paid_now);
  ELSIF v_tx.transaction_type = 'refund' AND v_tx.refund_kind = 'revenue_refund' THEN
    v_delta := -abs(v_paid_now);
  END IF;
  IF round(v_delta, 2) <> 0 THEN
    UPDATE public.finance_accounts
    SET current_balance = round(coalesce(v_account_balance, 0) + v_delta, 2),
        updated_at = v_now
    WHERE id = p_account_id AND partner_id = p_partner_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Finance account disappeared during payment'
        USING ERRCODE = '40001';
    END IF;
  END IF;

  v_paid_cash := v_paid_cash + v_paid_now;
  v_total_interest := v_total_interest + p_interest_amount;
  v_total_discount := v_total_discount + p_discount_amount;
  IF v_fully_paid THEN
    UPDATE public.transactions
    SET status = 'paid',
        payment_date = v_now,
        amount = v_paid_cash,
        paid_amount = v_paid_cash,
        interest_amount = v_total_interest,
        discount_amount = v_total_discount,
        account_id = p_account_id,
        payment_method_id = coalesce(p_payment_method_id, payment_method_id),
        payment_type = coalesce(p_payment_type, payment_type),
        updated_at = v_now
    WHERE id = p_transaction_id AND partner_id = p_partner_id;
  ELSIF p_require_installment THEN
    UPDATE public.transactions
    SET payment_date = v_now,
        paid_amount = v_paid_cash,
        interest_amount = v_total_interest,
        discount_amount = v_total_discount,
        account_id = p_account_id,
        payment_method_id = coalesce(p_payment_method_id, payment_method_id),
        payment_type = coalesce(p_payment_type, payment_type),
        updated_at = v_now
    WHERE id = p_transaction_id AND partner_id = p_partner_id;
  ELSE
    INSERT INTO public.transactions (
      partner_id, store_id, description, category, category_id, subcategory_id,
      amount, original_amount, due_date, payment_date, status, payment_type,
      payment_method_id, account_id, transaction_type, contact_id, customer_id,
      contact_type, origin, kind, interest_amount, discount_amount, paid_amount,
      notes, reference_note, refund_kind, created_by_user_id
    ) VALUES (
      p_partner_id, v_tx.store_id, v_tx.description, v_tx.category,
      v_tx.category_id, v_tx.subcategory_id, v_paid_now, v_base, NULL, v_now,
      'paid', coalesce(p_payment_type, v_tx.payment_type), p_payment_method_id,
      p_account_id, v_tx.transaction_type, v_tx.contact_id, v_tx.customer_id,
      v_tx.contact_type, coalesce(v_tx.origin, 'manual'),
      coalesce(v_tx.kind, 'settlement'), p_interest_amount,
      p_discount_amount, v_paid_now, v_tx.notes,
      CASE WHEN v_tx.reference_note IS NOT NULL
        THEN v_tx.reference_note || ':part:' || p_idempotency_key
        ELSE 'partial-tx:' || v_tx.id::text || ':' || p_idempotency_key
      END,
      v_tx.refund_kind, p_user_id
    ) RETURNING id INTO v_settlement_id;

    UPDATE public.transactions
    SET amount = greatest(0, round(v_original - v_paid_after, 2)),
        original_amount = v_original,
        paid_amount = 0,
        account_id = p_account_id,
        payment_method_id = coalesce(p_payment_method_id, payment_method_id),
        payment_type = coalesce(p_payment_type, payment_type),
        updated_at = v_now
    WHERE id = p_transaction_id AND partner_id = p_partner_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'originalAmount', v_original,
    'paidSoFar', v_paid_principal,
    'remainingBefore', v_remaining,
    'paidNow', v_paid_now,
    'principalApplied', v_base,
    'remainingAfter', greatest(0, round(v_original - v_paid_after, 2)),
    'fullyPaid', v_fully_paid,
    'transactionId', v_tx.id,
    'settlementTransactionId', v_settlement_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_transaction_payment_atomic(uuid, uuid, uuid, numeric, numeric, numeric, uuid, text, uuid, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_transaction_payment_atomic(uuid, uuid, uuid, numeric, numeric, numeric, uuid, text, uuid, text, boolean)
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
