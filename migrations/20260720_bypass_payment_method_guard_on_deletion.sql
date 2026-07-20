-- Recreate prevent_cash_payment_method_delete function to support local session bypass
CREATE OR REPLACE FUNCTION public.prevent_cash_payment_method_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('dudit.bypass_payment_method_guard', true) = 'true' THEN
    RETURN OLD;
  END IF;

  IF COALESCE(OLD.type, '') = 'cash' OR lower(COALESCE(OLD.payment_type, '')) IN ('dinheiro', 'cash') THEN
    RAISE EXCEPTION 'Método Dinheiro é padrão do sistema e não pode ser excluído.';
  END IF;
  RETURN OLD;
END;
$$;
