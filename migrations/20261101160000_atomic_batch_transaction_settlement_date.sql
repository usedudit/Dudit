-- Preserve the selected settlement date while routing batch settlement through
-- the existing atomic payment ledger and account-balance transaction.
CREATE OR REPLACE FUNCTION public.record_transaction_payment_with_date_atomic(
  p_partner_id UUID,
  p_transaction_id UUID,
  p_user_id UUID,
  p_payment_amount NUMERIC,
  p_interest_amount NUMERIC,
  p_discount_amount NUMERIC,
  p_payment_method_id UUID,
  p_payment_type TEXT,
  p_account_id UUID,
  p_idempotency_key TEXT,
  p_require_installment BOOLEAN,
  p_payment_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF p_payment_date IS NULL THEN
    RAISE EXCEPTION 'Data do pagamento obrigatória.' USING ERRCODE = '22004';
  END IF;

  v_result := public.record_transaction_payment_atomic(
    p_partner_id,
    p_transaction_id,
    p_user_id,
    p_payment_amount,
    p_interest_amount,
    p_discount_amount,
    p_payment_method_id,
    p_payment_type,
    p_account_id,
    p_idempotency_key,
    p_require_installment
  );

  IF COALESCE((v_result->>'fullyPaid')::BOOLEAN, FALSE)
     OR p_require_installment THEN
    UPDATE public.transactions
       SET payment_date = p_payment_date,
           updated_at = NOW()
     WHERE id = p_transaction_id
       AND partner_id = p_partner_id;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.record_transaction_payment_with_date_atomic(
  UUID, UUID, UUID, NUMERIC, NUMERIC, NUMERIC, UUID, TEXT, UUID, TEXT, BOOLEAN, DATE
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_transaction_payment_with_date_atomic(
  UUID, UUID, UUID, NUMERIC, NUMERIC, NUMERIC, UUID, TEXT, UUID, TEXT, BOOLEAN, DATE
) TO service_role;
