-- ==============================================================================
-- ROLLBACK - FASE 2 (LEDGER ÚNICO)
-- Data: 2026-08-05 | Projeto: Dudit
-- Descrição: Reverte exatamente o que 20260805_fase2_ledger_kind.sql adicionou:
--   1. Restaura settle_installment_group para a versão original (sem guard de kind)
--   2. Remove índices criados
--   3. Remove as colunas aditivas (transactions.kind/payment_id,
--      installment_groups.order_id/payment_id/customer_id/store_id)
-- Nenhum dado existente é alterado (colunas removidas são novas e sem dados).
-- ==============================================================================

BEGIN;

-- 1. Restaura o RPC ORIGINAL (20260425154000) - sem o guard de kind
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
        ORDER BY t.installment_number ASC
        FOR UPDATE
    LOOP
        v_original := ABS(COALESCE(v_row.original_amount, v_row.amount, 0));
        v_paid_so_far := v_row.paid_principal_so_far;
        v_remaining := GREATEST(0, ROUND((v_original - v_paid_so_far)::NUMERIC, 2));

        IF v_remaining <= 0 THEN
            UPDATE transactions
            SET status = 'paid',
                payment_date = v_now,
                updated_at = v_now
            WHERE id = v_row.id AND partner_id = p_partner_id;
            v_settled := v_settled + 1;
            CONTINUE;
        END IF;

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

        v_resolved_account_id := v_row.account_id;
        IF v_resolved_account_id IS NULL AND v_pm_id IS NOT NULL THEN
            SELECT default_finance_account_id INTO v_resolved_account_id
            FROM payment_methods
            WHERE id = v_pm_id AND partner_id = p_partner_id;
        END IF;

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

        SELECT COALESCE(SUM(tp.amount), 0) INTO v_total_paid_cash
        FROM transaction_payments tp
        WHERE tp.transaction_id = v_row.id AND tp.partner_id = p_partner_id;

        SELECT COALESCE(SUM(tp.interest_amount), 0) INTO v_total_interest
        FROM transaction_payments tp
        WHERE tp.transaction_id = v_row.id AND tp.partner_id = p_partner_id;

        IF (v_paid_so_far + v_base_applied + 0.0001) >= v_original THEN
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

-- 2. Remove índices aditivos
DROP INDEX IF EXISTS public.idx_transactions_kind;
DROP INDEX IF EXISTS public.idx_transactions_payment_id;
DROP INDEX IF EXISTS public.idx_installment_groups_order_id;
DROP INDEX IF EXISTS public.idx_installment_groups_payment_id;
DROP INDEX IF EXISTS public.idx_installment_groups_customer_id;

-- 3. Remove colunas aditivas (novas e sem dados)
-- ATENÇÃO: transactions.kind/payment_id e installment_groups.order_id/payment_id/
-- customer_id foram adicionadas nesta Fase 2. installment_groups.store_id NÃO é
-- dropada (é pré-existente, criada em 20260728_simplify_multi_store_architecture).
ALTER TABLE public.transactions
    DROP COLUMN IF EXISTS kind CASCADE,
    DROP COLUMN IF EXISTS payment_id CASCADE;

ALTER TABLE public.installment_groups
    DROP COLUMN IF EXISTS order_id CASCADE,
    DROP COLUMN IF EXISTS payment_id CASCADE,
    DROP COLUMN IF EXISTS customer_id CASCADE;

COMMIT;