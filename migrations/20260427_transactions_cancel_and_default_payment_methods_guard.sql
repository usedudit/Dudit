-- Ensure transaction cancellation is persisted safely and default payment methods stay consistent.
-- 1) Backfill canonical `type` on payment methods.
-- 2) Ensure partner has default methods: Dinheiro, Pix, Cartão de Credito, Cartao de Debito.
-- 3) Prevent deleting cash method at DB level.

-- Backfill canonical type when legacy rows still rely only on payment_type.
UPDATE public.payment_methods
SET type = CASE
  WHEN COALESCE(type, '') <> '' THEN type
  WHEN lower(COALESCE(payment_type, '')) IN ('dinheiro', 'cash') THEN 'cash'
  WHEN lower(COALESCE(payment_type, '')) = 'pix' THEN 'pix'
  WHEN lower(COALESCE(payment_type, '')) IN ('credito', 'cartao_credito', 'credit_card') THEN 'credit_card'
  WHEN lower(COALESCE(payment_type, '')) IN ('debito', 'cartao_debito', 'debit_card') THEN 'debit_card'
  ELSE 'other'
END
WHERE COALESCE(type, '') = '';

-- Ensure default methods exist for every partner.
INSERT INTO public.payment_methods (partner_id, name, payment_type, type, is_active)
SELECT p.id, 'Dinheiro', 'dinheiro', 'cash', true
FROM public.partners p
WHERE NOT EXISTS (
  SELECT 1
  FROM public.payment_methods pm
  WHERE pm.partner_id = p.id
    AND COALESCE(pm.type, '') = 'cash'
);

INSERT INTO public.payment_methods (partner_id, name, payment_type, type, is_active)
SELECT p.id, 'Pix', 'pix', 'pix', true
FROM public.partners p
WHERE NOT EXISTS (
  SELECT 1
  FROM public.payment_methods pm
  WHERE pm.partner_id = p.id
    AND COALESCE(pm.type, '') = 'pix'
);

INSERT INTO public.payment_methods (partner_id, name, payment_type, type, is_active)
SELECT p.id, 'Cartão de Credito', 'credito', 'credit_card', true
FROM public.partners p
WHERE NOT EXISTS (
  SELECT 1
  FROM public.payment_methods pm
  WHERE pm.partner_id = p.id
    AND COALESCE(pm.type, '') = 'credit_card'
);

INSERT INTO public.payment_methods (partner_id, name, payment_type, type, is_active)
SELECT p.id, 'Cartao de Debito', 'debito', 'debit_card', true
FROM public.partners p
WHERE NOT EXISTS (
  SELECT 1
  FROM public.payment_methods pm
  WHERE pm.partner_id = p.id
    AND COALESCE(pm.type, '') = 'debit_card'
);

-- Block deleting cash payment methods (safety at DB level).
CREATE OR REPLACE FUNCTION public.prevent_cash_payment_method_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(OLD.type, '') = 'cash' OR lower(COALESCE(OLD.payment_type, '')) IN ('dinheiro', 'cash') THEN
    RAISE EXCEPTION 'Método Dinheiro é padrão do sistema e não pode ser excluído.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_cash_payment_method_delete ON public.payment_methods;
CREATE TRIGGER trg_prevent_cash_payment_method_delete
BEFORE DELETE ON public.payment_methods
FOR EACH ROW
EXECUTE FUNCTION public.prevent_cash_payment_method_delete();
