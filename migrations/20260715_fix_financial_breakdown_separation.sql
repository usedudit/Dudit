-- ============================================================
-- Migration: Separate interest, fees, fixed fees in all tables
-- and fix customer-borne fees being misclassified as interest.
-- ============================================================

-- 1. Add fee_amount and fee_bearer to transaction_payments
ALTER TABLE public.transaction_payments
  ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.transaction_payments
  ADD COLUMN IF NOT EXISTS fee_bearer TEXT NOT NULL DEFAULT 'merchant';

COMMENT ON COLUMN public.transaction_payments.fee_amount IS
  'Taxa percentual do metodo de pagamento (em dinheiro).';

COMMENT ON COLUMN public.transaction_payments.fee_bearer IS
  'Quem absorve a taxa: merchant (parceiro) ou customer (cliente).';

-- 2. Add separate interest/fee/fixed_fee columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method_interest_amount NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method_fee_amount NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method_fixed_fee_amount NUMERIC(14, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.orders.payment_method_interest_amount IS
  'Juros do meio de pagamento (separado de taxas).';

COMMENT ON COLUMN public.orders.payment_method_fee_amount IS
  'Taxa percentual do meio de pagamento (separado de juros).';

COMMENT ON COLUMN public.orders.payment_method_fixed_fee_amount IS
  'Taxa fixa do meio de pagamento (ex.: R$ 1,50 por transacao).';

COMMENT ON COLUMN public.orders.payment_method_extra_amount IS
  '[DEPRECATED] Acrescimo do meio de pagamento. Use payment_method_interest_amount + payment_method_fee_amount + payment_method_fixed_fee_amount.';

-- 3. Update trigger to handle new columns
CREATE OR REPLACE FUNCTION public.transaction_payments_fill_installment_breakdown()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.base_amount IS NULL THEN
    NEW.base_amount := NEW.amount;
  END IF;
  IF NEW.interest_amount IS NULL THEN
    NEW.interest_amount := 0;
  END IF;
  IF NEW.discount_amount IS NULL THEN
    NEW.discount_amount := 0;
  END IF;
  IF NEW.fee_amount IS NULL THEN
    NEW.fee_amount := 0;
  END IF;
  IF NEW.fee_bearer IS NULL THEN
    NEW.fee_bearer := 'merchant';
  END IF;
  RETURN NEW;
END;
$$;
