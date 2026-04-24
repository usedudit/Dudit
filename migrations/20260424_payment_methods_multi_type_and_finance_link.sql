ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS default_finance_account_id UUID NULL REFERENCES public.finance_accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.payment_methods
  DROP CONSTRAINT IF EXISTS payment_methods_priority_check,
  ADD CONSTRAINT payment_methods_priority_check CHECK (priority >= 0);

CREATE INDEX IF NOT EXISTS idx_payment_methods_partner_type_active
  ON public.payment_methods (partner_id, type, is_active);

CREATE INDEX IF NOT EXISTS idx_payment_methods_default_finance_account_id
  ON public.payment_methods (default_finance_account_id);

WITH fallback_accounts AS (
  SELECT DISTINCT ON (fa.partner_id) fa.partner_id, fa.id
  FROM public.finance_accounts fa
  WHERE fa.is_active = TRUE
  ORDER BY fa.partner_id, fa.is_default DESC, fa.created_at ASC
)
UPDATE public.payment_methods pm
SET default_finance_account_id = fallback_accounts.id
FROM fallback_accounts
WHERE pm.partner_id = fallback_accounts.partner_id
  AND pm.default_finance_account_id IS NULL;
