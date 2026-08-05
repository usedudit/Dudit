-- =============================================================================
-- ROLLBACK — STORE_ID NO FINANCEIRO
-- Data: 2026-08-05 | Projeto: Dudit
-- Descrição: Reverte exatamente o que 20260805_financial_store_id.sql adicionou:
--   1. Restaura generate_recurring_occurrences_bulk (versão sem store_id)
--   2. Restaura settle_installment_group (versão 20260805_fase2_ledger_kind,
--      sem store_id nos transaction_payments)
--   3. Remove índices e colunas aditivas
-- Os backfills não são revertidos (apenas preencheram store_id derivado).
-- =============================================================================

BEGIN;

-- 1. Restaura generate_recurring_occurrences_bulk (20260414 + hardening search_path)
DROP FUNCTION IF EXISTS public.generate_recurring_occurrences_bulk(UUID, DATE);

CREATE OR REPLACE FUNCTION public.generate_recurring_occurrences_bulk(
  p_partner_id UUID,
  p_ceiling_date DATE DEFAULT (CURRENT_DATE + interval '3 months')
) RETURNS TABLE(
  recurring_id UUID,
  occurrence_date DATE,
  description TEXT,
  amount NUMERIC,
  type TEXT,
  frequency TEXT,
  account_id UUID,
  category_id UUID,
  subcategory_id UUID,
  contact_id UUID,
  customer_id UUID,
  contact_type TEXT,
  payment_method_id UUID
) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_tpl RECORD;
  v_current TIMESTAMPTZ;
  v_next TIMESTAMPTZ;
  v_ymd DATE;
  v_safety INT;
  v_end_ymd DATE;
BEGIN
  -- SECURITY: All queries are strictly scoped by p_partner_id.
  -- No cross-partner data leakage is possible.
  FOR v_tpl IN
    SELECT rt.*
    FROM public.recurring_transactions rt
    WHERE rt.partner_id = p_partner_id
      AND rt.active = TRUE
      AND rt.status = 'active'
  LOOP
    -- Calculate the effective end date for this template
    v_end_ymd := LEAST(
      COALESCE(v_tpl.end_date::date, p_ceiling_date),
      p_ceiling_date
    );

    v_current := v_tpl.start_date;
    v_safety := 0;

    WHILE v_safety < 400 LOOP
      v_safety := v_safety + 1;
      v_ymd := v_current::date;

      -- Stop if past the end date
      IF v_ymd > v_end_ymd THEN
        EXIT;
      END IF;

      -- Only emit occurrences on or after start_date
      IF v_ymd >= v_tpl.start_date::date THEN
        -- Check if NOT already materialized in transactions (partner-scoped)
        IF NOT EXISTS (
          SELECT 1 FROM public.transactions t
          WHERE t.recurring_id = v_tpl.id
            AND t.due_date = v_ymd
            AND t.partner_id = p_partner_id
        ) THEN
          RETURN QUERY SELECT
            v_tpl.id,
            v_ymd,
            v_tpl.description,
            v_tpl.amount,
            v_tpl.type::TEXT,
            v_tpl.frequency::TEXT,
            v_tpl.account_id,
            v_tpl.category_id,
            v_tpl.subcategory_id,
            v_tpl.contact_id,
            v_tpl.customer_id,
            v_tpl.contact_type,
            v_tpl.payment_method_id;
        END IF;
      END IF;

      -- Advance to next occurrence using the existing engine function
      v_next := public.financial_next_run_date(
        v_tpl.frequency,
        v_tpl.interval_value,
        v_current,
        v_tpl.start_date,
        v_tpl.week_days,
        v_tpl.month_day,
        v_tpl.use_last_day,
        v_tpl.year_month,
        v_tpl.year_day
      );

      -- Safety: exit if no progress or null
      IF v_next IS NULL OR v_next <= v_current THEN
        EXIT;
      END IF;

      v_current := v_next;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_recurring_occurrences_bulk(UUID, DATE) FROM PUBLIC;

-- 2. Restaura settle_installment_group (20260805_fase2_ledger_kind, sem store_id)
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
          AND LOWER(COALESCE(t.status, '')) <> 'paid'
          AND (t.kind IS NULL OR t.kind = 'settlement')
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

GRANT EXECUTE ON FUNCTION settle_installment_group TO authenticated;

-- 3. Remove índices e colunas aditivas (novas, sem dados relevantes)
DROP INDEX IF EXISTS public.idx_transaction_payments_store_id;
ALTER TABLE public.transaction_payments
    DROP COLUMN IF EXISTS store_id CASCADE;

DROP INDEX IF EXISTS public.idx_recurring_transactions_store_id;
ALTER TABLE public.recurring_transactions
    DROP COLUMN IF EXISTS store_id CASCADE;

COMMIT;
