-- =============================================================================
-- Recurring Financial Transactions System (ledger-safe, idempotent)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) recurring_transactions table (templates)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recurring_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,

    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    description TEXT NOT NULL,

    frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
    interval_value INTEGER NOT NULL DEFAULT 1 CHECK (interval_value >= 1),

    week_days INTEGER[] NULL,
    month_day INTEGER NULL CHECK (month_day IS NULL OR (month_day >= 1 AND month_day <= 31)),
    use_last_day BOOLEAN NOT NULL DEFAULT FALSE,
    year_month INTEGER NULL CHECK (year_month IS NULL OR (year_month >= 1 AND year_month <= 12)),
    year_day INTEGER NULL CHECK (year_day IS NULL OR (year_day >= 1 AND year_day <= 31)),

    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NULL,
    next_run_date TIMESTAMPTZ NOT NULL,
    last_run_at TIMESTAMPTZ NULL,
    execution_count INTEGER NOT NULL DEFAULT 0,

    account_id UUID NULL REFERENCES public.finance_accounts(id) ON DELETE SET NULL,
    category_id UUID NULL REFERENCES public.financial_categories(id) ON DELETE SET NULL,
    subcategory_id UUID NULL REFERENCES public.financial_categories(id) ON DELETE SET NULL,
    contact_id UUID NULL REFERENCES public.transaction_contacts(id) ON DELETE SET NULL,
    contact_type TEXT NULL CHECK (contact_type IS NULL OR contact_type IN ('customer', 'supplier', 'service', 'employee', 'partner', 'other')),

    active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_transactions_partner_id
    ON public.recurring_transactions(partner_id);
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_next_run_date
    ON public.recurring_transactions(next_run_date);
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_active
    ON public.recurring_transactions(active);
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_partner_active_next
    ON public.recurring_transactions(partner_id, active, next_run_date);

-- -----------------------------------------------------------------------------
-- 2) transactions table updates for recurring ledger provenance
-- -----------------------------------------------------------------------------
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS recurring_id UUID NULL REFERENCES public.recurring_transactions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS transaction_date TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS category_id UUID NULL REFERENCES public.financial_categories(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS subcategory_id UUID NULL REFERENCES public.financial_categories(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS contact_type TEXT NULL;

UPDATE public.transactions
SET transaction_date = COALESCE(payment_date, due_date::timestamptz, created_at)
WHERE transaction_date IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN (
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_namespace n ON t.relnamespace = n.oid
        WHERE n.nspname = 'public'
          AND t.relname = 'transactions'
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) LIKE '%origin%'
    ) LOOP
        EXECUTE format('ALTER TABLE public.transactions DROP CONSTRAINT %I', r.conname);
    END LOOP;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_origin_check') THEN
        ALTER TABLE public.transactions
            ADD CONSTRAINT transactions_origin_check
            CHECK (origin IN ('manual', 'system', 'gateway'));
    END IF;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN (
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_namespace n ON t.relnamespace = n.oid
        WHERE n.nspname = 'public'
          AND t.relname = 'transactions'
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) LIKE '%contact_type%'
    ) LOOP
        EXECUTE format('ALTER TABLE public.transactions DROP CONSTRAINT %I', r.conname);
    END LOOP;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_contact_type_check') THEN
        ALTER TABLE public.transactions
            ADD CONSTRAINT transactions_contact_type_check
            CHECK (
                contact_type IS NULL OR
                contact_type IN ('customer', 'supplier', 'service', 'employee', 'partner', 'other')
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_recurring_id
    ON public.transactions(recurring_id);
CREATE INDEX IF NOT EXISTS idx_transactions_origin
    ON public.transactions(origin);
CREATE INDEX IF NOT EXISTS idx_transactions_transaction_date
    ON public.transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_contact_type
    ON public.transactions(contact_type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_recurring_date_unique
    ON public.transactions(recurring_id, transaction_date)
    WHERE recurring_id IS NOT NULL AND transaction_date IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3) RLS for recurring_transactions
-- -----------------------------------------------------------------------------
ALTER TABLE public.recurring_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recurring_transactions_select_own" ON public.recurring_transactions;
CREATE POLICY "recurring_transactions_select_own" ON public.recurring_transactions
  FOR SELECT USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "recurring_transactions_insert_own" ON public.recurring_transactions;
CREATE POLICY "recurring_transactions_insert_own" ON public.recurring_transactions
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "recurring_transactions_update_own" ON public.recurring_transactions;
CREATE POLICY "recurring_transactions_update_own" ON public.recurring_transactions
  FOR UPDATE USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "recurring_transactions_delete_own" ON public.recurring_transactions;
CREATE POLICY "recurring_transactions_delete_own" ON public.recurring_transactions
  FOR DELETE USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
  );

DROP TRIGGER IF EXISTS update_recurring_transactions_updated_at ON public.recurring_transactions;
CREATE TRIGGER update_recurring_transactions_updated_at
    BEFORE UPDATE ON public.recurring_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 4) Recurrence engine functions
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.financial_next_run_date(
    p_frequency TEXT,
    p_interval INTEGER,
    p_current_run TIMESTAMPTZ,
    p_start_date TIMESTAMPTZ,
    p_week_days INTEGER[],
    p_month_day INTEGER,
    p_use_last_day BOOLEAN,
    p_year_month INTEGER,
    p_year_day INTEGER
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
AS $$
DECLARE
    v_interval INTEGER := GREATEST(COALESCE(p_interval, 1), 1);
    v_candidate TIMESTAMPTZ;
    v_target_day INTEGER;
    v_month_start TIMESTAMPTZ;
    v_last_day INTEGER;
    v_y INTEGER;
    v_m INTEGER;
    v_d INTEGER;
    v_i INTEGER;
    v_dow INTEGER;
    v_weeks_from_start INTEGER;
BEGIN
    IF p_frequency = 'daily' THEN
        RETURN p_current_run + (v_interval || ' day')::interval;
    ELSIF p_frequency = 'weekly' THEN
        IF p_week_days IS NULL OR array_length(p_week_days, 1) IS NULL THEN
            RETURN p_current_run + (v_interval || ' week')::interval;
        END IF;

        v_candidate := p_current_run + interval '1 day';
        FOR v_i IN 1..800 LOOP
            v_dow := EXTRACT(DOW FROM v_candidate)::INTEGER;
            v_weeks_from_start := FLOOR((v_candidate::date - p_start_date::date) / 7.0);
            IF v_dow = ANY(p_week_days) AND (v_weeks_from_start % v_interval = 0) THEN
                RETURN v_candidate;
            END IF;
            v_candidate := v_candidate + interval '1 day';
        END LOOP;

        RETURN p_current_run + (v_interval || ' week')::interval;
    ELSIF p_frequency = 'monthly' THEN
        v_month_start := date_trunc('month', p_current_run) + (v_interval || ' month')::interval;
        v_last_day := EXTRACT(DAY FROM (v_month_start + interval '1 month - 1 day'))::INTEGER;
        IF COALESCE(p_use_last_day, false) THEN
            v_target_day := v_last_day;
        ELSE
            v_target_day := LEAST(COALESCE(p_month_day, EXTRACT(DAY FROM p_start_date)::INTEGER), v_last_day);
        END IF;
        RETURN (
            (date_trunc('month', v_month_start)::date + (v_target_day - 1))
            + p_current_run::time
        )::timestamptz;
    ELSIF p_frequency = 'yearly' THEN
        v_y := EXTRACT(YEAR FROM p_current_run + (v_interval || ' year')::interval)::INTEGER;
        v_m := COALESCE(p_year_month, EXTRACT(MONTH FROM p_start_date)::INTEGER);
        v_d := COALESCE(p_year_day, EXTRACT(DAY FROM p_start_date)::INTEGER);
        v_last_day := EXTRACT(DAY FROM (make_date(v_y, v_m, 1) + interval '1 month - 1 day'))::INTEGER;
        v_d := LEAST(v_d, v_last_day);
        RETURN (make_date(v_y, v_m, v_d) + p_current_run::time)::timestamptz;
    END IF;

    RETURN p_current_run + interval '1 month';
END;
$$;

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
                contact_id, contact_type, amount, due_date, payment_date, transaction_date,
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

