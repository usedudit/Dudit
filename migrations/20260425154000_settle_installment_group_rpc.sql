-- ============================================================================
-- Migration: Create atomic settle_installment_group RPC
-- Description: Replaces N+1 JS logic with a fully ACID Postgres transaction.
-- Includes: FOR UPDATE locking, strict idempotency, balance verification,
-- and search_path security.
-- ============================================================================

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
    v_tx_ids_to_mark UUID[] := '{}';
    v_account_ids   UUID[] := '{}';
    v_account_deltas NUMERIC[] := '{}';
    v_acc_idx       INT;
BEGIN
    -- STEP 1: Lock and fetch pending transactions for this group
    -- Using FOR UPDATE guarantees no other transaction can settle these rows concurrently
    FOR v_row IN
        SELECT
            t.id, t.status, t.amount, t.original_amount, t.transaction_type, t.refund_kind, t.account_id,
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

        -- Extra safeguard: if remaining is 0 but it wasn't marked paid, mark it and skip payment logic
        IF v_remaining <= 0 THEN
            v_tx_ids_to_mark := array_append(v_tx_ids_to_mark, v_row.id);
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

        INSERT INTO transaction_payments (
            partner_id, transaction_id, amount, base_amount,
            interest_amount, discount_amount, payment_method_id,
            created_by_user_id, created_at, idempotency_key
        ) VALUES (
            p_partner_id, v_row.id, v_final_paid, v_base_applied, v_interest, v_discount,
            CASE WHEN v_custom IS NOT NULL THEN (v_custom->>'paymentMethodId')::UUID ELSE NULL END,
            p_user_id, v_now, v_idem_key
        );
        v_payments_created := v_payments_created + 1;

        -- STEP 3: Aggregate Balance Deltas In-Memory
        IF v_row.account_id IS NOT NULL THEN
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
                v_acc_idx := array_position(v_account_ids, v_row.account_id);
                IF v_acc_idx IS NULL THEN
                    v_account_ids := array_append(v_account_ids, v_row.account_id);
                    v_account_deltas := array_append(v_account_deltas, v_delta);
                ELSE
                    v_account_deltas[v_acc_idx] := v_account_deltas[v_acc_idx] + v_delta;
                END IF;
            END IF;
        END IF;

        -- Check if transaction is fully paid after this payment
        IF (v_paid_so_far + v_base_applied + 0.0001) >= v_original THEN
            v_tx_ids_to_mark := array_append(v_tx_ids_to_mark, v_row.id);
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

                -- Validation: Ensure the account was actually found and updated
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Finance account % not found or does not belong to partner %', v_account_ids[i], p_partner_id;
                END IF;
            END IF;
        END LOOP;
    END IF;

    -- STEP 5: Update Statuses
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

-- Ensure authenticated users can execute this RPC
GRANT EXECUTE ON FUNCTION settle_installment_group TO authenticated;
