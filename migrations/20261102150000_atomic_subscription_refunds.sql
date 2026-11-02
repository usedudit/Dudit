BEGIN;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_partner_idempotency_key
  ON public.transactions(partner_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reverse_subscription_cycle_financials_atomic(
  p_partner_id uuid,
  p_order_id uuid,
  p_payment_id text,
  p_event_status text,
  p_requested_refund_total numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_account_balance numeric;
  v_idempotency_key text;
  v_existing_id uuid;
  v_existing_amount numeric;
  v_paid_amount numeric;
  v_already_refunded numeric;
  v_requested_total numeric;
  v_refund_amount numeric;
  v_remaining numeric;
  v_refund_id uuid;
  v_order_cancelled boolean := false;
  v_now timestamptz := now();
BEGIN
  IF p_partner_id IS NULL OR p_order_id IS NULL OR p_payment_id IS NULL
     OR btrim(p_payment_id) = '' OR p_event_status IS NULL
     OR lower(p_event_status) NOT IN ('refunded', 'charged_back')
     OR p_requested_refund_total IS NULL OR p_requested_refund_total < 0 THEN
    RAISE EXCEPTION 'Subscription refund values are invalid' USING ERRCODE = '22023';
  END IF;

  v_idempotency_key := 'mp-subscription-reversal:' || btrim(p_payment_id) || ':' ||
    lower(p_event_status) || ':' || round(p_requested_refund_total, 2)::text;

  SELECT o.* INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id AND o.partner_id = p_partner_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'reversed', 0, 'orderCancelled', false);
  END IF;

  SELECT t.id, t.amount INTO v_existing_id, v_existing_amount
  FROM public.transactions t
  WHERE t.partner_id = p_partner_id AND t.idempotency_key = v_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true, 'alreadyProcessed', true,
      'reversed', coalesce(v_existing_amount, 0),
      'orderCancelled', lower(coalesce(v_order.situation, '')) = 'cancelled',
      'transactionId', v_existing_id
    );
  END IF;

  v_order_cancelled := lower(coalesce(v_order.situation, '')) = 'cancelled';

  v_paid_amount := round(greatest(0, coalesce(v_order.paid_amount, 0)), 2);
  IF v_paid_amount <= 0 THEN
    RETURN jsonb_build_object('success', true, 'reversed', 0, 'orderCancelled', false);
  END IF;

  SELECT round(coalesce(sum(t.amount), 0), 2) INTO v_already_refunded
  FROM public.transactions t
  WHERE t.partner_id = p_partner_id
    AND t.reference_note = p_order_id::text
    AND t.kind = 'refund'
    AND lower(coalesce(t.status, '')) <> 'cancelled';

  -- Mercado Pago's transaction_amount_refunded is cumulative. Subtract the
  -- amount already represented locally before writing a new refund row.
  v_requested_total := least(v_paid_amount, round(p_requested_refund_total, 2));
  v_refund_amount := greatest(0, round(v_requested_total - v_already_refunded, 2));

  IF v_refund_amount > 0 THEN
    IF v_order.finance_account_id IS NOT NULL THEN
      SELECT fa.current_balance INTO v_account_balance
      FROM public.finance_accounts fa
      WHERE fa.id = v_order.finance_account_id
        AND fa.partner_id = p_partner_id
        AND (fa.store_id IS NULL OR fa.store_id = v_order.store_id)
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Refund account is outside the partner/store context'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    INSERT INTO public.transactions (
      partner_id, store_id, description, category, customer_id, contact_id,
      contact_type, amount, original_amount, due_date, payment_date,
      transaction_date, status, notes, payment_type, interest_amount,
      fee_amount, transaction_type, origin, refund_kind, reference_note,
      account_id, payment_method_id, kind, idempotency_key
    ) VALUES (
      p_partner_id, v_order.store_id,
      'Reembolso automático da venda ' || coalesce(v_order.order_number, v_order.id::text),
      'Reembolso', v_order.customer_id, NULL, 'customer',
      v_refund_amount, v_refund_amount, NULL, v_now, v_now, 'paid',
      'Estorno recebido do Mercado Pago (pagamento #' || btrim(p_payment_id) || ').',
      coalesce(v_order.payment_method, 'Reembolso'), 0, 0,
      'refund', 'system', 'revenue_refund', v_order.id::text,
      v_order.finance_account_id, NULL, 'refund', v_idempotency_key
    ) RETURNING id INTO v_refund_id;

    IF v_order.finance_account_id IS NOT NULL THEN
      UPDATE public.finance_accounts
      SET current_balance = round(coalesce(v_account_balance, 0) - v_refund_amount, 2),
          updated_at = v_now
      WHERE id = v_order.finance_account_id AND partner_id = p_partner_id;
    END IF;
  END IF;

  v_remaining := greatest(0, round(v_paid_amount - v_already_refunded - v_refund_amount, 2));
  IF v_remaining <= 0.009 AND NOT v_order_cancelled THEN
    UPDATE public.orders
    SET situation = 'cancelled',
        previous_situation_before_cancel = v_order.situation,
        notes = CASE
          WHEN nullif(btrim(v_order.notes), '') IS NOT NULL
            THEN v_order.notes || ' | Cancelado após estorno do Mercado Pago (pagamento #' || btrim(p_payment_id) || ').'
          ELSE 'Cancelado após estorno do Mercado Pago (pagamento #' || btrim(p_payment_id) || ').'
        END
    WHERE id = p_order_id AND partner_id = p_partner_id;
    v_order_cancelled := true;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'alreadyProcessed', false,
    'reversed', v_refund_amount, 'orderCancelled', v_order_cancelled,
    'transactionId', v_refund_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_subscription_cycle_financials_atomic(uuid, uuid, text, text, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_subscription_cycle_financials_atomic(uuid, uuid, text, text, numeric)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
