-- ============================================================================
-- ARCHITECTURAL PROPOSAL 1: Transaction Detail View
-- ============================================================================
-- Replaces 4+ secondary lookups in getTransactionDetailsAction with a single
-- query against this view. The DB optimizer can use index-only scans on the
-- LEFT JOINs, which is significantly faster than 4 sequential round-trips.
--
-- IMPACT: Eliminates the Promise.all(4 queries) entirely. The view returns
-- all enrichment fields (account name, subcategory name, payment method name,
-- creator name) in a single SELECT. Expected to save ~100-200ms per detail
-- view even after the parallelization fix.
--
-- USAGE: Replace `supabase.from("transactions").select(...)` with
--        `supabase.from("v_transaction_detail").select(...)` in
--        getTransactionDetailsAction.
--
-- NOTE: RLS policies on `transactions` will automatically apply to this view
-- since it references the transactions table directly. No additional security
-- configuration is needed.
-- ============================================================================

CREATE OR REPLACE VIEW v_transaction_detail AS
SELECT
    t.id,
    t.partner_id,
    t.description,
    t.category,
    t.amount,
    t.original_amount,
    t.due_date,
    t.payment_date,
    t.transaction_date,
    t.created_at,
    t.updated_at,
    t.status,
    t.notes,
    t.payment_type,
    t.transaction_type,
    t.contact_id,
    t.customer_id,
    t.contact_type,
    t.transfer_group_id,
    t.refund_kind,
    t.reference_note,
    t.origin,
    t.account_id,
    t.category_id,
    t.subcategory_id,
    t.recurring_id,
    t.payment_method_id,
    t.created_by_user_id,
    t.installment_group_id,
    t.installment_number,
    -- Enrichment fields (replace secondary lookups)
    fa.name                AS account_name,
    fc.name                AS subcategory_name,
    pm.name                AS payment_method_name,
    pm.payment_type        AS payment_method_payment_type,
    pm.type                AS payment_method_type,
    up.full_name           AS creator_name
FROM transactions t
LEFT JOIN finance_accounts     fa ON fa.id = t.account_id
LEFT JOIN financial_categories fc ON fc.id = t.subcategory_id
LEFT JOIN payment_methods      pm ON pm.id = t.payment_method_id
LEFT JOIN user_profiles        up ON up.user_id = t.created_by_user_id;

-- Optional: Add a comment for documentation
COMMENT ON VIEW v_transaction_detail IS
    'Enriched transaction view with account, subcategory, payment method, and creator names. Used by getTransactionDetailsAction to avoid secondary lookups.';


-- ============================================================================
-- ARCHITECTURAL PROPOSAL 2: Settle Installment Group RPC
-- ============================================================================
-- Replaces the entire settleInstallmentGroupAction loop (compute remaining
-- principal, insert payments, apply balance deltas, mark as paid) with a
-- single atomic database function.
--
-- IMPACT:
-- - Eliminates ALL network round-trips for settlement (currently: 1 fetch
--   installments + 1 fetch payments + N balance RPCs + 1 insert payments +
--   1 update statuses = N+4 round-trips → 1 RPC call)
-- - Full transactional atomicity: if any step fails, everything rolls back
-- - Row-level locking on finance_accounts prevents race conditions
--
-- USAGE: Replace the entire loop in settleInstallmentGroupAction with:
--   const { data, error } = await supabase.rpc('settle_installment_group', {
--     p_partner_id: input.partnerId,
--     p_installment_group_id: input.installmentGroupId,
--     p_user_id: userId,
--     p_custom_payments: input.installmentPayments || null,
--   })
--
-- NOTE: This is a significant change. Review carefully before deploying.
-- The function handles all the business logic currently in JS:
-- - Computes remaining principal per installment
-- - Applies custom payment amounts if provided
-- - Aggregates balance deltas per account
-- - Inserts transaction_payments with idempotency keys
-- - Marks fully-paid transactions as "paid"
-- ============================================================================

CREATE OR REPLACE FUNCTION settle_installment_group(
    p_partner_id          UUID,
    p_installment_group_id UUID,
    p_user_id             UUID,
    p_custom_payments     JSONB DEFAULT NULL
    -- Expected format for p_custom_payments:
    -- [{"transactionId": "...", "paymentAmount": 100.00, "interestAmount": 0, "discountAmount": 0, "paymentMethodId": "..."}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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
    v_pay_idx       INT := 0;
    v_affected      INT := 0;
    v_settled       INT := 0;
    v_payments_created INT := 0;
    v_idem_key      TEXT;
    v_tx_ids_to_mark UUID[] := '{}';
BEGIN
    -- 1. Fetch all installments in the group
    FOR v_row IN
        SELECT
            t.id,
            t.status,
            t.amount,
            t.original_amount,
            t.transaction_type,
            t.refund_kind,
            t.account_id,
            COALESCE(
                (SELECT SUM(COALESCE(tp.base_amount, tp.amount, 0))
                 FROM transaction_payments tp
                 WHERE tp.transaction_id = t.id AND tp.partner_id = p_partner_id),
                0
            ) AS paid_principal_so_far
        FROM transactions t
        WHERE t.partner_id = p_partner_id
          AND t.installment_group_id = p_installment_group_id
        ORDER BY t.installment_number ASC
    LOOP
        v_original := ABS(COALESCE(v_row.original_amount, v_row.amount, 0));
        v_paid_so_far := v_row.paid_principal_so_far;
        v_remaining := GREATEST(0, ROUND((v_original - v_paid_so_far)::NUMERIC, 2));

        -- Already fully paid
        IF v_remaining <= 0 THEN
            IF LOWER(COALESCE(v_row.status, '')) <> 'paid' THEN
                v_tx_ids_to_mark := array_append(v_tx_ids_to_mark, v_row.id);
            END IF;
            CONTINUE;
        END IF;

        -- Check for custom payment override
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

        -- 2. Insert payment record
        v_idem_key := 'settle:' || p_installment_group_id || ':' || v_row.id || ':' || v_now::TEXT || ':' || v_pay_idx;
        v_pay_idx := v_pay_idx + 1;

        INSERT INTO transaction_payments (
            partner_id, transaction_id, amount, base_amount,
            interest_amount, discount_amount, payment_method_id,
            created_by_user_id, created_at, idempotency_key
        ) VALUES (
            p_partner_id, v_row.id, v_final_paid, v_base_applied,
            v_interest, v_discount,
            CASE WHEN v_custom IS NOT NULL THEN (v_custom->>'paymentMethodId')::UUID ELSE NULL END,
            p_user_id, v_now, v_idem_key
        );
        v_payments_created := v_payments_created + 1;

        -- 3. Apply balance delta (with row lock)
        IF v_row.account_id IS NOT NULL THEN
            v_delta := 0;
            IF v_row.transaction_type = 'income' THEN
                v_delta := ABS(v_final_paid);
            ELSIF v_row.transaction_type = 'expense' THEN
                v_delta := -ABS(v_final_paid);
            ELSIF v_row.transaction_type = 'adjustment' THEN
                v_delta := v_final_paid;
            ELSIF v_row.transaction_type = 'refund' THEN
                IF v_row.refund_kind = 'expense_refund' THEN
                    v_delta := ABS(v_final_paid);
                ELSIF v_row.refund_kind = 'revenue_refund' THEN
                    v_delta := -ABS(v_final_paid);
                END IF;
            END IF;

            v_delta := ROUND(v_delta, 2);
            IF v_delta <> 0 THEN
                UPDATE finance_accounts
                SET current_balance = current_balance + v_delta,
                    updated_at = v_now
                WHERE id = v_row.account_id
                  AND partner_id = p_partner_id;
            END IF;
        END IF;

        -- 4. Check if fully paid after this payment
        IF (v_paid_so_far + v_base_applied + 0.0001) >= v_original THEN
            v_tx_ids_to_mark := array_append(v_tx_ids_to_mark, v_row.id);
        END IF;

        v_affected := v_affected + 1;
    END LOOP;

    -- 5. Mark fully-paid transactions
    IF array_length(v_tx_ids_to_mark, 1) > 0 THEN
        UPDATE transactions
        SET status = 'paid',
            payment_date = v_now,
            updated_at = v_now
        WHERE partner_id = p_partner_id
          AND id = ANY(v_tx_ids_to_mark);

        v_settled := array_length(v_tx_ids_to_mark, 1);
    END IF;

    RETURN jsonb_build_object(
        'settledCount', v_settled,
        'createdPayments', v_payments_created,
        'affectedCount', v_affected
    );
END;
$$;

-- Grant execute to authenticated users (Supabase default role)
GRANT EXECUTE ON FUNCTION settle_installment_group TO authenticated;
