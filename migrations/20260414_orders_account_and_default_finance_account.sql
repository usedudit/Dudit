-- Finance accounts: remove description, support single default account per partner.
-- Orders: require an associated finance account for ERP sales.

ALTER TABLE public.finance_accounts
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.finance_accounts
  DROP COLUMN IF EXISTS description;

UPDATE public.finance_accounts
SET is_default = FALSE
WHERE is_default IS NULL;

WITH first_non_mp AS (
  SELECT DISTINCT ON (partner_id) id, partner_id
  FROM public.finance_accounts
  WHERE COALESCE(integration_source, '') <> 'mercadopago'
  ORDER BY partner_id, is_active DESC, created_at ASC, name ASC
)
UPDATE public.finance_accounts fa
SET is_default = TRUE
FROM first_non_mp pick
WHERE fa.id = pick.id
  AND NOT EXISTS (
    SELECT 1
    FROM public.finance_accounts existing
    WHERE existing.partner_id = pick.partner_id
      AND existing.is_default = TRUE
      AND COALESCE(existing.integration_source, '') <> 'mercadopago'
  );

DROP INDEX IF EXISTS idx_finance_accounts_partner_default_non_mp;
CREATE UNIQUE INDEX idx_finance_accounts_partner_default_non_mp
  ON public.finance_accounts (partner_id)
  WHERE is_default = TRUE
    AND COALESCE(integration_source, '') <> 'mercadopago';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS finance_account_id UUID REFERENCES public.finance_accounts(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_orders_finance_account_id
  ON public.orders (finance_account_id);
