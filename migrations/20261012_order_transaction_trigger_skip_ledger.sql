-- Evita transação de receita DUPLICADA quando o ledger da venda (settlement,
-- reference_note = 'sale-tx:<order_number>:*') já foi registrado pela aplicação
-- antes (ou junto com) a transição do pedido para 'paid'. Sem esta guarda, o
-- trigger inseria uma segunda linha de receita (kind nulo) que o Dashboard
-- Financeiro somava junto com o settlement.

CREATE OR REPLACE FUNCTION public.create_order_transaction_on_paid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_tx_id UUID;
  v_partner_id UUID;
  v_store_id UUID;
  v_paid_amount NUMERIC;
  v_total_amount NUMERIC;
  v_interest_total NUMERIC := 0;
  v_fee_total NUMERIC := 0;
  v_fixed_fee_total NUMERIC := 0;
  v_discount_total NUMERIC := 0;
  v_entry JSONB;
  v_entry_amount NUMERIC;
  v_entry_pm_id UUID;
  v_payment_line INT := 0;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- Only act when situation becomes paid (or partially_paid)
  IF NEW.situation NOT IN ('paid', 'partially_paid') THEN
    RETURN NEW;
  END IF;
  IF OLD.situation IN ('paid', 'partially_paid') THEN
    RETURN NEW;
  END IF;

  v_partner_id := NEW.partner_id;
  v_store_id := NEW.store_id;
  v_paid_amount := GREATEST(COALESCE(NEW.paid_amount, NEW.amount_paid, 0), 0);
  v_total_amount := GREATEST(COALESCE(NEW.total_amount, 0), 0);

  IF v_paid_amount <= 0 THEN
    RETURN NEW;
  END IF;

  -- Check if transaction already exists for this order (idempotency)
  IF EXISTS (SELECT 1 FROM public.transactions WHERE reference_note = NEW.id::text) THEN
    RETURN NEW;
  END IF;

  -- Idempotência com o ledger: se a aplicação já registrou a receita do pedido
  -- (settlement com reference_note 'sale-tx:<order_number>:*'), não duplicar.
  IF NEW.order_number IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.transactions
    WHERE partner_id = NEW.partner_id
      AND reference_note LIKE 'sale-tx:' || NEW.order_number || ':%'
  ) THEN
    RETURN NEW;
  END IF;

  -- Parse fee/interest/discount from payment_breakdown (used when order columns are not set, e.g. MP webhook)
  IF NEW.payment_breakdown IS NOT NULL AND jsonb_typeof(NEW.payment_breakdown) = 'array' AND jsonb_array_length(NEW.payment_breakdown) > 0 THEN
    SELECT
      COALESCE(SUM(GREATEST(COALESCE((e->>'interestAmount')::numeric, 0), 0)), 0),
      COALESCE(SUM(GREATEST(COALESCE((e->>'feeAmount')::numeric, 0), 0)), 0),
      COALESCE(SUM(GREATEST(COALESCE((e->>'fixedFeeAmount')::numeric, 0), 0)), 0),
      COALESCE(SUM(GREATEST(COALESCE((e->>'paymentMethodDiscountAmount')::numeric, 0), 0)), 0)
    INTO v_interest_total, v_fee_total, v_fixed_fee_total, v_discount_total
    FROM jsonb_array_elements(NEW.payment_breakdown) e
    WHERE COALESCE(e->>'feeBearer', 'merchant') = 'merchant';

    -- Add coupon + manual discounts from order columns
    v_discount_total := v_discount_total + GREATEST(COALESCE(NEW.discount_amount, 0), 0);
  ELSE
    -- Fallback to order columns when no breakdown
    v_interest_total := GREATEST(COALESCE(NEW.payment_method_interest_amount, 0), 0);
    v_fee_total := GREATEST(COALESCE(NEW.payment_method_fee_amount, 0), 0);
    v_fixed_fee_total := GREATEST(COALESCE(NEW.payment_method_fixed_fee_amount, 0), 0);
    v_discount_total := GREATEST(COALESCE(NEW.payment_method_discount_amount, 0), 0) + GREATEST(COALESCE(NEW.discount_amount, 0), 0);
  END IF;

  INSERT INTO public.transactions (
    partner_id, store_id, description, category,
    customer_id, contact_type,
    amount, due_date, payment_date, transaction_date,
    status, notes, payment_type,
    original_amount, interest_amount, fee_amount, discount_amount,
    transaction_type, origin, reference_note, account_id,
    payment_method_id, created_by_user_id
  ) VALUES (
    v_partner_id, v_store_id,
    COALESCE(NEW.order_number, NEW.id::text), 'Vendas',
    COALESCE(NEW.customer_id, NEW.buyer_id), 'customer',
    v_paid_amount, NULL, v_now, v_now,
    'paid', NULL,
    COALESCE(NEW.payment_method, 'Não informado'),
    v_total_amount,
    NULLIF(v_interest_total, 0),
    NULLIF(v_fee_total + v_fixed_fee_total, 0),
    NULLIF(v_discount_total, 0),
    'income', 'system', NEW.id::text, NEW.finance_account_id,
    NULL, NULL
  ) RETURNING id INTO v_tx_id;

  -- Create transaction_payments (one per breakdown entry with amount > 0)
  IF NEW.payment_breakdown IS NOT NULL AND jsonb_typeof(NEW.payment_breakdown) = 'array' AND jsonb_array_length(NEW.payment_breakdown) > 0 THEN
    FOR v_entry IN SELECT * FROM jsonb_array_elements(NEW.payment_breakdown)
    LOOP
      v_payment_line := v_payment_line + 1;
      v_entry_amount := ROUND(GREATEST(COALESCE((v_entry->>'amount')::numeric, (v_entry->>'effectiveAmount')::numeric, 0), 0), 2);
      IF v_entry_amount > 0 THEN
        IF (v_entry->>'paymentMethodId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          v_entry_pm_id := (v_entry->>'paymentMethodId')::uuid;
        ELSE
          v_entry_pm_id := NULL;
        END IF;

        INSERT INTO public.transaction_payments (
          partner_id, transaction_id, amount, base_amount,
          interest_amount, fee_amount, discount_amount, fee_bearer,
          payment_method_id,
          created_by_user_id, created_at, idempotency_key
        ) VALUES (
          v_partner_id, v_tx_id, v_entry_amount,
          GREATEST(COALESCE((v_entry->>'amountReceived')::numeric, v_entry_amount), 0),
          GREATEST(COALESCE((v_entry->>'interestAmount')::numeric, 0), 0),
          GREATEST(COALESCE((v_entry->>'feeAmount')::numeric, 0), 0) + GREATEST(COALESCE((v_entry->>'fixedFeeAmount')::numeric, 0), 0),
          GREATEST(COALESCE((v_entry->>'paymentMethodDiscountAmount')::numeric, 0), 0),
          COALESCE(v_entry->>'feeBearer', 'merchant'),
          v_entry_pm_id,
          NULL, v_now,
          v_partner_id::text || ':' || NEW.id::text || ':line' || v_payment_line::text || ':' || COALESCE(v_entry_pm_id::text, 'none')
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;
