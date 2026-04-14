-- Multiple payments per transaction/installment
CREATE TABLE IF NOT EXISTS public.transaction_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    payment_method_id UUID NULL REFERENCES public.payment_methods(id) ON DELETE SET NULL,
    created_by_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transaction_payments_partner_id
    ON public.transaction_payments(partner_id);

CREATE INDEX IF NOT EXISTS idx_transaction_payments_transaction_id
    ON public.transaction_payments(transaction_id);

ALTER TABLE public.transaction_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transaction_payments_select_own" ON public.transaction_payments;
CREATE POLICY "transaction_payments_select_own" ON public.transaction_payments
  FOR SELECT USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "transaction_payments_insert_own" ON public.transaction_payments;
CREATE POLICY "transaction_payments_insert_own" ON public.transaction_payments
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "transaction_payments_update_own" ON public.transaction_payments;
CREATE POLICY "transaction_payments_update_own" ON public.transaction_payments
  FOR UPDATE USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "transaction_payments_delete_own" ON public.transaction_payments;
CREATE POLICY "transaction_payments_delete_own" ON public.transaction_payments
  FOR DELETE USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
  );
