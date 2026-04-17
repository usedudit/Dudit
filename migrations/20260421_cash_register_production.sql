-- =============================================================================
-- Cash register production hardening: schema alignment, cash-only sales in drawer,
-- manual movement + reversal RPCs (atomic, balance-safe), session column renames.
-- =============================================================================

-- ── 1) cash_sessions: rename columns + reconciliation fields ───────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cash_sessions' AND column_name = 'user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cash_sessions' AND column_name = 'opened_by_user_id'
  ) THEN
    ALTER TABLE public.cash_sessions RENAME COLUMN user_id TO opened_by_user_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cash_sessions' AND column_name = 'opening_balance'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cash_sessions' AND column_name = 'initial_amount'
  ) THEN
    ALTER TABLE public.cash_sessions RENAME COLUMN opening_balance TO initial_amount;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cash_sessions' AND column_name = 'closing_balance'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cash_sessions' AND column_name = 'closing_amount'
  ) THEN
    ALTER TABLE public.cash_sessions RENAME COLUMN closing_balance TO closing_amount;
  END IF;
END $$;

ALTER TABLE public.cash_sessions
  ADD COLUMN IF NOT EXISTS closed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS calculated_amount NUMERIC(14,2) NULL,
  ADD COLUMN IF NOT EXISTS difference_amount NUMERIC(14,2) NULL,
  ADD COLUMN IF NOT EXISTS closing_method_counts JSONB NULL;

DROP INDEX IF EXISTS public.idx_cash_sessions_open_user_partner;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_sessions_open_user_partner
  ON public.cash_sessions (partner_id, opened_by_user_id)
  WHERE status = 'open';

-- ── 2) cash_movements: reversal + audit + finance link ─────────────────────
ALTER TABLE public.cash_movements
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS reversed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS financial_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL;

-- Normalize legacy signed amounts (withdrawals stored negative)
UPDATE public.cash_movements
SET amount = ABS(amount)
WHERE amount < 0;

ALTER TABLE public.cash_movements
  DROP CONSTRAINT IF EXISTS cash_movements_amount_nonneg;

ALTER TABLE public.cash_movements
  ADD CONSTRAINT cash_movements_amount_nonneg CHECK (amount >= 0);

CREATE INDEX IF NOT EXISTS idx_cash_movements_created_at
  ON public.cash_movements (partner_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_movements_financial_tx_unique
  ON public.cash_movements (financial_transaction_id)
  WHERE financial_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_cash_mv_reference
  ON public.transactions (partner_id, reference_note)
  WHERE reference_note LIKE 'cash_mv:%';

-- ── 3) Atomic manual movement (withdrawal balance check + ledger) ───────────
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
  v_now TEXT := NOW()::text;
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
    RAISE EXCEPTION 'Descrição é obrigatória.';
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
    partner_id, description, category, customer_id, contact_type,
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
  v_now TEXT := NOW()::text;
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
    RAISE EXCEPTION 'Só é possível estornar com o caixa aberto.';
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
    RAISE EXCEPTION 'Sem permissão para estornar esta movimentação.';
  END IF;

  v_amount := ROUND(GREATEST(COALESCE(v_cm.amount, 0), 0), 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Valor de movimentação inválido.';
  END IF;

  SELECT t.account_id INTO v_acc
    FROM public.transactions t
   WHERE t.id = v_cm.financial_transaction_id
     AND t.partner_id = p_partner_id
   LIMIT 1;

  IF v_acc IS NULL THEN
    RAISE EXCEPTION 'Transação financeira vinculada não encontrada.';
  END IF;

  IF v_cm.type = 'withdrawal' THEN
    -- Original was expense (cash out); reversal brings cash back → income
    v_tt := 'income';
    v_notes := 'Estorno de sangria de caixa.';
  ELSE
    v_tt := 'expense';
    v_notes := 'Estorno de reforço de caixa.';
  END IF;

  INSERT INTO public.transactions (
    partner_id, description, category, customer_id, contact_type,
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

-- Unique for reversal reference
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_cash_mv_rev_reference
  ON public.transactions (partner_id, reference_note)
  WHERE reference_note LIKE 'cash_mv_rev:%';

-- ── 4) finalize_pos_sale: lock session + only cash affects drawer ───────────
CREATE OR REPLACE FUNCTION public.finalize_pos_sale(
  p_partner_id UUID,
  p_pre_sale_id UUID,
  p_finance_account_id UUID,
  p_cash_session_id UUID,
  p_paid_amount NUMERIC,
  p_payment_method TEXT,
  p_payment_breakdown JSONB,
  p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_draft RECORD;
  v_items JSONB;
  v_item JSONB;
  v_item_arr JSONB[];
  v_subtotal NUMERIC := 0;
  v_discount NUMERIC;
  v_final_amount NUMERIC;
  v_product RECORD;
  v_variant RECORD;
  v_agg_key TEXT;
  v_agg_qty NUMERIC;
  v_available NUMERIC;
  v_has_variants BOOLEAN;
  v_sale_id UUID;
  v_sale_item RECORD;
  v_stock_items JSONB := '[]'::jsonb;
  v_clamped_paid NUMERIC;
  v_payment_status TEXT;
  v_tx_id UUID;
  v_now TEXT;
  v_entry JSONB;
  v_entry_amount NUMERIC;
  v_entry_pm_id UUID;
  v_breakdown_total NUMERIC := 0;
  v_is_cash BOOLEAN;
BEGIN
  SELECT * INTO v_draft
    FROM public.pre_sales
   WHERE id = p_pre_sale_id
     AND partner_id = p_partner_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pré-venda não encontrada.';
  END IF;

  IF v_draft.status != 'draft' THEN
    RAISE EXCEPTION 'Esta pré-venda já foi finalizada.';
  END IF;

  SELECT id INTO v_sale_id
    FROM public.sales
   WHERE pre_sale_id = p_pre_sale_id
     AND partner_id = p_partner_id
   LIMIT 1;
  IF v_sale_id IS NOT NULL THEN
    RETURN v_sale_id;
  END IF;

  v_items := COALESCE(v_draft.items, '[]'::jsonb);
  IF jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Não é possível finalizar venda sem itens.';
  END IF;

  v_subtotal := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    DECLARE
      v_qty NUMERIC;
      v_unit_price NUMERIC;
    BEGIN
      v_qty := COALESCE((v_item->>'quantity')::numeric, (v_item->>'qty')::numeric, 0);
      v_unit_price := COALESCE((v_item->>'unit_price')::numeric, (v_item->>'price')::numeric, 0);
      IF v_qty <= 0 THEN
        RAISE EXCEPTION 'Quantidade inválida para item "%".', COALESCE(v_item->>'name', 'desconhecido');
      END IF;
      IF v_unit_price < 0 THEN
        RAISE EXCEPTION 'Preço inválido para item "%".', COALESCE(v_item->>'name', 'desconhecido');
      END IF;
      v_subtotal := v_subtotal + ROUND(v_qty * v_unit_price, 2);
    END;
  END LOOP;

  v_discount := LEAST(COALESCE(v_draft.discount_amount, 0), v_subtotal);
  v_final_amount := GREATEST(ROUND(v_subtotal - v_discount, 2), 0);

  IF v_final_amount <= 0 THEN
    RAISE EXCEPTION 'A venda não pode ser finalizada com valor zerado.';
  END IF;

  IF ABS(v_subtotal - COALESCE(v_draft.subtotal, 0)) > 0.01 THEN
    RAISE EXCEPTION 'Subtotal inconsistente. Atualize a pré-venda antes de finalizar.';
  END IF;

  IF ABS(v_final_amount - COALESCE(v_draft.total_amount, 0)) > 0.01 THEN
    RAISE EXCEPTION 'Total inconsistente. Atualize a pré-venda antes de finalizar.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    DECLARE
      v_pid UUID;
      v_vid UUID;
      v_qty NUMERIC;
      v_name TEXT;
    BEGIN
      v_pid := (v_item->>'product_id')::uuid;
      IF v_pid IS NULL THEN v_pid := (v_item->>'productId')::uuid; END IF;
      IF v_pid IS NULL THEN CONTINUE; END IF;

      v_vid := (v_item->>'variant_id')::uuid;
      IF v_vid IS NULL THEN v_vid := (v_item->>'variantId')::uuid; END IF;

      v_qty := COALESCE((v_item->>'quantity')::numeric, (v_item->>'qty')::numeric, 0);
      v_name := COALESCE(v_item->>'name', 'item');

      SELECT id, stock_available, allow_sell_without_stock,
             (SELECT count(*) FROM product_variants pv WHERE pv.product_id = p.id) as variant_count
        INTO v_product
        FROM products p
       WHERE p.id = v_pid
         AND p.partner_id = p_partner_id
       FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado para "%".', v_name;
      END IF;

      IF v_product.variant_count > 0 AND v_vid IS NULL THEN
        RAISE EXCEPTION 'Variação não informada para o item %', v_name;
      END IF;

      IF NOT COALESCE(v_product.allow_sell_without_stock, false) THEN
        IF v_vid IS NOT NULL THEN
          SELECT pv.id, pv.stock_available, pv.product_id
            INTO v_variant
            FROM product_variants pv
           WHERE pv.id = v_vid
           FOR UPDATE;

          IF NOT FOUND THEN
            RAISE EXCEPTION 'A variação do item % não existe mais.', v_name;
          END IF;

          IF v_variant.product_id != v_pid THEN
            RAISE EXCEPTION 'Combinação inválida de variação para o item %', v_name;
          END IF;

          v_available := COALESCE(v_variant.stock_available, 0);
        ELSE
          v_available := COALESCE(v_product.stock_available, 0);
        END IF;

        IF v_qty > v_available THEN
          RAISE EXCEPTION 'Estoque insuficiente para o item %', v_name;
        END IF;
      END IF;
    END;
  END LOOP;

  IF p_payment_breakdown IS NOT NULL AND jsonb_array_length(p_payment_breakdown) > 0 THEN
    SELECT COALESCE(SUM(GREATEST((e->>'amount')::numeric, 0)), 0)
      INTO v_breakdown_total
      FROM jsonb_array_elements(p_payment_breakdown) e;
  END IF;

  v_clamped_paid := LEAST(
    v_final_amount,
    GREATEST(0, ROUND(
      CASE WHEN v_breakdown_total > 0 THEN v_breakdown_total ELSE COALESCE(p_paid_amount, 0) END
    , 2))
  );

  IF v_clamped_paid >= v_final_amount - 0.01 THEN
    v_payment_status := 'paid';
  ELSIF v_clamped_paid > 0 THEN
    v_payment_status := 'partially_paid';
  ELSE
    v_payment_status := 'pending';
  END IF;

  v_now := NOW()::text;

  PERFORM 1
    FROM public.cash_sessions cs
   WHERE cs.id = p_cash_session_id
     AND cs.partner_id = p_partner_id
     AND cs.status = 'open'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixa inválido ou já fechado.';
  END IF;

  INSERT INTO public.sales (
    partner_id, customer_id, pre_sale_id, total_amount, discount_amount,
    final_amount, paid_amount, payment_status, status, finance_account_id,
    cash_session_id, notes, finalized_by_user_id
  ) VALUES (
    p_partner_id, v_draft.customer_id, v_draft.id, v_subtotal, v_discount,
    v_final_amount, v_clamped_paid, v_payment_status, v_payment_status,
    p_finance_account_id, p_cash_session_id, v_draft.notes, p_user_id
  ) RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    DECLARE
      v_qty NUMERIC;
      v_up NUMERIC;
    BEGIN
      v_qty := COALESCE((v_item->>'quantity')::numeric, (v_item->>'qty')::numeric, 0);
      v_up := COALESCE((v_item->>'unit_price')::numeric, (v_item->>'price')::numeric, 0);

      INSERT INTO public.sale_items (
        sale_id, partner_id, product_id, variant_id, product_name, variant_name,
        unit_price, quantity, subtotal, total_price
      ) VALUES (
        v_sale_id, p_partner_id,
        COALESCE((v_item->>'product_id')::uuid, (v_item->>'productId')::uuid),
        COALESCE((v_item->>'variant_id')::uuid, (v_item->>'variantId')::uuid),
        COALESCE(v_item->>'name', 'Item'),
        COALESCE(v_item->>'variant_name', v_item->>'variantName'),
        v_up, v_qty,
        ROUND(v_qty * v_up, 2),
        ROUND(v_qty * v_up, 2)
      );

      IF COALESCE((v_item->>'product_id')::uuid, (v_item->>'productId')::uuid) IS NOT NULL THEN
        v_stock_items := v_stock_items || jsonb_build_object(
          'product_id', COALESCE(v_item->>'product_id', v_item->>'productId'),
          'variant_id', COALESCE(v_item->>'variant_id', v_item->>'variantId'),
          'quantity', v_qty
        );
      END IF;
    END;
  END LOOP;

  IF jsonb_array_length(v_stock_items) > 0 THEN
    PERFORM public.create_batch_stock_movement(
      p_partner_id := p_partner_id,
      p_movement_type := 'out',
      p_reason := 'Venda PDV',
      p_notes := 'Baixa de estoque da venda ' || v_sale_id::text,
      p_created_by := p_user_id,
      p_items := v_stock_items
    );
  END IF;

  IF v_clamped_paid > 0 THEN
    INSERT INTO public.transactions (
      partner_id, description, category, customer_id, contact_type,
      amount, due_date, payment_date, transaction_date,
      status, notes, payment_type, original_amount, interest_amount, fee_amount,
      transaction_type, origin, reference_note, account_id,
      payment_method_id, created_by_user_id
    ) VALUES (
      p_partner_id,
      'PDV ' || UPPER(LEFT(v_sale_id::text, 8)),
      'Vendas',
      v_draft.customer_id,
      'customer',
      v_clamped_paid, NULL, v_now, v_now,
      'paid',
      'Recebimento gerado pela finalização do PDV.',
      COALESCE(p_payment_method, 'Não informado'),
      v_clamped_paid, NULL, 0,
      'income', 'system', v_sale_id::text, p_finance_account_id,
      NULL, p_user_id
    ) RETURNING id INTO v_tx_id;

    IF p_payment_breakdown IS NOT NULL AND jsonb_array_length(p_payment_breakdown) > 0 THEN
      FOR v_entry IN SELECT * FROM jsonb_array_elements(p_payment_breakdown)
      LOOP
        v_entry_amount := ROUND(GREATEST((v_entry->>'amount')::numeric, 0), 2);
        IF v_entry_amount > 0 THEN
          v_entry_pm_id := (v_entry->>'paymentMethodId')::uuid;
          INSERT INTO public.transaction_payments (
            partner_id, transaction_id, amount, payment_method_id,
            created_by_user_id, idempotency_key
          ) VALUES (
            p_partner_id, v_tx_id, v_entry_amount, v_entry_pm_id,
            p_user_id,
            p_partner_id::text || ':' || v_sale_id::text || ':' || COALESCE(v_entry_pm_id::text, 'none')
          );
        END IF;
      END LOOP;
    END IF;

    IF p_payment_breakdown IS NOT NULL AND jsonb_array_length(p_payment_breakdown) > 0 THEN
      FOR v_entry IN SELECT * FROM jsonb_array_elements(p_payment_breakdown)
      LOOP
        v_entry_amount := ROUND(GREATEST((v_entry->>'amount')::numeric, 0), 2);
        IF v_entry_amount > 0 THEN
          v_entry_pm_id := (v_entry->>'paymentMethodId')::uuid;
          IF v_entry_pm_id IS NULL THEN
            v_is_cash := true;
          ELSE
            SELECT EXISTS (
              SELECT 1 FROM public.payment_methods pm
              WHERE pm.id = v_entry_pm_id
                AND pm.partner_id = p_partner_id
                AND pm.type = 'cash'
            ) INTO v_is_cash;
          END IF;

          IF v_is_cash THEN
            INSERT INTO public.cash_movements (
              partner_id, cash_session_id, type, description,
              payment_method_id, amount, reference_id,
              created_by_user_id
            ) VALUES (
              p_partner_id, p_cash_session_id, 'sale',
              'Venda PDV ' || UPPER(LEFT(v_sale_id::text, 8)) || ' - PDV',
              v_entry_pm_id,
              ABS(v_entry_amount),
              v_sale_id,
              p_user_id
            );
          END IF;
        END IF;
      END LOOP;
    ELSE
      INSERT INTO public.cash_movements (
        partner_id, cash_session_id, type, description,
        payment_method_id, amount, reference_id,
        created_by_user_id
      ) VALUES (
        p_partner_id, p_cash_session_id, 'sale',
        'Venda PDV ' || UPPER(LEFT(v_sale_id::text, 8)) || ' - PDV',
        NULL, ABS(v_clamped_paid), v_sale_id,
        p_user_id
      );
    END IF;
  END IF;

  UPDATE public.pre_sales
     SET status = 'completed',
         completed_sale_id = v_sale_id,
         updated_at = NOW()
   WHERE id = p_pre_sale_id
     AND partner_id = p_partner_id
     AND status = 'draft';

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_create_cash_manual_movement(UUID, UUID, TEXT, NUMERIC, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_reverse_cash_manual_movement(UUID, UUID) TO authenticated;
