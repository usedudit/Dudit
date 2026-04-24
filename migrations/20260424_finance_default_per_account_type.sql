-- Finance accounts: allow one default per (partner_id, type) for non–Mercado Pago accounts.
-- Replaces the previous single-default-per-partner index.

DROP INDEX IF EXISTS public.idx_finance_accounts_partner_default_non_mp;

-- Mercado Pago integration accounts should not compete as ERP "default".
UPDATE public.finance_accounts
SET is_default = FALSE
WHERE COALESCE(integration_source, '') = 'mercadopago';

-- Reset defaults for managed rows, then pick one default per partner + type (prefer active, oldest).
UPDATE public.finance_accounts fa
SET is_default = FALSE
WHERE COALESCE(fa.integration_source, '') <> 'mercadopago';

WITH pick AS (
  SELECT DISTINCT ON (partner_id, type) id
  FROM public.finance_accounts
  WHERE COALESCE(integration_source, '') <> 'mercadopago'
  ORDER BY
    partner_id,
    type,
    CASE WHEN is_active THEN 0 ELSE 1 END,
    created_at ASC,
    id ASC
)
UPDATE public.finance_accounts fa
SET is_default = TRUE
FROM pick
WHERE fa.id = pick.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_accounts_partner_type_default_non_mp
  ON public.finance_accounts (partner_id, type)
  WHERE is_default = TRUE
    AND COALESCE(integration_source, '') <> 'mercadopago';

-- New partner: only treat "no default cash" when inserting auto Caixa (not "no default of any type").
CREATE OR REPLACE FUNCTION public.create_default_cash_account_for_partner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.finance_accounts fa
    WHERE fa.partner_id = NEW.id
      AND LOWER(fa.name) = 'caixa'
  ) THEN
    INSERT INTO public.finance_accounts (
      partner_id,
      name,
      type,
      initial_balance,
      current_balance,
      is_active,
      is_default
    )
    VALUES (
      NEW.id,
      'Caixa',
      'cash',
      0,
      0,
      TRUE,
      NOT EXISTS (
        SELECT 1
        FROM public.finance_accounts fa_default
        WHERE fa_default.partner_id = NEW.id
          AND fa_default.type = 'cash'
          AND fa_default.is_default = TRUE
          AND COALESCE(fa_default.integration_source, '') <> 'mercadopago'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;
