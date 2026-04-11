-- =============================================================================
-- Normalize legacy PT contact types, optional customer link on transactions,
-- and recurring templates (customers table, not transaction_contacts).
-- =============================================================================

-- 1) Backfill English types on transaction_contacts (legacy installs).
UPDATE public.transaction_contacts
SET type = CASE type
    WHEN 'cliente' THEN 'customer'
    WHEN 'fornecedor' THEN 'supplier'
    WHEN 'funcionario' THEN 'employee'
    WHEN 'outro' THEN 'other'
    ELSE type
END
WHERE type IN ('cliente', 'fornecedor', 'funcionario', 'outro');

-- 2) Replace CHECK so only canonical English values are allowed.
ALTER TABLE public.transaction_contacts
    DROP CONSTRAINT IF EXISTS transaction_contacts_type_check;

ALTER TABLE public.transaction_contacts
    ADD CONSTRAINT transaction_contacts_type_check
    CHECK (
        type IN (
            'customer', 'supplier', 'service', 'employee', 'partner', 'other'
        )
    );

-- 3) Optional link to CRM customer (manual income/expense with SelectCustomerSheet).
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS customer_id UUID NULL REFERENCES public.customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_customer_id
    ON public.transactions (customer_id);

-- 4) Same on recurring templates.
ALTER TABLE public.recurring_transactions
    ADD COLUMN IF NOT EXISTS customer_id UUID NULL REFERENCES public.customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recurring_transactions_customer_id
    ON public.recurring_transactions (customer_id);

-- 5) Recurring job: copy customer_id into generated rows.
CREATE OR REPLACE FUNCTION public.process_due_recurring_transactions(p_limit INTEGER DEFAULT 200)
RETURNS TABLE(processed_count INTEGER, created_count INTEGER, deactivated_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_rec RECORD;
    v_created INTEGER := 0;
    v_processed INTEGER := 0;
    v_deactivated INTEGER := 0;
    v_tx_date TIMESTAMPTZ;
    v_next_run TIMESTAMPTZ;
    v_existing UUID;
    v_category_name TEXT;
BEGIN
    FOR v_rec IN
        SELECT *
        FROM public.recurring_transactions
        WHERE active = TRUE
          AND next_run_date <= NOW()
        ORDER BY next_run_date
        LIMIT GREATEST(COALESCE(p_limit, 200), 1)
        FOR UPDATE SKIP LOCKED
    LOOP
        v_processed := v_processed + 1;
        v_tx_date := v_rec.next_run_date;

        SELECT id INTO v_existing
        FROM public.transactions
        WHERE recurring_id = v_rec.id
          AND transaction_date = v_tx_date
        LIMIT 1;

        IF v_existing IS NULL THEN
            v_category_name := 'Recorrência';
            IF v_rec.category_id IS NOT NULL THEN
                SELECT name INTO v_category_name
                FROM public.financial_categories
                WHERE id = v_rec.category_id
                LIMIT 1;
                v_category_name := COALESCE(v_category_name, 'Recorrência');
            END IF;

            INSERT INTO public.transactions (
                partner_id, description, category, category_id, subcategory_id,
                contact_id, contact_type, customer_id, amount, due_date, payment_date, transaction_date,
                status, notes, original_amount, interest_amount, fee_amount,
                payment_type, transaction_type, account_id, origin, recurring_id
            ) VALUES (
                v_rec.partner_id,
                v_rec.description,
                v_category_name,
                v_rec.category_id,
                v_rec.subcategory_id,
                v_rec.contact_id,
                v_rec.contact_type,
                v_rec.customer_id,
                v_rec.amount,
                v_tx_date::date,
                NULL,
                v_tx_date,
                'pending',
                NULL,
                v_rec.amount,
                0,
                0,
                NULL,
                v_rec.type,
                v_rec.account_id,
                'system',
                v_rec.id
            );

            v_created := v_created + 1;
        END IF;

        v_next_run := public.financial_next_run_date(
            v_rec.frequency,
            v_rec.interval_value,
            v_rec.next_run_date,
            v_rec.start_date,
            v_rec.week_days,
            v_rec.month_day,
            v_rec.use_last_day,
            v_rec.year_month,
            v_rec.year_day
        );

        IF v_rec.end_date IS NOT NULL AND v_next_run > v_rec.end_date THEN
            UPDATE public.recurring_transactions
            SET active = FALSE,
                last_run_at = NOW(),
                execution_count = execution_count + 1,
                updated_at = NOW()
            WHERE id = v_rec.id;
            v_deactivated := v_deactivated + 1;
        ELSE
            UPDATE public.recurring_transactions
            SET last_run_at = NOW(),
                next_run_date = v_next_run,
                execution_count = execution_count + 1,
                updated_at = NOW()
            WHERE id = v_rec.id;
        END IF;
    END LOOP;

    RETURN QUERY SELECT v_processed, v_created, v_deactivated;
END;
$$;

REVOKE ALL ON FUNCTION public.process_due_recurring_transactions(INTEGER) FROM PUBLIC;
