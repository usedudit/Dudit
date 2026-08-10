-- Configuração independente de "quem paga o custo de parcelamento" (cartão de crédito).
-- merchant = Empresa absorve (desconta do lucro líquido, igual à absorção de taxas).
-- customer = Cliente paga (acrescenta no valor cobrado, não desconta do lucro).
-- Independente de fee_bearer. Default: merchant.

ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS installment_fee_bearer TEXT NOT NULL DEFAULT 'merchant';

ALTER TABLE public.payment_methods
  DROP CONSTRAINT IF EXISTS payment_methods_installment_fee_bearer_check,
  ADD CONSTRAINT payment_methods_installment_fee_bearer_check
    CHECK (installment_fee_bearer IN ('merchant', 'customer'));
