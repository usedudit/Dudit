-- Migration: Recurring subscriptions cycle automation and advance cycle support
-- 1. Helper function to reset unconsumed credits of previous cycle and grant fresh credits for the new cycle
-- 2. Function to advance a subscription cycle manually (Antecipar Ciclo)
-- 3. Procedure to process due recurring subscriptions automatically
-- 4. Register pg_cron schedule if pg_cron is enabled

-- 1) Reset unconsumed credits and grant new credits for a subscription cycle
CREATE OR REPLACE FUNCTION public.reset_and_grant_subscription_credits(
    p_subscription_id UUID,
    p_execution_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_sub RECORD;
    v_item RECORD;
    v_old RECORD;
    v_expires_at TIMESTAMPTZ;
    v_idempotency TEXT;
    v_new_credit_id UUID;
    v_granted_total INT := 0;
BEGIN
    -- Fetch subscription and plan credit policy
    SELECT rs.id, rs.partner_id, rs.customer_id, rs.recurring_plan_id, rs.next_execution_at,
           rp.credit_expiration_policy, rp.credit_expiration_days
    INTO v_sub
    FROM public.recurring_subscriptions rs
    JOIN public.recurring_plans rp ON rp.id = rs.recurring_plan_id
    WHERE rs.id = p_subscription_id;

    IF v_sub IS NULL THEN
        RETURN 0;
    END IF;

    -- Calculate expiration timestamp
    IF v_sub.credit_expiration_policy = 'end_of_cycle' THEN
        v_expires_at := v_sub.next_execution_at;
    ELSIF v_sub.credit_expiration_policy = 'fixed_days' AND v_sub.credit_expiration_days IS NOT NULL THEN
        v_expires_at := NOW() + (v_sub.credit_expiration_days || ' days')::INTERVAL;
    ELSE
        v_expires_at := NULL;
    END IF;

    -- If policy is end_of_cycle, expire any unconsumed credits of previous cycles
    IF v_sub.credit_expiration_policy = 'end_of_cycle' THEN
        FOR v_old IN
            SELECT id, quantity, consumed, service_id, product_id
            FROM public.subscription_item_credits
            WHERE subscription_id = p_subscription_id
              AND quantity > consumed
        LOOP
            UPDATE public.subscription_item_credits
            SET consumed = quantity,
                updated_at = NOW()
            WHERE id = v_old.id;

            INSERT INTO public.subscription_item_credit_ledger (
                partner_id, customer_id, service_id, product_id,
                quantity, transaction_type, credit_id, execution_id,
                idempotency_key, created_at
            ) VALUES (
                v_sub.partner_id, v_sub.customer_id, v_old.service_id, v_old.product_id,
                -(v_old.quantity - v_old.consumed), 'expire', v_old.id, p_execution_id,
                'expire:' || v_old.id || ':' || COALESCE(p_execution_id::text, gen_random_uuid()::text),
                NOW()
            );
        END LOOP;
    END IF;

    -- Ensure snapshot items exist; if missing, snapshot from recurring_plan_items
    IF NOT EXISTS (
        SELECT 1 FROM public.recurring_subscription_items WHERE subscription_id = p_subscription_id
    ) THEN
        INSERT INTO public.recurring_subscription_items (
            subscription_id, item_type, product_id, variant_id, service_id,
            quantity, unit_price, staff_partner_user_id, preferred_time, duration_minutes, sort_order
        )
        SELECT 
            p_subscription_id,
            rpi.item_type,
            rpi.product_id,
            rpi.variant_id,
            rpi.service_id,
            rpi.quantity,
            COALESCE(
                rpi.unit_price,
                (CASE 
                    WHEN rpi.item_type = 'product' AND rpi.variant_id IS NOT NULL THEN (SELECT COALESCE(price, 0) FROM public.product_variants WHERE id = rpi.variant_id)
                    WHEN rpi.item_type = 'product' AND rpi.variant_id IS NULL THEN (SELECT COALESCE(price, 0) FROM public.products WHERE id = rpi.product_id)
                    WHEN rpi.item_type = 'service' THEN (SELECT COALESCE(price, 0) FROM public.services WHERE id = rpi.service_id)
                    ELSE 0.00
                END),
                0.00
            ),
            rpi.staff_partner_user_id,
            rpi.preferred_time,
            rpi.duration_minutes,
            rpi.sort_order
        FROM public.recurring_plan_items rpi
        WHERE rpi.plan_id = v_sub.recurring_plan_id;
    END IF;

    -- Grant credits for each item in recurring_subscription_items
    FOR v_item IN
        SELECT id, item_type, service_id, product_id, quantity
        FROM public.recurring_subscription_items
        WHERE subscription_id = p_subscription_id
          AND (
              (item_type = 'service' AND service_id IS NOT NULL)
              OR (item_type = 'product' AND product_id IS NOT NULL)
          )
    LOOP
        v_idempotency := 'grant:' || COALESCE(p_execution_id::text, gen_random_uuid()::text) || ':' || v_item.id::text;

        IF NOT EXISTS (
            SELECT 1 FROM public.subscription_item_credit_ledger WHERE idempotency_key = v_idempotency
        ) THEN
            INSERT INTO public.subscription_item_credits (
                partner_id, customer_id, subscription_id, subscription_item_id,
                service_id, product_id, quantity, consumed, expires_at, created_at, updated_at
            ) VALUES (
                v_sub.partner_id, v_sub.customer_id, p_subscription_id, v_item.id,
                v_item.service_id, v_item.product_id, v_item.quantity, 0, v_expires_at, NOW(), NOW()
            ) RETURNING id INTO v_new_credit_id;

            INSERT INTO public.subscription_item_credit_ledger (
                partner_id, customer_id, service_id, product_id,
                quantity, transaction_type, credit_id, execution_id,
                idempotency_key, created_at
            ) VALUES (
                v_sub.partner_id, v_sub.customer_id, v_item.service_id, v_item.product_id,
                v_item.quantity, 'grant', v_new_credit_id, p_execution_id,
                v_idempotency, NOW()
            );

            v_granted_total := v_granted_total + v_item.quantity;
        END IF;
    END LOOP;

    RETURN v_granted_total;
END;
$$;

-- 2) Advance subscription cycle manually (Antecipar Ciclo)
CREATE OR REPLACE FUNCTION public.advance_recurring_subscription_cycle(
    p_subscription_id UUID,
    p_actor_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_sub public.recurring_subscriptions%ROWTYPE;
    v_plan public.recurring_plans%ROWTYPE;
    v_next TIMESTAMPTZ;
    v_exec_id UUID;
    v_granted INT := 0;
BEGIN
    SELECT * INTO v_sub FROM public.recurring_subscriptions WHERE id = p_subscription_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Assinatura não encontrada');
    END IF;

    IF v_sub.status NOT IN ('active', 'awaiting_restock') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Apenas assinaturas ativas podem ter o ciclo antecipado');
    END IF;

    SELECT * INTO v_plan FROM public.recurring_plans WHERE id = v_sub.recurring_plan_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Plano da assinatura não encontrado');
    END IF;

    -- Calculate next execution from NOW()
    v_next := public.recurring_plan_next_execution_at(
        v_plan.frequency_type,
        v_plan.frequency_interval,
        NOW(),
        v_plan.start_date,
        v_plan.weekdays,
        v_plan.day_of_month,
        v_plan.use_last_day,
        v_plan.year_month,
        v_plan.year_day
    );

    -- Insert completed execution for this anticipated cycle
    INSERT INTO public.recurring_executions (
        subscription_id, partner_id, scheduled_for, status, completed_at
    ) VALUES (
        p_subscription_id, v_sub.partner_id, NOW(), 'completed', NOW()
    ) RETURNING id INTO v_exec_id;

    -- Advance subscription state
    IF v_plan.end_date IS NOT NULL AND v_next > v_plan.end_date THEN
        UPDATE public.recurring_subscriptions
        SET status = 'expired',
            last_execution_at = NOW(),
            next_execution_at = v_next,
            updated_at = NOW()
        WHERE id = p_subscription_id;
    ELSE
        UPDATE public.recurring_subscriptions
        SET last_execution_at = NOW(),
            next_execution_at = v_next,
            updated_at = NOW()
        WHERE id = p_subscription_id;
    END IF;

    -- Reset previous credits and grant fresh credits for the new cycle
    v_granted := public.reset_and_grant_subscription_credits(p_subscription_id, v_exec_id);

    RETURN jsonb_build_object(
        'success', true,
        'subscription_id', p_subscription_id,
        'execution_id', v_exec_id,
        'last_execution_at', NOW(),
        'next_execution_at', v_next,
        'granted_credits', v_granted
    );
END;
$$;

-- 3) Automatic procedure for processing due recurring executions
CREATE OR REPLACE FUNCTION public.cron_process_due_recurring_subscriptions(p_limit INTEGER DEFAULT 50)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_sub RECORD;
    v_next TIMESTAMPTZ;
    v_exec_id UUID;
    v_processed_count INT := 0;
BEGIN
    FOR v_sub IN
        SELECT rs.id, rs.partner_id, rs.next_execution_at,
               rp.frequency_type, rp.frequency_interval, rp.start_date,
               rp.weekdays, rp.day_of_month, rp.use_last_day,
               rp.year_month, rp.year_day, rp.end_date
        FROM public.recurring_subscriptions rs
        JOIN public.recurring_plans rp ON rp.id = rs.recurring_plan_id
        WHERE rs.status = 'active'
          AND rs.next_execution_at <= NOW()
          AND rp.status = 'active'
          AND (rp.end_date IS NULL OR rs.next_execution_at <= rp.end_date)
        ORDER BY rs.next_execution_at ASC
        LIMIT GREATEST(COALESCE(p_limit, 50), 1)
        FOR UPDATE OF rs SKIP LOCKED
    LOOP
        -- Calculate next execution date
        v_next := public.recurring_plan_next_execution_at(
            v_sub.frequency_type,
            v_sub.frequency_interval,
            v_sub.next_execution_at,
            v_sub.start_date,
            v_sub.weekdays,
            v_sub.day_of_month,
            v_sub.use_last_day,
            v_sub.year_month,
            v_sub.year_day
        );

        -- Create or update execution row
        INSERT INTO public.recurring_executions (
            subscription_id, partner_id, scheduled_for, status, completed_at
        ) VALUES (
            v_sub.id, v_sub.partner_id, v_sub.next_execution_at, 'completed', NOW()
        )
        ON CONFLICT ON CONSTRAINT recurring_executions_subscription_scheduled_unique
        DO UPDATE SET status = 'completed', completed_at = NOW(), error_message = NULL
        RETURNING id INTO v_exec_id;

        -- Advance subscription
        IF v_sub.end_date IS NOT NULL AND v_next > v_sub.end_date THEN
            UPDATE public.recurring_subscriptions
            SET status = 'expired',
                last_execution_at = v_sub.next_execution_at,
                next_execution_at = v_next,
                updated_at = NOW()
            WHERE id = v_sub.id;
        ELSE
            UPDATE public.recurring_subscriptions
            SET last_execution_at = v_sub.next_execution_at,
                next_execution_at = v_next,
                updated_at = NOW()
            WHERE id = v_sub.id;
        END IF;

        -- Reset previous credits and grant fresh credits for the new cycle
        PERFORM public.reset_and_grant_subscription_credits(v_sub.id, v_exec_id);

        v_processed_count := v_processed_count + 1;
    END LOOP;

    RETURN v_processed_count;
END;
$$;

-- Revoke execute from public, grant to service_role and authenticated
REVOKE ALL ON FUNCTION public.reset_and_grant_subscription_credits(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_recurring_subscription_cycle(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cron_process_due_recurring_subscriptions(INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.reset_and_grant_subscription_credits(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.advance_recurring_subscription_cycle(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.cron_process_due_recurring_subscriptions(INTEGER) TO service_role;

-- 4) Schedule in pg_cron if extension is available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) 
    FROM cron.job 
    WHERE jobname = 'dudit-process-due-recurring-subscriptions';

    PERFORM cron.schedule(
      'dudit-process-due-recurring-subscriptions',
      '*/5 * * * *',
      'SELECT public.cron_process_due_recurring_subscriptions(50);'
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron setup skipped: %', SQLERRM;
END $$;

