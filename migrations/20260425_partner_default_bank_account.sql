-- Ensure every partner has a default "Conta bancária" finance account.
-- Keeps partner onboarding account defaults managed in DB (single source of truth).

-- 1) Backfill: create missing bank accounts for existing partners
INSERT INTO public.finance_accounts (
  partner_id,
  name,
  type,
  initial_balance,
  current_balance,
  is_active,
  is_default
)
SELECT
  p.id,
  'Conta bancária',
  'bank',
  0,
  0,
  TRUE,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.finance_accounts fa_default
      WHERE fa_default.partner_id = p.id
        AND fa_default.type = 'bank'
        AND fa_default.is_default = TRUE
        AND COALESCE(fa_default.integration_source, '') <> 'mercadopago'
    )
      THEN FALSE
    ELSE TRUE
  END
FROM public.partners p
WHERE NOT EXISTS (
  SELECT 1
  FROM public.finance_accounts fa
  WHERE fa.partner_id = p.id
    AND fa.type = 'bank'
    AND COALESCE(fa.integration_source, '') <> 'mercadopago'
);

-- 2) Auto-create on partner creation
CREATE OR REPLACE FUNCTION public.create_default_bank_account_for_partner()
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
      AND fa.type = 'bank'
      AND COALESCE(fa.integration_source, '') <> 'mercadopago'
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
      'Conta bancária',
      'bank',
      0,
      0,
      TRUE,
      NOT EXISTS (
        SELECT 1
        FROM public.finance_accounts fa_default
        WHERE fa_default.partner_id = NEW.id
          AND fa_default.type = 'bank'
          AND fa_default.is_default = TRUE
          AND COALESCE(fa_default.integration_source, '') <> 'mercadopago'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_default_bank_account_for_partner ON public.partners;
CREATE TRIGGER trg_create_default_bank_account_for_partner
AFTER INSERT ON public.partners
FOR EACH ROW
EXECUTE FUNCTION public.create_default_bank_account_for_partner();
