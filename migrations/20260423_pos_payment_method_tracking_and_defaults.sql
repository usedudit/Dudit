-- Ensure PDV registers amounts by payment method and every partner has default cash method.

-- 1) Backfill a "Dinheiro" payment method for partners missing a cash method.
INSERT INTO public.payment_methods (
  partner_id,
  name,
  payment_type,
  type,
  is_active,
  is_default,
  max_installments,
  supports_installments
)
SELECT
  p.id,
  'Dinheiro',
  'dinheiro',
  'cash',
  TRUE,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.payment_methods pm_default
      WHERE pm_default.partner_id = p.id
        AND pm_default.is_default = TRUE
    ) THEN FALSE
    ELSE TRUE
  END,
  1,
  FALSE
FROM public.partners p
WHERE NOT EXISTS (
  SELECT 1
  FROM public.payment_methods pm
  WHERE pm.partner_id = p.id
    AND COALESCE(pm.type, '') = 'cash'
);

-- 2) Auto-create "Dinheiro" payment method on partner creation.
CREATE OR REPLACE FUNCTION public.create_default_cash_payment_method_for_partner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.payment_methods pm
    WHERE pm.partner_id = NEW.id
      AND COALESCE(pm.type, '') = 'cash'
  ) THEN
    INSERT INTO public.payment_methods (
      partner_id,
      name,
      payment_type,
      type,
      is_active,
      is_default,
      max_installments,
      supports_installments
    ) VALUES (
      NEW.id,
      'Dinheiro',
      'dinheiro',
      'cash',
      TRUE,
      NOT EXISTS (
        SELECT 1
        FROM public.payment_methods pm_default
        WHERE pm_default.partner_id = NEW.id
          AND pm_default.is_default = TRUE
      ),
      1,
      FALSE
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_default_cash_payment_method_for_partner ON public.partners;
CREATE TRIGGER trg_create_default_cash_payment_method_for_partner
AFTER INSERT ON public.partners
FOR EACH ROW
EXECUTE FUNCTION public.create_default_cash_payment_method_for_partner();

-- 3) Persist POS sale breakdown by payment method in cash_movements.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_movements_sale_method_unique
  ON public.cash_movements (partner_id, cash_session_id, reference_id, type, payment_method_id)
  WHERE type = 'sale' AND reference_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_pos_transaction_payment_to_cash_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx RECORD;
  v_sale RECORD;
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

DROP TRIGGER IF EXISTS trg_sync_pos_transaction_payment_to_cash_movement ON public.transaction_payments;
CREATE TRIGGER trg_sync_pos_transaction_payment_to_cash_movement
AFTER INSERT ON public.transaction_payments
FOR EACH ROW
EXECUTE FUNCTION public.sync_pos_transaction_payment_to_cash_movement();

-- 4) Backfill existing POS payment breakdowns into cash_movements.
INSERT INTO public.cash_movements (
  partner_id,
  cash_session_id,
  type,
  description,
  payment_method_id,
  amount,
  reference_id,
  created_by_user_id
)
SELECT
  s.partner_id,
  s.cash_session_id,
  'sale',
  'Venda PDV ' || UPPER(LEFT(s.id::text, 8)) || ' - PDV',
  tp.payment_method_id,
  ABS(COALESCE(tp.amount, 0)),
  s.id,
  tp.created_by_user_id
FROM public.sales s
JOIN public.transactions t
  ON t.partner_id = s.partner_id
 AND t.reference_note = s.id::text
 AND t.transaction_type = 'income'
 AND t.origin = 'system'
JOIN public.transaction_payments tp
  ON tp.partner_id = t.partner_id
 AND tp.transaction_id = t.id
LEFT JOIN public.cash_movements cm
  ON cm.partner_id = s.partner_id
 AND cm.cash_session_id = s.cash_session_id
 AND cm.reference_id = s.id
 AND cm.type = 'sale'
 AND (
   (cm.payment_method_id IS NULL AND tp.payment_method_id IS NULL)
   OR cm.payment_method_id = tp.payment_method_id
 )
WHERE s.cash_session_id IS NOT NULL
  AND cm.id IS NULL
  AND COALESCE(tp.amount, 0) > 0;
