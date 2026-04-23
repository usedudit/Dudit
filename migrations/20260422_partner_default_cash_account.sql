-- Ensure every partner has a default "Caixa" finance account for PDV.

-- 1) Backfill: create missing "Caixa" accounts for existing partners
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
  'Caixa',
  'cash',
  0,
  0,
  TRUE,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.finance_accounts fa_default
      WHERE fa_default.partner_id = p.id
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
    AND LOWER(fa.name) = 'caixa'
);

-- 2) Auto-create at partner creation time
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
          AND fa_default.is_default = TRUE
          AND COALESCE(fa_default.integration_source, '') <> 'mercadopago'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_default_cash_account_for_partner ON public.partners;
CREATE TRIGGER trg_create_default_cash_account_for_partner
AFTER INSERT ON public.partners
FOR EACH ROW
EXECUTE FUNCTION public.create_default_cash_account_for_partner();
