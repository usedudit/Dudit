-- ============================================================
-- Bulk recurring occurrences generation (single DB call)
-- Replaces N×400 serial RPC round trips from the application layer
-- ============================================================

-- Drop if exists for safe re-deploy
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
) LANGUAGE plpgsql SECURITY DEFINER AS $$
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

-- Restrict direct access — only callable via authenticated server actions
REVOKE ALL ON FUNCTION public.generate_recurring_occurrences_bulk(UUID, DATE) FROM PUBLIC;
