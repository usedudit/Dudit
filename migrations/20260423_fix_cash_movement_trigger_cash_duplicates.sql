-- Avoid duplicate cash movement rows when finalize_pos_sale already inserts cash entries.
-- Strategy:
-- - Trigger on transaction_payments writes only NON-cash methods to cash_movements.
-- - Cash/null methods keep using finalize_pos_sale insertion path.

CREATE OR REPLACE FUNCTION public.sync_pos_transaction_payment_to_cash_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx RECORD;
  v_sale RECORD;
  v_is_cash BOOLEAN := FALSE;
BEGIN
  SELECT
    t.id,
    t.partner_id,
    t.reference_note,
    t.transaction_type,
    t.origin
  INTO v_tx
  FROM public.transactions t
  WHERE t.id = NEW.transaction_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_tx.transaction_type <> 'income' OR v_tx.origin <> 'system' THEN
    RETURN NEW;
  END IF;

  IF v_tx.reference_note IS NULL THEN
    RETURN NEW;
  END IF;

  -- Cash methods are already inserted by finalize_pos_sale.
  IF NEW.payment_method_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.payment_methods pm
    WHERE pm.id = NEW.payment_method_id
      AND pm.partner_id = v_tx.partner_id
      AND pm.type = 'cash'
  ) INTO v_is_cash;

  IF v_is_cash THEN
    RETURN NEW;
  END IF;

  SELECT s.id, s.cash_session_id
  INTO v_sale
  FROM public.sales s
  WHERE s.id::text = v_tx.reference_note
    AND s.partner_id = v_tx.partner_id
    AND s.cash_session_id IS NOT NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.cash_movements (
    partner_id,
    cash_session_id,
    type,
    description,
    payment_method_id,
    amount,
    reference_id,
    created_by_user_id
  ) VALUES (
    v_tx.partner_id,
    v_sale.cash_session_id,
    'sale',
    'Venda PDV ' || UPPER(LEFT(v_sale.id::text, 8)) || ' - PDV',
    NEW.payment_method_id,
    ABS(COALESCE(NEW.amount, 0)),
    v_sale.id,
    NEW.created_by_user_id
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;
