-- Rebuild/normalize payment methods for robust calculation and UI.

ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS type TEXT,
  ADD COLUMN IF NOT EXISTS fee_percent NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS fee_fixed NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS fee_bearer TEXT DEFAULT 'merchant',
  ADD COLUMN IF NOT EXISTS supports_installments BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pix_key_type TEXT,
  ADD COLUMN IF NOT EXISTS pix_key TEXT,
  ADD COLUMN IF NOT EXISTS use_partner_pix_data BOOLEAN DEFAULT false;

UPDATE public.payment_methods
SET type = CASE payment_type
  WHEN 'pix' THEN 'pix'
  WHEN 'credito' THEN 'credit_card'
  WHEN 'debito' THEN 'debit_card'
  WHEN 'dinheiro' THEN 'cash'
  ELSE 'other'
END
WHERE type IS NULL;

UPDATE public.payment_methods
SET fee_percent = COALESCE(fee_percent, percentage_rate),
    fee_fixed = COALESCE(fee_fixed, fixed_amount),
    supports_installments = COALESCE(supports_installments, (COALESCE(max_installments, 1) > 1));

ALTER TABLE public.payment_methods
  ALTER COLUMN type SET NOT NULL,
  ALTER COLUMN fee_bearer SET DEFAULT 'merchant',
  ALTER COLUMN max_installments SET DEFAULT 1;

ALTER TABLE public.payment_methods
  DROP CONSTRAINT IF EXISTS payment_methods_type_check,
  DROP CONSTRAINT IF EXISTS payment_methods_fee_bearer_check,
  DROP CONSTRAINT IF EXISTS payment_methods_max_installments_check,
  DROP CONSTRAINT IF EXISTS payment_methods_fee_percent_check,
  DROP CONSTRAINT IF EXISTS payment_methods_discount_percent_check,
  DROP CONSTRAINT IF EXISTS payment_methods_pix_key_type_check,
  ADD CONSTRAINT payment_methods_type_check
    CHECK (type IN ('pix', 'credit_card', 'debit_card', 'cash', 'other')),
  ADD CONSTRAINT payment_methods_fee_bearer_check
    CHECK (fee_bearer IN ('merchant', 'customer')),
  ADD CONSTRAINT payment_methods_max_installments_check
    CHECK (max_installments BETWEEN 1 AND 24),
  ADD CONSTRAINT payment_methods_fee_percent_check
    CHECK (fee_percent IS NULL OR (fee_percent >= 0 AND fee_percent <= 100)),
  ADD CONSTRAINT payment_methods_discount_percent_check
    CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100)),
  ADD CONSTRAINT payment_methods_pix_key_type_check
    CHECK (pix_key_type IS NULL OR pix_key_type IN ('cpf', 'cnpj', 'email', 'phone', 'random'));

-- keep legacy columns synchronized for backward compatibility.
UPDATE public.payment_methods
SET payment_type = CASE type
  WHEN 'pix' THEN 'pix'
  WHEN 'credit_card' THEN 'credito'
  WHEN 'debit_card' THEN 'debito'
  WHEN 'cash' THEN 'dinheiro'
  ELSE 'outros'
END;

CREATE TABLE IF NOT EXISTS public.payment_method_installment_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_method_id UUID NOT NULL REFERENCES public.payment_methods(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL CHECK (installment_number >= 1 AND installment_number <= 24),
  fee_percent NUMERIC(8,4) NOT NULL CHECK (fee_percent >= 0 AND fee_percent <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(payment_method_id, installment_number)
);

CREATE INDEX IF NOT EXISTS idx_payment_method_installment_fees_method
  ON public.payment_method_installment_fees(payment_method_id, installment_number);

ALTER TABLE public.payment_method_installment_fees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_method_installment_fees_select ON public.payment_method_installment_fees;
CREATE POLICY payment_method_installment_fees_select ON public.payment_method_installment_fees
FOR SELECT USING (
  payment_method_id IN (
    SELECT id FROM public.payment_methods
    WHERE partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS payment_method_installment_fees_insert ON public.payment_method_installment_fees;
CREATE POLICY payment_method_installment_fees_insert ON public.payment_method_installment_fees
FOR INSERT WITH CHECK (
  payment_method_id IN (
    SELECT id FROM public.payment_methods
    WHERE partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS payment_method_installment_fees_update ON public.payment_method_installment_fees;
CREATE POLICY payment_method_installment_fees_update ON public.payment_method_installment_fees
FOR UPDATE USING (
  payment_method_id IN (
    SELECT id FROM public.payment_methods
    WHERE partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS payment_method_installment_fees_delete ON public.payment_method_installment_fees;
CREATE POLICY payment_method_installment_fees_delete ON public.payment_method_installment_fees
FOR DELETE USING (
  payment_method_id IN (
    SELECT id FROM public.payment_methods
    WHERE partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  )
);
