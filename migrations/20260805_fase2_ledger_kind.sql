-- ============================================================================
-- FASE 2 - LEDGER ÚNICO: transactions.kind + vínculo payments/orders
-- Data: 2026-08-05 | Projeto: Dudit
-- ----------------------------------------------------------------------------
-- Aditivo e idempotente. NÃO toca dados existentes (zero backfill, zero UPDATE
-- de valores/saldos). Registros antigos com kind NULL continuam funcionando
-- exatamente como hoje (relatórios tratam NULL como comportamento legado).
--
-- Sobre kind (semântica do ledger):
--   recognition = DRE (valor bruto da venda), NÃO move saldo
--   fee         = despesa DRE (taxa do gateway), NÃO move saldo
--                (o líquido repassado já deduz a taxa)
--   settlement  = ÚNICO evento que move caixa/saldo (valor líquido)
--   refund      = move saldo (inverte)
--   chargeback  = move saldo (inverte)
--   NULL        = legado/conflado (moves saldo e conta em DRE, como hoje)
-- ============================================================================

-- ─── TRANSACTIONS: kind + payment_id ────────────────────────────────────────

ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS kind TEXT NULL;

ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS payment_id UUID NULL REFERENCES public.payments(id) ON DELETE SET NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'transactions_kind_check'
          AND conrelid = 'public.transactions'::regclass
    ) THEN
        ALTER TABLE public.transactions
            ADD CONSTRAINT transactions_kind_check
            CHECK (kind IS NULL OR kind IN ('recognition', 'settlement', 'fee', 'refund', 'chargeback'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_kind
    ON public.transactions (kind)
    WHERE kind IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_payment_id
    ON public.transactions (payment_id)
    WHERE payment_id IS NOT NULL;

COMMENT ON COLUMN public.transactions.kind IS
    'Classificação do evento no ledger único. NULL = legado (comportamento atual). recognize/fee = DRE (não move saldo); settlement = caixa (único que move saldo); refund/chargeback = movem saldo.';

-- ─── INSTALLMENT_GROUPS: vínculo com pedido/pagamento/cliente/loja ─────────

ALTER TABLE public.installment_groups
    ADD COLUMN IF NOT EXISTS order_id UUID NULL REFERENCES public.orders(id) ON DELETE SET NULL;

ALTER TABLE public.installment_groups
    ADD COLUMN IF NOT EXISTS payment_id UUID NULL REFERENCES public.payments(id) ON DELETE SET NULL;

ALTER TABLE public.installment_groups
    ADD COLUMN IF NOT EXISTS customer_id UUID NULL REFERENCES public.customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_installment_groups_order_id
    ON public.installment_groups (order_id)
    WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_installment_groups_payment_id
    ON public.installment_groups (payment_id)
    WHERE payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_installment_groups_customer_id
    ON public.installment_groups (customer_id)
    WHERE customer_id IS NOT NULL;

-- ─── GUARD DE KIND NO RPC settle_installment_group ─────────────────────────
-- Recreate identico ao original (20260425154000) + filtro defensivo: o RPC
-- só liquida linhas kind='settlement' ou legado (NULL). Linhas recognition/fee
-- jamais estarão em grupos, mas o guard garante invariante do ledger.

CREATE OR REPLACE FUNCTION settle_installment_group(
    p_partner_id           UUID,
    p_installment_group_id UUID,
    p_user_id              UUID,
    p_custom_payments      JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_now           TIMESTAMPTZ := NOW();
    v_row           RECORD;
    v_custom        JSONB;
    v_original      NUMERIC;
    v_paid_so_far   NUMERIC;
    v_remaining     NUMERIC;
    v_base_request  NUMERIC;
    v_interest      NUMERIC;
    v_discount      NUMERIC;
    v_base_applied  NUMERIC;
    v_final_paid    NUMERIC;
    v_delta         NUMERIC;
    v_affected      INT := 0;
    v_settled       INT := 0;
    v_payments_created INT := 0;
    v_idem_key      TEXT;
    v_account_ids   UUID[] := '{}';
    v_account_deltas NUMERIC[] := '{}';
    v_acc_idx       INT;
    v_resolved_account_id UUID;
    v_pm_id         UUID;
    v_pm_name       TEXT;
    v_pm_type       TEXT;
    v_pm_label      TEXT;
    v_paid_cash_so_far NUMERIC;
    v_total_paid_cash  NUMERIC;
    v_total_interest   NUMERIC;
BEGIN
    -- STEP 1: Lock and fetch pending settlement rows for this group
    -- Guard: apenas kind='settlement' ou legado (NULL) - linhas recognition/fee
    -- jamais são liquidadas aqui (invariante do ledger único).
    FOR v_row IN
        SELECT
            t.id, t.status, t.amount, t.original_amount, t.transaction_type, t.refund_kind, t.account_id, t.payment_method_id, t.payment_type, t.interest_amount,
            COALESCE(
                (SELECT SUM(COALESCE(tp.base_amount, tp.amount, 0))
                 FROM transaction_payments tp
                 WHERE tp.transaction_id = t.id AND tp.partner_id = p_partner_id),
                0
            ) AS paid_principal_so_far
        FROM transactions t
        WHERE t.partner_id = p_partner_id
          AND t.installment_group_id = p_installment_group_id
          AND LOWER(COALESCE(t.status, '')) <> 'paid' -- Avoid locking/processing already paid txs
          AND (t.kind IS NULL OR t.kind = 'settlement')
        ORDER BY t.installment_number ASC
        FOR UPDATE
    LOOP
        v_original := ABS(COALESCE(v_row.original_amount, v_row.amount, 0));
        v_paid_so_far := v_row.paid_principal_so_far;
        v_remaining := GREATEST(0, ROUND((v_original - v_paid_so_far)::NUMERIC, 2));

        -- Extra safeguard: if remaining is 0 but it wasn't marked paid, mark it and skip payment logic
        IF v_remaining <= 0 THEN
            UPDATE transactions
            SET status = 'paid',
                payment_date = v_now,
                updated_at = v_now
            WHERE id = v_row.id AND partner_id = p_partner_id;
            v_settled := v_settled + 1;
            CONTINUE;
        END IF;

        -- Extract overrides for this specific transaction
        v_custom := NULL;
        IF p_custom_payments IS NOT NULL THEN
            SELECT elem INTO v_custom
            FROM jsonb_array_elements(p_custom_payments) AS elem
            WHERE elem->>'transactionId' = v_row.id::TEXT
            LIMIT 1;
        END IF;

        v_base_request := GREATEST(0, COALESCE((v_custom->>'paymentAmount')::NUMERIC, v_remaining));
        v_interest := COALESCE((v_custom->>'interestAmount')::NUMERIC, 0);
        v_discount := COALESCE((v_custom->>'discountAmount')::NUMERIC, 0);
        v_base_applied := ROUND(LEAST(v_remaining, v_base_request), 2);
        v_final_paid := ROUND(v_base_applied + v_interest - v_discount, 2);

        IF v_final_paid <= 0 OR v_base_applied < 0.0001 THEN
            CONTINUE;
        END IF;

        -- STEP 2: Insert Payment Record with deterministic idempotency key
        -- Format: settle:{group_id}:{transaction_id}
        -- Will throw unique constraint violation if called twice for the same transaction
        v_idem_key := 'settle:' || p_installment_group_id || ':' || v_row.id;

        v_pm_id := NULL;
        IF v_custom IS NOT NULL THEN
            v_pm_id := (v_custom->>'paymentMethodId')::UUID;
        END IF;
        IF v_pm_id IS NULL THEN
            v_pm_id := v_row.payment_method_id;
        END IF;

        INSERT INTO transaction_payments (
            partner_id, transaction_id, amount, base_amount,
            interest_amount, discount_amount, payment_method_id,
            created_by_user_id, created_at, idempotency_key
        ) VALUES (
            p_partner_id, v_row.id, v_final_paid, v_base_applied, v_interest, v_discount,
            v_pm_id,
            p_user_id, v_now, v_idem_key
        );
        v_payments_created := v_payments_created + 1;

        -- STEP 3: Aggregate Balance Deltas In-Memory
        v_resolved_account_id := v_row.account_id;
        IF v_resolved_account_id IS NULL AND v_pm_id IS NOT NULL THEN
            SELECT default_finance_account_id INTO v_resolved_account_id
            FROM payment_methods
            WHERE id = v_pm_id AND partner_id = p_partner_id;
        END IF;

        -- Format display label
        v_pm_name := NULL;
        v_pm_type := NULL;
        v_pm_label := NULL;
        IF v_pm_id IS NOT NULL THEN
            SELECT name, payment_type INTO v_pm_name, v_pm_type
            FROM payment_methods
            WHERE id = v_pm_id AND partner_id = p_partner_id;

            IF v_pm_name IS NOT NULL THEN
                v_pm_name := TRIM(v_pm_name);
                v_pm_type := TRIM(COALESCE(v_pm_type, ''));

                IF v_pm_type = '' THEN
                    v_pm_label := INITCAP(v_pm_name);
                ELSIF LOWER(v_pm_name) = LOWER(v_pm_type) THEN
                    v_pm_label := INITCAP(v_pm_type);
                ELSE
                    v_pm_label := INITCAP(v_pm_name) || ' (' || INITCAP(v_pm_type) || ')';
                END IF;
            END IF;
        END IF;

        -- Calculate total cash paid and interest paid
        SELECT COALESCE(SUM(tp.amount), 0) INTO v_total_paid_cash
        FROM transaction_payments tp
        WHERE tp.transaction_id = v_row.id AND tp.partner_id = p_partner_id;

        SELECT COALESCE(SUM(tp.interest_amount), 0) INTO v_total_interest
        FROM transaction_payments tp
        WHERE tp.transaction_id = v_row.id AND tp.partner_id = p_partner_id;

        IF (v_paid_so_far + v_base_applied + 0.0001) >= v_original THEN
            -- Fully Paid
            UPDATE transactions
            SET status = 'paid',
                payment_date = v_now,
                updated_at = v_now,
                account_id = COALESCE(v_resolved_account_id, account_id),
                payment_method_id = COALESCE(v_pm_id, payment_method_id),
                payment_type = COALESCE(v_pm_label, payment_type),
                interest_amount = CASE WHEN v_total_interest > 0 THEN v_total_interest ELSE interest_amount END,
                amount = CASE WHEN v_total_paid_cash > 0 THEN v_total_paid_cash ELSE amount END
            WHERE id = v_row.id AND partner_id = p_partner_id;

            v_settled := v_settled + 1;
        ELSE
            -- Partially Paid
            UPDATE transactions
            SET account_id = COALESCE(v_resolved_account_id, account_id),
                payment_method_id = COALESCE(v_pm_id, payment_method_id),
                payment_type = COALESCE(v_pm_label, payment_type),
                interest_amount = CASE WHEN v_total_interest > 0 THEN v_total_interest ELSE interest_amount END,
                updated_at = v_now
            WHERE id = v_row.id AND partner_id = p_partner_id;
        END IF;

        IF v_resolved_account_id IS NOT NULL THEN
            v_delta := 0;
            IF v_row.transaction_type = 'income' THEN v_delta := ABS(v_final_paid);
            ELSIF v_row.transaction_type = 'expense' THEN v_delta := -ABS(v_final_paid);
            ELSIF v_row.transaction_type = 'adjustment' THEN v_delta := v_final_paid;
            ELSIF v_row.transaction_type = 'refund' THEN
                IF v_row.refund_kind = 'expense_refund' THEN v_delta := ABS(v_final_paid);
                ELSIF v_row.refund_kind = 'revenue_refund' THEN v_delta := -ABS(v_final_paid);
                END IF;
            END IF;

            v_delta := ROUND(v_delta, 2);
            IF v_delta <> 0 THEN
                v_acc_idx := array_position(v_account_ids, v_resolved_account_id);
                IF v_acc_idx IS NULL THEN
                    v_account_ids := array_append(v_account_ids, v_resolved_account_id);
                    v_account_deltas := array_append(v_account_deltas, v_delta);
                ELSE
                    v_account_deltas[v_acc_idx] := v_account_deltas[v_acc_idx] + v_delta;
                END IF;
            END IF;
        END IF;

        v_affected := v_affected + 1;
    END LOOP;

    -- STEP 4: Apply Aggregated Balances Atomically
    IF array_length(v_account_ids, 1) > 0 THEN
        FOR i IN 1..array_length(v_account_ids, 1) LOOP
            IF v_account_deltas[i] <> 0 THEN
                UPDATE finance_accounts
                SET current_balance = current_balance + v_account_deltas[i],
                    updated_at = v_now
                WHERE id = v_account_ids[i]
                  AND partner_id = p_partner_id;

                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Finance account % not found or does not belong to partner %', v_account_ids[i], p_partner_id;
                END IF;
            END IF;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'settledCount', v_settled,
        'createdPayments', v_payments_created,
        'affectedCount', v_affected
    );
END;
$$;

GRANT EXECUTE ON FUNCTION settle_installment_group TO authenticated;