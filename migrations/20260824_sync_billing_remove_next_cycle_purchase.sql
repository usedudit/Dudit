-- ============================================================================
-- Remove pre-generated "next cycle" purchase from sync_subscription_to_billing.
--
-- When MP charges the card successfully → webhook fires → sync creates the
-- CURRENT purchase as "completed" with invoice.
-- When MP fails → sync creates the CURRENT purchase as "pending" (past_due).
-- The "next" purchase is NOT pre-generated - it will be created when the
-- actual payment webhook arrives for the next cycle.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_subscription_to_billing(
    sub_id UUID,
    p_status_override TEXT DEFAULT NULL,
    p_period_start TIMESTAMPTZ DEFAULT NULL,
    p_period_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    sub_record RECORD;
    partner_record RECORD;
    existing RECORD;
    existing_pay RECORD;
    purchase_status TEXT;
    target_sub_status TEXT;
    v_purchase_id UUID;
    v_now TIMESTAMPTZ := now();
    period_start TIMESTAMPTZ;
    period_end TIMESTAMPTZ;
    next_start TIMESTAMPTZ;
    next_end TIMESTAMPTZ;
    plan_price NUMERIC;
    descr TEXT;
    mp_sub_id TEXT;
    current_inv TEXT;
BEGIN
    SELECT s.*, p.id AS plan_id, p.name AS plan_name, p.price AS plan_price, p.slug AS plan_slug
    INTO sub_record
    FROM subscriptions s
    LEFT JOIN plans p ON p.id = s.plan_id
    WHERE s.id = sub_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Subscription not found');
    END IF;

    -- ── 1. Processar override de status e datas (se informados) ──
    IF p_status_override IS NOT NULL AND trim(p_status_override) <> '' THEN
        target_sub_status := CASE lower(trim(p_status_override))
            WHEN 'active'    THEN 'active'
            WHEN 'trial'     THEN 'trialing'
            WHEN 'trialing'  THEN 'trialing'
            WHEN 'pending'   THEN 'pending'
            WHEN 'past_due'  THEN 'past_due'
            WHEN 'error'     THEN 'past_due'
            WHEN 'failed'    THEN 'past_due'
            WHEN 'rejected'  THEN 'past_due'
            WHEN 'unpaid'    THEN 'past_due'
            WHEN 'cancelled' THEN 'cancelled'
            WHEN 'canceled'  THEN 'cancelled'
            WHEN 'paused'    THEN 'paused'
            ELSE lower(trim(p_status_override))
        END;

        UPDATE subscriptions
        SET status = target_sub_status::subscription_status,
            current_period_start = COALESCE(p_period_start, current_period_start, v_now),
            current_period_end = COALESCE(p_period_end, current_period_end, v_now + interval '1 month'),
            past_due_at = CASE WHEN target_sub_status = 'past_due' THEN COALESCE(past_due_at, v_now) ELSE NULL END,
            trial_end = CASE WHEN target_sub_status = 'trialing' THEN COALESCE(p_period_end, current_period_end, v_now + interval '14 days') ELSE trial_end END,
            cancelled_at = CASE WHEN target_sub_status = 'cancelled' THEN COALESCE(cancelled_at, v_now) ELSE cancelled_at END,
            ended_at = CASE WHEN target_sub_status = 'cancelled' THEN COALESCE(ended_at, v_now) ELSE ended_at END,
            updated_at = v_now
        WHERE id = sub_id;

        SELECT s.*, p.id AS plan_id, p.name AS plan_name, p.price AS plan_price, p.slug AS plan_slug
        INTO sub_record
        FROM subscriptions s
        LEFT JOIN plans p ON p.id = s.plan_id
        WHERE s.id = sub_id;
    END IF;

    SELECT * INTO partner_record FROM partners WHERE id = sub_record.partner_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Partner not found');
    END IF;

    plan_price := COALESCE(sub_record.plan_price, 0);
    descr := CASE WHEN sub_record.plan_name IS NOT NULL THEN 'Plano ' || sub_record.plan_name ELSE 'Assinatura' END;
    mp_sub_id := sub_record.mercado_pago_subscription_id;

    purchase_status := CASE sub_record.status
        WHEN 'active'   THEN 'completed'
        WHEN 'trialing' THEN 'completed'
        WHEN 'past_due' THEN 'pending'
        WHEN 'pending'  THEN 'pending'
        WHEN 'cancelled' THEN 'cancelled'
        WHEN 'paused'   THEN 'pending'
        ELSE 'pending'
    END;

    -- Computa os períodos
    period_start := COALESCE(p_period_start, sub_record.current_period_start, sub_record.created_at, v_now);
    period_end := COALESCE(p_period_end, sub_record.current_period_end, period_start + interval '1 month');
    IF period_end <= v_now AND sub_record.status IN ('active', 'trialing') THEN
        next_start := period_start + interval '1 month';
        WHILE next_start <= v_now LOOP
            next_start := next_start + interval '1 month';
        END LOOP;
        period_end := next_start;
    ELSE
        next_start := period_end;
    END IF;
    next_end := next_start + interval '1 month';

    -- ── 2. PURCHASE do ciclo ATUAL (upsert) ──
    SELECT bp.* INTO existing
    FROM billing_purchases bp
    WHERE bp.subscription_id = sub_id
      AND bp.billing_period_start IS NOT NULL
      AND bp.billing_period_start::date = period_start::date
    ORDER BY bp.created_at DESC LIMIT 1;

    IF existing.id IS NULL THEN
        SELECT bp.* INTO existing
        FROM billing_purchases bp
        WHERE bp.subscription_id = sub_id AND bp.status = 'completed'
        ORDER BY bp.created_at DESC LIMIT 1;
    END IF;

    IF existing.id IS NULL THEN
        SELECT bp.* INTO existing
        FROM billing_purchases bp
        WHERE bp.subscription_id = sub_id
        ORDER BY bp.created_at DESC LIMIT 1;
    END IF;

    IF existing.id IS NOT NULL THEN
        UPDATE billing_purchases
        SET status = purchase_status,
            amount = plan_price,
            total_amount = plan_price,
            description = descr,
            billing_period_start = COALESCE(billing_period_start, period_start),
            billing_period_end = COALESCE(billing_period_end, period_end),
            gateway_payment_id = COALESCE(mp_sub_id, gateway_payment_id),
            gateway_status = sub_record.status,
            metadata = metadata || jsonb_build_object(
                'synced_via', 'sql',
                'synced_at', v_now,
                'subscription_status', sub_record.status,
                'billing_cycle', 'current'
            ),
            updated_at = v_now
        WHERE id = existing.id;
        v_purchase_id := existing.id;
    ELSE
        INSERT INTO billing_purchases (
            partner_id, user_id, purchase_type, purchaseable_type, purchaseable_id,
            amount, total_amount, discount_amount, currency, status, gateway,
            gateway_payment_id, gateway_status, subscription_id, description,
            billing_period_start, billing_period_end, metadata
        ) VALUES (
            sub_record.partner_id, partner_record.user_id, 'subscription', 'plan', sub_record.plan_id,
            plan_price, plan_price, 0, 'BRL', purchase_status, 'mercado_pago',
            mp_sub_id, sub_record.status, sub_id, descr,
            period_start, period_end,
            jsonb_build_object(
                'plan_name', sub_record.plan_name,
                'plan_slug', sub_record.plan_slug,
                'billing_cycle', 'current',
                'subscription_status', sub_record.status,
                'synced_via', 'sql',
                'synced_at', v_now
            )
        )
        RETURNING id INTO v_purchase_id;
    END IF;

    -- ── 3. Pagamento (conforme o status da assinatura) ──
    SELECT bp.* INTO existing_pay
    FROM billing_payments bp
    WHERE bp.purchase_id = v_purchase_id
    ORDER BY bp.created_at DESC LIMIT 1;

    IF sub_record.status IN ('active', 'trialing') THEN
        IF existing_pay.id IS NOT NULL THEN
            UPDATE billing_payments
            SET status = 'approved',
                amount = plan_price,
                net_amount = plan_price,
                paid_at = COALESCE(paid_at, v_now),
                gateway_status = sub_record.status,
                updated_at = v_now
            WHERE id = existing_pay.id;
        ELSE
            INSERT INTO billing_payments (
                purchase_id, amount, currency, fee_amount, net_amount,
                status, gateway, gateway_payment_id, gateway_status, paid_at
            ) VALUES (
                v_purchase_id, plan_price, 'BRL', 0, plan_price,
                'approved', 'mercado_pago', mp_sub_id, sub_record.status, v_now
            );
        END IF;
    ELSIF sub_record.status = 'past_due' THEN
        IF existing_pay.id IS NOT NULL THEN
            UPDATE billing_payments
            SET status = 'rejected',
                gateway_status = 'rejected',
                paid_at = NULL,
                updated_at = v_now
            WHERE id = existing_pay.id;
        ELSE
            INSERT INTO billing_payments (
                purchase_id, amount, currency, fee_amount, net_amount,
                status, gateway, gateway_payment_id, gateway_status, paid_at
            ) VALUES (
                v_purchase_id, plan_price, 'BRL', 0, plan_price,
                'rejected', 'mercado_pago', mp_sub_id, 'rejected', NULL
            );
        END IF;
    ELSIF sub_record.status = 'cancelled' AND existing_pay.id IS NOT NULL THEN
        UPDATE billing_payments
        SET status = 'cancelled', updated_at = v_now
        WHERE id = existing_pay.id AND status = 'pending';
    END IF;

    -- ── 4. Fatura do ciclo ATUAL ──
    IF purchase_status IN ('completed', 'pending') THEN
        PERFORM billing_generate_invoice_for_purchase(v_purchase_id);
    END IF;

    -- ── 5. Limpar purchases "next" pendentes stale ──
    -- A próxima fatura NÃO é pré-gerada aqui. Ela será criada quando o webhook
    -- do MP vier com o próximo pagamento (approved → completed, failed → past_due).
    UPDATE billing_purchases
    SET status = 'cancelled', updated_at = v_now
    WHERE subscription_id = sub_id
      AND status = 'pending'
      AND id <> v_purchase_id;

    -- Obter número de fatura para o retorno
    SELECT invoice_number INTO current_inv FROM billing_invoices WHERE purchase_id = v_purchase_id LIMIT 1;

    RETURN jsonb_build_object(
        'success', true,
        'subscription_id', sub_id,
        'partner_id', sub_record.partner_id,
        'subscription_status', sub_record.status,
        'plan_name', sub_record.plan_name,
        'plan_price', plan_price,
        'current_purchase_id', v_purchase_id,
        'current_purchase_status', purchase_status,
        'current_period_start', period_start,
        'current_period_end', period_end,
        'current_invoice_number', current_inv,
        'next_purchase_id', null,
        'next_due_date', null,
        'next_invoice_number', null
    );
END;
$$;
