-- Fix cash manual movement RPCs:
-- 1) use timestamptz instead of text for payment_date/transaction_date
-- 2) make description optional with sensible defaults

CREATE OR REPLACE FUNCTION public.erp_create_cash_manual_movement(
  p_partner_id UUID,
  p_cash_session_id UUID,
  p_movement_type TEXT,
  p_amount NUMERIC,
  p_description TEXT,
  p_cash_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_sess RECORD;
  v_amount NUMERIC;
  v_desc TEXT;
  v_mid UUID;
  v_tx UUID;
  v_now TIMESTAMPTZ := NOW();
  v_balance NUMERIC;
  v_tt TEXT;
  v_notes TEXT;
  v_can BOOLEAN;
BEGIN
  IF p_movement_type NOT IN ('withdrawal', 'deposit') THEN
    RAISE EXCEPTION 'Tipo de movimentação inválido.';
  END IF;

  v_amount := ROUND(GREATEST(COALESCE(p_amount, 0), 0), 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Informe um valor maior que zero.';
  END IF;

  v_desc := NULLIF(TRIM(COALESCE(p_description, '')), '');
  IF v_desc IS NULL THEN
    v_desc := CASE WHEN p_movement_type = 'withdrawal' THEN 'Sangria de caixa' ELSE 'Reforço de caixa' END;
  END IF;
  IF LENGTH(v_desc) > 2000 THEN
    v_desc := LEFT(v_desc, 2000);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.finance_accounts fa
    WHERE fa.id = p_cash_account_id
      AND fa.partner_id = p_partner_id
      AND fa.is_active IS TRUE
      AND fa.type = 'cash'
  ) THEN
    RAISE EXCEPTION 'Conta de caixa inválida.';
  END IF;

  SELECT cs.* INTO v_sess
    FROM public.cash_sessions cs
   WHERE cs.id = p_cash_session_id
     AND cs.partner_id = p_partner_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão de caixa não encontrada.';
  END IF;

  IF v_sess.status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'O caixa não está aberto.';
  END IF;

  v_can := (v_sess.opened_by_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.partners p WHERE p.id = p_partner_id AND p.user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.partner_users pu
      WHERE pu.partner_id = p_partner_id
        AND pu.user_id = auth.uid()
        AND upper(COALESCE(pu.role::text, '')) IN ('OWNER', 'ADMIN')
    );
  IF NOT v_can THEN
    RAISE EXCEPTION 'Sem permissão para movimentar este caixa.';
  END IF;

  SELECT
    COALESCE(v_sess.initial_amount, 0)
    + COALESCE(SUM(
        CASE WHEN cm.reversed_at IS NULL AND cm.type = 'sale' AND (
          cm.payment_method_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.payment_methods pm
            WHERE pm.id = cm.payment_method_id
              AND pm.partner_id = p_partner_id
              AND pm.type = 'cash'
          )
        ) THEN cm.amount ELSE 0 END
      ), 0)
    + COALESCE(SUM(CASE WHEN cm.reversed_at IS NULL AND cm.type = 'deposit' THEN cm.amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN cm.reversed_at IS NULL AND cm.type = 'withdrawal' THEN cm.amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN cm.reversed_at IS NULL AND cm.type = 'refund' THEN cm.amount ELSE 0 END), 0)
  INTO v_balance
  FROM public.cash_movements cm
  WHERE cm.cash_session_id = p_cash_session_id
    AND cm.partner_id = p_partner_id;

  IF p_movement_type = 'withdrawal' AND v_balance + 0.0001 < v_amount THEN
    RAISE EXCEPTION 'Saldo em dinheiro insuficiente para esta sangria.';
  END IF;

  INSERT INTO public.cash_movements (
    partner_id, cash_session_id, type, description,
    payment_method_id, amount, reference_id,
    created_by_user_id
  ) VALUES (
    p_partner_id, p_cash_session_id, p_movement_type, v_desc,
    NULL, v_amount, NULL,
    auth.uid()
  ) RETURNING id INTO v_mid;

  IF p_movement_type = 'withdrawal' THEN
    v_tt := 'expense';
    v_notes := 'Sangria de caixa registrada no PDV.';
  ELSE
    v_tt := 'income';
    v_notes := 'Reforço de caixa registrado no PDV.';
  END IF;

  INSERT INTO public.transactions (
    partner_id, description, category,
    contact_id, contact_type,
    amount, due_date, payment_date, transaction_date,
    status, notes, payment_type, original_amount, interest_amount, fee_amount,
    transaction_type, origin, reference_note, account_id,
    payment_method_id, created_by_user_id
  ) VALUES (
    p_partner_id,
    CASE WHEN p_movement_type = 'withdrawal' THEN 'Sangria de caixa' ELSE 'Reforço de caixa' END,
    'Caixa PDV',
    NULL, NULL,
    v_amount, NULL, v_now, v_now,
    'paid',
    v_notes,
    'Caixa',
    v_amount, NULL, 0,
    v_tt, 'system', 'cash_mv:' || v_mid::text, p_cash_account_id,
    NULL, auth.uid()
  ) RETURNING id INTO v_tx;

  UPDATE public.cash_movements
     SET financial_transaction_id = v_tx
   WHERE id = v_mid;

  PERFORM public.apply_account_balance_delta(
    p_cash_account_id,
    p_partner_id,
    CASE WHEN v_tt = 'income' THEN v_amount ELSE -v_amount END
  );

  RETURN jsonb_build_object('movement_id', v_mid, 'transaction_id', v_tx);
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_reverse_cash_manual_movement(
  p_partner_id UUID,
  p_movement_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cm RECORD;
  v_sess RECORD;
  v_now TIMESTAMPTZ := NOW();
  v_tx UUID;
  v_tt TEXT;
  v_notes TEXT;
  v_amount NUMERIC;
  v_acc UUID;
  v_can BOOLEAN;
BEGIN
  SELECT cm.* INTO v_cm
    FROM public.cash_movements cm
   WHERE cm.id = p_movement_id
     AND cm.partner_id = p_partner_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimentação não encontrada.';
  END IF;

  IF v_cm.type NOT IN ('withdrawal', 'deposit') THEN
    RAISE EXCEPTION 'Somente sangrias e reforços podem ser estornados.';
  END IF;

  IF v_cm.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Esta movimentação já foi estornada.';
  END IF;

  SELECT cs.* INTO v_sess
    FROM public.cash_sessions cs
   WHERE cs.id = v_cm.cash_session_id
     AND cs.partner_id = p_partner_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão de caixa não encontrada.';
  END IF;

  IF v_sess.status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'O caixa não está aberto.';
  END IF;

  v_can := (v_sess.opened_by_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.partners p WHERE p.id = p_partner_id AND p.user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.partner_users pu
      WHERE pu.partner_id = p_partner_id
        AND pu.user_id = auth.uid()
        AND upper(COALESCE(pu.role::text, '')) IN ('OWNER', 'ADMIN')
    );
  IF NOT v_can THEN
    RAISE EXCEPTION 'Sem permissão para movimentar este caixa.';
  END IF;

  SELECT t.account_id INTO v_acc
    FROM public.transactions t
   WHERE t.id = v_cm.financial_transaction_id
     AND t.partner_id = p_partner_id;

  IF v_acc IS NULL THEN
    RAISE EXCEPTION 'Conta financeira da movimentação não encontrada.';
  END IF;

  v_amount := ROUND(GREATEST(COALESCE(v_cm.amount, 0), 0), 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Valor inválido para estorno.';
  END IF;

  IF v_cm.type = 'withdrawal' THEN
    v_tt := 'income';
    v_notes := 'Estorno de sangria registrada no PDV.';
  ELSE
    v_tt := 'expense';
    v_notes := 'Estorno de reforço registrado no PDV.';
  END IF;

  INSERT INTO public.transactions (
    partner_id, description, category,
    contact_id, contact_type,
    amount, due_date, payment_date, transaction_date,
    status, notes, payment_type, original_amount, interest_amount, fee_amount,
    transaction_type, origin, reference_note, account_id,
    payment_method_id, created_by_user_id
  ) VALUES (
    p_partner_id,
    CASE WHEN v_cm.type = 'withdrawal' THEN 'Estorno de sangria' ELSE 'Estorno de reforço' END,
    'Caixa PDV',
    NULL, NULL,
    v_amount, NULL, v_now, v_now,
    'paid',
    v_notes,
    'Caixa',
    v_amount, NULL, 0,
    v_tt, 'system', 'cash_mv_rev:' || v_cm.id::text, v_acc,
    NULL, auth.uid()
  ) RETURNING id INTO v_tx;

  UPDATE public.cash_movements
     SET reversed_at = NOW(),
         reversed_by_user_id = auth.uid()
   WHERE id = v_cm.id;

  PERFORM public.apply_account_balance_delta(
    v_acc,
    p_partner_id,
    CASE WHEN v_tt = 'income' THEN v_amount ELSE -v_amount END
  );

  RETURN jsonb_build_object('movement_id', v_cm.id, 'reversal_transaction_id', v_tx);
END;
$$;
