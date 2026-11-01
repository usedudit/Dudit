-- Close a cash session under the same row lock used by cash movement RPCs.
-- This prevents movements from being omitted from the closing balance.
CREATE OR REPLACE FUNCTION public.erp_close_cash_session_atomic(
  p_partner_id UUID,
  p_cash_session_id UUID,
  p_actor_user_id UUID,
  p_counted_by_method JSONB,
  p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_session public.cash_sessions%ROWTYPE;
  v_cash_sales NUMERIC(14,2) := 0;
  v_deposits NUMERIC(14,2) := 0;
  v_withdrawals NUMERIC(14,2) := 0;
  v_refunds NUMERIC(14,2) := 0;
  v_counted_cash NUMERIC(14,2) := 0;
  v_calculated NUMERIC(14,2) := 0;
  v_closing NUMERIC(14,2) := 0;
  v_difference NUMERIC(14,2) := 0;
  v_invalid_count INTEGER := 0;
  v_has_counts BOOLEAN := FALSE;
BEGIN
  IF p_partner_id IS NULL OR p_cash_session_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Dados obrigatórios ausentes para fechar o caixa.';
  END IF;

  IF p_counted_by_method IS NOT NULL THEN
    IF jsonb_typeof(p_counted_by_method) <> 'array'
       OR jsonb_array_length(p_counted_by_method) > 100 THEN
      RAISE EXCEPTION 'Contagem de pagamentos inválida.';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_counted_by_method) AS entry
      WHERE jsonb_typeof(entry->'amount') IS DISTINCT FROM 'number'
         OR CASE
              WHEN jsonb_typeof(entry->'amount') = 'number'
              THEN (entry->>'amount')::NUMERIC < 0
              ELSE FALSE
            END
    ) THEN
      RAISE EXCEPTION 'Os valores contados precisam ser números não negativos.';
    END IF;

    SELECT COUNT(*)
      INTO v_invalid_count
      FROM jsonb_to_recordset(p_counted_by_method)
        AS counted("paymentMethodId" UUID, amount NUMERIC)
      LEFT JOIN public.payment_methods AS pm
        ON pm.id = counted."paymentMethodId"
       AND pm.partner_id = p_partner_id
     WHERE counted."paymentMethodId" IS NOT NULL
       AND pm.id IS NULL;

    IF v_invalid_count > 0 THEN
      RAISE EXCEPTION 'Um método de pagamento não pertence a este parceiro.';
    END IF;

    v_has_counts := jsonb_array_length(p_counted_by_method) > 0;
  END IF;

  SELECT *
    INTO v_session
    FROM public.cash_sessions AS cs
   WHERE cs.id = p_cash_session_id
     AND cs.partner_id = p_partner_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão de caixa não encontrada.';
  END IF;
  IF v_session.status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'Este caixa já foi fechado.';
  END IF;

  SELECT
    COALESCE(SUM(cm.amount) FILTER (
      WHERE cm.type = 'sale'
        AND (cm.payment_method_id IS NULL OR pm.type = 'cash')
    ), 0),
    COALESCE(SUM(cm.amount) FILTER (WHERE cm.type = 'deposit'), 0),
    COALESCE(SUM(cm.amount) FILTER (WHERE cm.type = 'withdrawal'), 0),
    COALESCE(SUM(cm.amount) FILTER (WHERE cm.type = 'refund'), 0)
    INTO v_cash_sales, v_deposits, v_withdrawals, v_refunds
    FROM public.cash_movements AS cm
    LEFT JOIN public.payment_methods AS pm
      ON pm.id = cm.payment_method_id
     AND pm.partner_id = p_partner_id
   WHERE cm.partner_id = p_partner_id
     AND cm.cash_session_id = p_cash_session_id
     AND cm.reversed_at IS NULL;

  v_calculated := ROUND(
    COALESCE(v_session.initial_amount, 0)
      + v_cash_sales
      + v_deposits
      - v_withdrawals
      - v_refunds,
    2
  );

  IF v_has_counts THEN
    SELECT COALESCE(SUM(counted.amount) FILTER (
      WHERE counted."paymentMethodId" IS NULL OR pm.type = 'cash'
    ), 0)
      INTO v_counted_cash
      FROM jsonb_to_recordset(p_counted_by_method)
        AS counted("paymentMethodId" UUID, amount NUMERIC)
      LEFT JOIN public.payment_methods AS pm
        ON pm.id = counted."paymentMethodId"
       AND pm.partner_id = p_partner_id;

    v_closing := ROUND(
      COALESCE(v_session.initial_amount, 0)
        + v_counted_cash
        + v_deposits
        - v_withdrawals
        - v_refunds,
      2
    );
  ELSE
    v_closing := v_calculated;
  END IF;

  v_difference := ROUND(v_closing - v_calculated, 2);

  UPDATE public.cash_sessions
     SET closing_amount = v_closing,
         calculated_amount = v_calculated,
         difference_amount = v_difference,
         closed_at = NOW(),
         closed_by_user_id = p_actor_user_id,
         status = 'closed',
         notes = COALESCE(NULLIF(BTRIM(p_notes), ''), v_session.notes),
         updated_at = NOW(),
         closing_method_counts = CASE
           WHEN v_has_counts THEN p_counted_by_method
           ELSE NULL
         END
   WHERE id = p_cash_session_id
     AND partner_id = p_partner_id
     AND status = 'open'
  RETURNING * INTO v_session;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'O caixa mudou durante o fechamento. Atualize e tente novamente.';
  END IF;

  RETURN jsonb_build_object(
    'session', to_jsonb(v_session),
    'closing_amount', v_closing,
    'calculated_amount', v_calculated,
    'difference_amount', v_difference
  );
END;
$$;

REVOKE ALL ON FUNCTION public.erp_close_cash_session_atomic(UUID, UUID, UUID, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_close_cash_session_atomic(UUID, UUID, UUID, JSONB, TEXT)
  TO service_role;
