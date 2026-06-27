-- ============================================================
-- Migration: Add financial engine columns to transaction_payments
-- Stores per-payment-line financial details for auditability.
-- ============================================================

-- Step 1: Add columns to transaction_payments
ALTER TABLE public.transaction_payments
  ADD COLUMN IF NOT EXISTS adjustment_type TEXT
    CHECK (adjustment_type IS NULL OR adjustment_type IN ('none', 'discount', 'fee', 'interest'));

ALTER TABLE public.transaction_payments
  ADD COLUMN IF NOT EXISTS adjustment_percent NUMERIC(8,4);

ALTER TABLE public.transaction_payments
  ADD COLUMN IF NOT EXISTS net_amount NUMERIC(14,2);

ALTER TABLE public.transaction_payments
  ADD COLUMN IF NOT EXISTS fee_bearer TEXT
    CHECK (fee_bearer IS NULL OR fee_bearer IN ('merchant', 'customer'));

-- Step 2: Update trigger to fill adjustment_type from context
CREATE OR REPLACE FUNCTION public.fill_transaction_payment_adjustment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If adjustment_type is not provided, derive it
  IF NEW.adjustment_type IS NULL THEN
    IF NEW.discount_amount > 0 AND NEW.interest_amount = 0 THEN
      NEW.adjustment_type := 'discount';
    ELSIF NEW.interest_amount > 0 AND NEW.discount_amount = 0 THEN
      NEW.adjustment_type := 'fee';
    ELSE
      NEW.adjustment_type := 'none';
    END IF;
  END IF;

  -- If adjustment_percent is not provided, set to 0
  IF NEW.adjustment_percent IS NULL THEN
    NEW.adjustment_percent := 0;
  END IF;

  -- If net_amount is not provided, default to amount
  IF NEW.net_amount IS NULL THEN
    NEW.net_amount := NEW.amount;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transaction_payments_fill_adjustment ON public.transaction_payments;
CREATE TRIGGER trg_transaction_payments_fill_adjustment
  BEFORE INSERT ON public.transaction_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.fill_transaction_payment_adjustment();

-- Step 3: Backfill existing rows (safe defaults)
UPDATE public.transaction_payments
SET
  adjustment_type = CASE
    WHEN discount_amount > 0 AND interest_amount = 0 THEN 'discount'
    WHEN interest_amount > 0 AND discount_amount = 0 THEN 'fee'
    ELSE 'none'
  END,
  adjustment_percent = 0,
  net_amount = amount,
  fee_bearer = CASE
    WHEN interest_amount > 0 THEN 'customer'
    ELSE NULL
  END
WHERE adjustment_type IS NULL;

COMMENT ON COLUMN public.transaction_payments.adjustment_type IS 'discount | fee | interest | none';
COMMENT ON COLUMN public.transaction_payments.adjustment_percent IS 'The percentage that generated the adjustment';
COMMENT ON COLUMN public.transaction_payments.net_amount IS 'What the merchant effectively receives after fees';
COMMENT ON COLUMN public.transaction_payments.fee_bearer IS 'merchant | customer - who bears the fee';
