-- Parcela: juros, desconto e valor principal aplicado por registro de pagamento.
-- base_amount = parcela do valor (principal) pago; amount = efeito de caixa (base + juros - desconto)

ALTER TABLE public.transaction_payments
  ADD COLUMN IF NOT EXISTS base_amount NUMERIC(14, 2) NULL,
  ADD COLUMN IF NOT EXISTS interest_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0;

UPDATE public.transaction_payments
SET
  base_amount = amount,
  interest_amount = 0,
  discount_amount = 0
WHERE base_amount IS NULL;

ALTER TABLE public.transaction_payments
  ALTER COLUMN base_amount SET NOT NULL;

ALTER TABLE public.transaction_payments
  ADD CONSTRAINT transaction_payments_base_non_negative CHECK (base_amount >= 0);

-- Inserts legados (ex.: RPC do PDV) só informam amount: espelha em base_amount.
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transaction_payments_fill_installment_breakdown ON public.transaction_payments;
CREATE TRIGGER trg_transaction_payments_fill_installment_breakdown
BEFORE INSERT OR UPDATE ON public.transaction_payments
FOR EACH ROW
EXECUTE FUNCTION public.transaction_payments_fill_installment_breakdown();

COMMENT ON COLUMN public.transaction_payments.base_amount IS
  'Parte do pagamento que abate o saldo de principal da parcela.';

COMMENT ON COLUMN public.transaction_payments.interest_amount IS
  'Juros (em dinheiro) no pagamento, não abate principal.';

COMMENT ON COLUMN public.transaction_payments.discount_amount IS
  'Desconto em dinheiro; reduz o efeito de caixa, não o principal.';
