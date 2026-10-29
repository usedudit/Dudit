-- ============================================================================
-- Fix manual billing sync (sync_subscription_to_billing) for the cycle model
-- ============================================================================
-- The manual RPC predates the calendar-cycle billing model introduced in
-- 20261028_subscription_billing_cycle_integrity.sql. It had several problems:
--
--   1. Two overloads existed: sync_subscription_to_billing(uuid) (legacy) and
--      sync_subscription_to_billing(uuid, text, timestamptz, timestamptz).
--      Because PostgreSQL prefers the exact argument match, a plain
--      `SELECT sync_subscription_to_billing('id')` silently ran the OLD
--      implementation. This migration drops the legacy overload and keeps a
--      single function (all extra parameters are optional), so one call always
--      runs the same code.
--   2. It wrote no billing_cycle_start, so the per-cycle unique index could not
--      protect manual syncs and the same cycle could get more than one invoice.
--   3. It matched the cycle by `billing_period_start::date` and could reuse the
--      last completed/pending purchase from ANOTHER cycle.
--   4. It rewrote `current_period_start/end` to `now()/now() + 1 month`,
--      drifting the renewal date on every sync.
--   5. It derived the purchase status from the global subscription status, and
--      overwrote existing payments, so a paid cycle could turn into "pending"
--      (or a pending purchase into "completed") without any real charge.
--   6. It cleared `cancel_at_period_end` whenever the status was active,
--      erasing a cancellation already scheduled for the end of the paid cycle.
--   7. It DELETED other pending purchases/invoices instead of cancelling them.
--
-- The function below follows the same invariants as the production TypeScript
-- implementation (lib/billing/sync-subscription.ts + lib/billing/record-charge.ts):
--
--   * Cycles are anchored on the subscription day (America/Sao_Paulo), clamped
--     per month; a cycle is [start, end) in local calendar days.
--   * One billing_purchases row per subscription per cycle, identified by
--     billing_cycle_start (YYYY-MM-DD local).
--   * A closed/paid cycle is never rewritten (period and amount are preserved).
--   * The purchase status is derived from the payments of its OWN cycle.
--   * Status-only syncs do not invent Mercado Pago charges: by default a cycle
--     payment is only recorded for subscriptions that are NOT billed by a
--     Mercado Pago preapproval (manual/PIX/cash). Pass p_record_payment = true
--     to force it (test/simulation) or false to never touch payments.
--   * Other pending cycles are cancelled (history kept), never deleted.
--   * Partner notifications/audit stay in the app path; this is an ops tool.
--
-- After this migration:
--   SELECT sync_subscription_to_billing('ID_DA_SUBSCRIPTION');
--   SELECT sync_subscription_to_billing('ID_DA_SUBSCRIPTION', 'active');
--   SELECT sync_subscription_to_billing('ID_DA_SUBSCRIPTION', 'past_due', NULL, NULL, true);
--   SELECT sync_subscription_to_billing('ID_DA_SUBSCRIPTION', 'active', now(), now() + interval '1 month', true);
-- ============================================================================

BEGIN;

-- ─── 1. One function only ────────────────────────────────────────────────────

-- Without this, a 1-argument call keeps resolving to the legacy implementation.
DROP FUNCTION IF EXISTS public.sync_subscription_to_billing(uuid);
DROP FUNCTION IF EXISTS public.sync_subscription_to_billing(uuid, text, timestamp with time zone, timestamp with time zone);

-- ─── 2. Cycle helpers (same math as lib/billing/subscription-period.ts) ──────

-- Start of the cycle (local calendar date) that contains p_instant.
-- The anchor day is always recomputed from the original anchor, so a
-- subscription anchored on the 31st goes 31 -> 28/29 -> 31 and never drifts.
CREATE OR REPLACE FUNCTION public.billing_cycle_start_date(
    p_anchor date,
    p_anchor_day int,
    p_instant date
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_day int;
    v_months int;
    v_month date;
BEGIN
    v_day := LEAST(GREATEST(COALESCE(p_anchor_day, EXTRACT(DAY FROM p_anchor)::int), 1), 31);

    v_months := (EXTRACT(YEAR FROM p_instant)::int - EXTRACT(YEAR FROM p_anchor)::int) * 12
              + (EXTRACT(MONTH FROM p_instant)::int - EXTRACT(MONTH FROM p_anchor)::int);

    v_month := (date_trunc('month', p_anchor::timestamp) + make_interval(months => v_months))::date;

    -- The clamped day of that month may be after the instant (anchor on the
    -- 31st, instant on the 28th): then the instant belongs to the previous one.
    IF (v_month + (LEAST(v_day, EXTRACT(DAY FROM (v_month + interval '1 month' - interval '1 day'))::int) - 1)) > p_instant THEN
        v_month := (v_month - interval '1 month')::date;
    END IF;

    RETURN v_month + (LEAST(v_day, EXTRACT(DAY FROM (v_month + interval '1 month' - interval '1 day'))::int) - 1);
END;
$$;

-- Start of the cycle that follows p_cycle_start (next calendar month, anchor
-- day clamped). Recomputed from the month, never by adding a month to the
-- clamped date (that would turn Jan 31 -> Feb 28 -> Mar 28).
CREATE OR REPLACE FUNCTION public.billing_cycle_next_start(
    p_cycle_start date,
    p_anchor_day int
)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT (date_trunc('month', p_cycle_start::timestamp) + interval '1 month')::date
         + (
             LEAST(
                 GREATEST(COALESCE(p_anchor_day, EXTRACT(DAY FROM p_cycle_start)::int), 1),
                 EXTRACT(DAY FROM (
                     date_trunc('month', p_cycle_start::timestamp) + interval '2 months' - interval '1 day'
                 ))::int
             ) - 1
         );
$$;

-- ─── 3. Manual sync ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_subscription_to_billing(
    sub_id uuid,
    p_status_override text DEFAULT NULL,
    p_period_start timestamptz DEFAULT NULL,
    p_period_end timestamptz DEFAULT NULL,
    p_record_payment boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
    sub_record RECORD;
    partner_record RECORD;
    existing RECORD;
    existing_pay RECORD;
    v_now timestamptz := now();
    v_previous_status text;
    v_status text;
    v_anchor timestamptz;
    v_anchor_local date;
    v_anchor_day int;
    v_target_local date;
    v_cycle_start date;
    v_cycle_end date;
    v_period_start timestamptz;
    v_period_end timestamptz;
    v_move_period boolean := false;
    v_period_broken boolean := false;
    v_plan_price numeric;
    v_description text;
    v_mp_preapproval text;
    v_gateway text;
    v_record_payment boolean;
    v_payment_written boolean := false;
    v_payment_status text;
    v_paid_at timestamptz;
    v_purchase_id uuid;
    v_purchase_status text;
    v_purchase_created boolean := false;
    v_amount numeric;
    v_has_approved boolean := false;
    v_has_refund boolean := false;
    v_has_any boolean := false;
    v_stored_start timestamptz;
    v_stored_end timestamptz;
    v_invoice_number text;
BEGIN
    SELECT s.*,
           p.id AS plan_id,
           p.name AS plan_name,
           p.price AS plan_price,
           p.slug AS plan_slug
      INTO sub_record
      FROM subscriptions s
      LEFT JOIN plans p ON p.id = s.plan_id
     WHERE s.id = sub_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Subscription not found');
    END IF;

    SELECT * INTO partner_record FROM partners WHERE id = sub_record.partner_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Partner not found');
    END IF;

    v_previous_status := sub_record.status::text;
    v_status := v_previous_status;

    -- ── 1. Status override (same aliases the app accepts) ────────────────────
    IF p_status_override IS NOT NULL AND trim(p_status_override) <> '' THEN
        v_status := CASE lower(trim(p_status_override))
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
            WHEN 'refunded'  THEN 'cancelled'
            WHEN 'refund'    THEN 'cancelled'
            WHEN 'paused'    THEN 'paused'
            ELSE lower(trim(p_status_override))
        END;

        IF v_status NOT IN ('trialing', 'active', 'past_due', 'cancelled', 'paused', 'pending') THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', format('Invalid subscription status: %s', v_status)
            );
        END IF;
    END IF;

    -- ── 2. Resolve the billing cycle (America/Sao_Paulo calendar days) ───────
    v_anchor := COALESCE(sub_record.created_at, sub_record.current_period_start, v_now);
    v_anchor_local := (v_anchor AT TIME ZONE 'America/Sao_Paulo')::date;
    v_anchor_day := COALESCE(
        NULLIF(sub_record.billing_anchor_day, 0),
        EXTRACT(DAY FROM v_anchor_local)::int
    );

    -- An explicit period_start selects the cycle being synced (e.g. the real
    -- Mercado Pago debit date). Without it, sync the cycle that contains now(),
    -- except for a cancelled subscription: its last (paid) cycle is the one
    -- that started at current_period_start — never the cycle of today.
    v_target_local := COALESCE(
        (p_period_start AT TIME ZONE 'America/Sao_Paulo')::date,
        CASE
            WHEN v_status = 'cancelled' AND sub_record.current_period_start IS NOT NULL
                THEN (sub_record.current_period_start AT TIME ZONE 'America/Sao_Paulo')::date
        END,
        (v_now AT TIME ZONE 'America/Sao_Paulo')::date
    );

    v_cycle_start := public.billing_cycle_start_date(v_anchor_local, v_anchor_day, v_target_local);
    v_cycle_end := public.billing_cycle_next_start(v_cycle_start, v_anchor_day);

    v_period_start := v_cycle_start::timestamp AT TIME ZONE 'America/Sao_Paulo';
    v_period_end := v_cycle_end::timestamp AT TIME ZONE 'America/Sao_Paulo';

    v_stored_start := sub_record.current_period_start;
    v_stored_end := sub_record.current_period_end;
    v_period_broken := v_stored_start IS NULL
        OR v_stored_end IS NULL
        OR v_stored_end <= v_stored_start;

    -- Only move the period forward: a late/old cycle must never rewind access.
    v_move_period := p_period_start IS NOT NULL
        AND (
            v_stored_start IS NULL
            OR v_cycle_start > (v_stored_start AT TIME ZONE 'America/Sao_Paulo')::date
        );

    -- ── 3. Subscription status + period ──────────────────────────────────────
    UPDATE subscriptions
       SET status = v_status::subscription_status,
           current_period_start = CASE
               WHEN v_move_period THEN v_period_start
               WHEN v_period_broken THEN v_period_start
               ELSE current_period_start
           END,
           current_period_end = CASE
               WHEN p_period_end IS NOT NULL
                    AND p_period_end > (CASE WHEN v_move_period OR v_period_broken
                                             THEN v_period_start ELSE current_period_start END)
                   THEN p_period_end
               WHEN v_move_period OR v_period_broken THEN v_period_end
               ELSE current_period_end
           END,
           billing_anchor_day = CASE
               WHEN v_move_period THEN COALESCE(billing_anchor_day, v_anchor_day)
               ELSE billing_anchor_day
           END,
           past_due_at = CASE
               WHEN v_status = 'past_due' THEN COALESCE(past_due_at, v_now)
               WHEN v_status IN ('active', 'trialing', 'cancelled') THEN NULL
               ELSE past_due_at
           END,
           trial_end = CASE
               WHEN v_status = 'trialing' THEN COALESCE(trial_end, v_period_end)
               ELSE trial_end
           END,
           cancelled_at = CASE
               WHEN v_status = 'cancelled' THEN COALESCE(cancelled_at, v_now)
               WHEN v_status IN ('active', 'trialing') THEN NULL
               ELSE cancelled_at
           END,
           ended_at = CASE
               WHEN v_status = 'cancelled' THEN COALESCE(ended_at, v_now)
               WHEN v_status IN ('active', 'trialing') THEN NULL
               ELSE ended_at
           END,
           -- A cancellation scheduled for the end of the paid cycle is only
           -- cleared by a real reactivation (or a definitive cancellation).
           cancel_at_period_end = CASE
               WHEN v_status = 'cancelled' THEN false
               WHEN v_status IN ('active', 'trialing')
                    AND v_previous_status NOT IN ('active', 'trialing') THEN false
               ELSE cancel_at_period_end
           END,
           updated_at = v_now
     WHERE id = sub_id;

    -- ── 4. Plan data ─────────────────────────────────────────────────────────
    v_plan_price := COALESCE(sub_record.plan_price, 0);
    v_description := CASE
        WHEN sub_record.plan_name IS NOT NULL THEN 'Plano ' || sub_record.plan_name
        ELSE 'Assinatura'
    END;
    v_mp_preapproval := sub_record.mercado_pago_subscription_id;
    v_gateway := CASE WHEN v_mp_preapproval IS NULL THEN 'manual' ELSE 'mercado_pago' END;

    -- NULL = auto: only off-gateway subscriptions get a locally recorded
    -- payment. Mercado Pago cycles are settled by the webhook/reconciliation.
    v_record_payment := COALESCE(p_record_payment, v_mp_preapproval IS NULL);

    -- ── 5. Purchase of THIS cycle (never another cycle) ──────────────────────
    SELECT bp.*
      INTO existing
      FROM billing_purchases bp
     WHERE bp.subscription_id = sub_id
       AND (
            bp.billing_cycle_start = v_cycle_start
         OR (
                bp.billing_cycle_start IS NULL
                AND (
                    bp.metadata->>'cycle_key' = to_char(v_cycle_start, 'YYYY-MM-DD')
                    OR (
                        bp.billing_period_start IS NOT NULL
                        AND (bp.billing_period_start AT TIME ZONE 'America/Sao_Paulo')::date = v_cycle_start
                    )
                )
            )
       )
     ORDER BY (bp.billing_cycle_start = v_cycle_start) DESC NULLS LAST,
              bp.created_at DESC
     LIMIT 1;

    IF existing.id IS NOT NULL THEN
        SELECT COALESCE(bool_or(bp.status = 'approved'), false),
               COALESCE(bool_or(bp.status IN ('refunded', 'chargeback')), false),
               count(*) > 0
          INTO v_has_approved, v_has_refund, v_has_any
          FROM billing_payments bp
         WHERE bp.purchase_id = existing.id;
    END IF;

    -- Payment status requested for this cycle by the target status.
    v_payment_status := CASE
        WHEN v_status IN ('active', 'trialing') THEN 'approved'
        WHEN v_status = 'past_due' THEN 'rejected'
        WHEN v_status = 'cancelled' THEN 'cancelled'
        ELSE 'pending'
    END;

    IF existing.id IS NULL THEN
        v_purchase_status := CASE
            WHEN v_status = 'cancelled' THEN 'cancelled'
            WHEN v_record_payment AND v_status IN ('active', 'trialing') THEN 'completed'
            ELSE 'pending'
        END;
    ELSE
        -- Status comes from the payment of THIS cycle; a paid cycle never
        -- regresses because the global subscription is past_due/cancelled.
        v_purchase_status := existing.status;

        IF v_has_approved THEN
            v_purchase_status := 'completed';
        ELSIF v_has_refund THEN
            v_purchase_status := 'refunded';
        ELSIF existing.status IN ('completed', 'refunded', 'partially_refunded') THEN
            -- Closed cycle: keep it as is.
            v_purchase_status := existing.status;
        ELSIF v_status = 'cancelled' THEN
            v_purchase_status := 'cancelled';
        ELSIF v_record_payment AND v_status IN ('active', 'trialing') THEN
            v_purchase_status := 'completed';
        ELSE
            v_purchase_status := 'pending';
        END IF;
    END IF;

    IF existing.id IS NOT NULL THEN
        v_purchase_id := existing.id;

        -- Closed cycles keep their amount/description; only broken periods and
        -- the cycle key are repaired.
        UPDATE billing_purchases
           SET status = v_purchase_status,
               billing_cycle_start = COALESCE(billing_cycle_start, v_cycle_start),
               billing_period_start = CASE
                   WHEN billing_period_start IS NULL
                        OR billing_period_end IS NULL
                        OR billing_period_end <= billing_period_start
                       THEN v_period_start
                   ELSE billing_period_start
               END,
               billing_period_end = CASE
                   WHEN billing_period_start IS NULL
                        OR billing_period_end IS NULL
                        OR billing_period_end <= billing_period_start
                       THEN v_period_end
                   ELSE billing_period_end
               END,
               amount = CASE
                   WHEN existing.status IN ('completed', 'refunded', 'partially_refunded')
                       THEN existing.amount
                   ELSE v_plan_price
               END,
               total_amount = CASE
                   WHEN existing.status IN ('completed', 'refunded', 'partially_refunded')
                       THEN existing.total_amount
                   ELSE v_plan_price
               END,
               description = CASE
                   WHEN existing.status IN ('completed', 'refunded', 'partially_refunded')
                       THEN existing.description
                   ELSE v_description
               END,
               gateway_status = v_status,
               metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                   'plan_name', sub_record.plan_name,
                   'plan_slug', sub_record.plan_slug,
                   'cycle_key', to_char(v_cycle_start, 'YYYY-MM-DD'),
                   'billing_cycle', 'current',
                   'subscription_status', v_status,
                   'synced_via', 'sql',
                   'synced_at', v_now
               ),
               updated_at = v_now
         WHERE id = existing.id;
    ELSIF v_status <> 'cancelled' AND v_plan_price > 0 THEN
        -- A cancelled subscription without a purchase for this cycle never had
        -- a charge: do not invent a cancelled invoice for it.
        INSERT INTO billing_purchases (
            partner_id, user_id, purchase_type, purchaseable_type, purchaseable_id,
            amount, total_amount, discount_amount, currency, status, gateway,
            gateway_payment_id, gateway_status, subscription_id, description,
            billing_period_start, billing_period_end, billing_cycle_start, metadata
        ) VALUES (
            sub_record.partner_id, partner_record.user_id, 'subscription', 'plan', sub_record.plan_id,
            v_plan_price, v_plan_price, 0, 'BRL', v_purchase_status, v_gateway,
            NULL, v_status, sub_id, v_description,
            v_period_start, v_period_end, v_cycle_start,
            jsonb_build_object(
                'plan_name', sub_record.plan_name,
                'plan_slug', sub_record.plan_slug,
                'cycle_key', to_char(v_cycle_start, 'YYYY-MM-DD'),
                'billing_cycle', 'current',
                'subscription_status', v_status,
                'synced_via', 'sql',
                'synced_at', v_now
            )
        )
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_purchase_id;

        IF v_purchase_id IS NOT NULL THEN
            v_purchase_created := true;
        ELSE
            -- Concurrent insert of the same cycle (unique index).
            SELECT bp.id INTO v_purchase_id
              FROM billing_purchases bp
             WHERE bp.subscription_id = sub_id
               AND bp.billing_cycle_start = v_cycle_start
             LIMIT 1;
        END IF;
    END IF;

    -- ── 6. Payment of THIS cycle ─────────────────────────────────────────────
    IF v_purchase_id IS NOT NULL THEN
        SELECT * INTO existing_pay
          FROM billing_payments
         WHERE purchase_id = v_purchase_id
         ORDER BY (status = 'approved') DESC, created_at DESC
         LIMIT 1;

        IF v_record_payment
           AND v_status IN ('active', 'trialing', 'past_due')
           AND v_plan_price > 0 THEN
            IF existing_pay.id IS NOT NULL THEN
                -- Never "unpay" an approved cycle (nor undo a refund) because a
                -- later/duplicated status arrived out of order.
                IF existing_pay.status IN ('approved', 'refunded', 'chargeback') THEN
                    v_payment_status := existing_pay.status;
                    v_paid_at := existing_pay.paid_at;
                ELSE
                    v_paid_at := CASE WHEN v_payment_status = 'approved'
                                      THEN COALESCE(existing_pay.paid_at, v_now)
                                      ELSE NULL END;
                END IF;

                UPDATE billing_payments
                   SET status = v_payment_status,
                       gateway_status = v_status,
                       amount = v_plan_price,
                       net_amount = v_plan_price,
                       paid_at = v_paid_at,
                       updated_at = v_now
                 WHERE id = existing_pay.id;

                v_payment_written := true;
            ELSE
                v_paid_at := CASE WHEN v_payment_status = 'approved' THEN v_now ELSE NULL END;

                INSERT INTO billing_payments (
                    purchase_id, amount, currency, fee_amount, net_amount,
                    status, gateway, gateway_payment_id, gateway_status, paid_at
                ) VALUES (
                    v_purchase_id, v_plan_price, 'BRL', 0, v_plan_price,
                    v_payment_status, v_gateway, NULL, v_status, v_paid_at
                );

                v_payment_written := true;
            END IF;
        ELSIF v_status = 'cancelled' AND existing_pay.id IS NOT NULL THEN
            -- Only cycles that were never paid are cancelled; money already
            -- received stays approved on its own cycle.
            UPDATE billing_payments
               SET status = 'cancelled',
                   paid_at = NULL,
                   gateway_status = v_status,
                   updated_at = v_now
             WHERE id = existing_pay.id
               AND status IN ('pending', 'processing', 'rejected');
        END IF;
    END IF;

    -- ── 7. Invoice of THIS cycle (create once, keep the snapshot fresh) ──────
    IF v_purchase_id IS NOT NULL THEN
        IF v_purchase_status IN ('completed', 'pending') THEN
            PERFORM billing_generate_invoice_for_purchase(v_purchase_id);
        END IF;

        SELECT bp.billing_period_start, bp.billing_period_end, bp.amount,
               bp.discount_amount, bp.total_amount, bp.currency, bp.description
          INTO existing
          FROM billing_purchases bp
         WHERE bp.id = v_purchase_id;

        SELECT bpay.status, bpay.paid_at
          INTO v_payment_status, v_paid_at
          FROM billing_payments bpay
         WHERE bpay.purchase_id = v_purchase_id
         ORDER BY (bpay.status = 'approved') DESC, bpay.created_at DESC
         LIMIT 1;

        IF NOT FOUND THEN
            v_payment_status := NULL;
            v_paid_at := NULL;
        END IF;

        UPDATE billing_invoices i
           SET invoice_data = COALESCE(i.invoice_data, '{}'::jsonb) || jsonb_build_object(
                   'period', jsonb_build_object(
                       'start', existing.billing_period_start,
                       'end', existing.billing_period_end
                   ),
                   'payment', COALESCE(i.invoice_data->'payment', '{}'::jsonb) || jsonb_build_object(
                       'status', COALESCE(v_payment_status, v_purchase_status),
                       'paid_at', v_paid_at
                   ),
                   'purchase', COALESCE(i.invoice_data->'purchase', '{}'::jsonb) || jsonb_build_object(
                       'description', existing.description,
                       'amount', existing.amount,
                       'discount_amount', existing.discount_amount,
                       'total_amount', existing.total_amount,
                       'currency', existing.currency
                   ),
                   'status', CASE
                       WHEN v_purchase_status = 'refunded'
                            OR v_payment_status IN ('refunded', 'chargeback')
                           THEN 'refunded'
                       ELSE 'issued'
                   END
               ),
               updated_at = v_now
         WHERE i.purchase_id = v_purchase_id;

        SELECT i.invoice_number INTO v_invoice_number
          FROM billing_invoices i
         WHERE i.purchase_id = v_purchase_id
         LIMIT 1;
    END IF;

    -- ── 8. Other open cycles: cancel (keep history), never delete ────────────
    WITH stale AS (
        UPDATE billing_purchases
           SET status = 'cancelled',
               updated_at = v_now
         WHERE subscription_id = sub_id
           AND status = 'pending'
           AND id <> COALESCE(v_purchase_id, '00000000-0000-0000-0000-000000000000'::uuid)
           AND (
               v_status = 'cancelled'
               OR (billing_period_start IS NOT NULL AND billing_period_start >= v_period_end)
           )
        RETURNING id
    )
    UPDATE billing_invoices i
       SET invoice_data = COALESCE(i.invoice_data, '{}'::jsonb) || jsonb_build_object(
               'payment', COALESCE(i.invoice_data->'payment', '{}'::jsonb) || jsonb_build_object(
                   'status', 'cancelled'
               )
           ),
           updated_at = v_now
     WHERE i.purchase_id IN (SELECT id FROM stale);

    -- ── 9. Result ────────────────────────────────────────────────────────────
    SELECT s.current_period_start, s.current_period_end
      INTO v_stored_start, v_stored_end
      FROM subscriptions s
     WHERE s.id = sub_id;

    RETURN jsonb_build_object(
        'success', true,
        'subscription_id', sub_id,
        'partner_id', sub_record.partner_id,
        'subscription_status', v_status,
        'previous_status', v_previous_status,
        'status_changed', v_previous_status <> v_status,
        'plan_name', sub_record.plan_name,
        'plan_price', v_plan_price,
        'cycle_key', to_char(v_cycle_start, 'YYYY-MM-DD'),
        'cycle_start', v_period_start,
        'cycle_end', v_period_end,
        'current_period_start', v_stored_start,
        'current_period_end', v_stored_end,
        'current_purchase_id', v_purchase_id,
        'current_purchase_status', CASE WHEN v_purchase_id IS NULL THEN NULL ELSE v_purchase_status END,
        'current_purchase_created', v_purchase_created,
        'current_invoice_number', v_invoice_number,
        'payment_recorded', v_payment_written,
        'payment_status', CASE WHEN v_purchase_id IS NULL THEN NULL ELSE v_payment_status END,
        'next_purchase_id', null,
        'next_due_date', v_period_end,
        'next_invoice_number', null
    );
END;
$function$;

-- ─── 4. Grants ──────────────────────────────────────────────────────────────
-- This is an ops/testing tool: it can rewrite subscription state and billing
-- rows, so it must not be callable by any logged-in user (the old overload was
-- exposed to `authenticated`, which let any user sync any subscription id).
REVOKE ALL ON FUNCTION public.sync_subscription_to_billing(uuid, text, timestamptz, timestamptz, boolean)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_subscription_to_billing(uuid, text, timestamptz, timestamptz, boolean)
    TO service_role;

REVOKE ALL ON FUNCTION public.billing_cycle_start_date(date, int, date)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_cycle_next_start(date, int)
    FROM PUBLIC, anon, authenticated;

-- ─── 5. Data repair (idempotent) ─────────────────────────────────────────────

-- 5.1 Backfill the cycle key of purchases created by the previous RPC (it
-- never wrote billing_cycle_start, so the unique index could not see them).
WITH candidates AS (
    SELECT bp.id,
           bp.subscription_id,
           COALESCE(
               CASE WHEN bp.metadata->>'cycle_key' ~ '^\d{4}-\d{2}-\d{2}$'
                    THEN (bp.metadata->>'cycle_key')::date
               END,
               (bp.billing_period_start AT TIME ZONE 'America/Sao_Paulo')::date
           ) AS cycle_date,
           ROW_NUMBER() OVER (
               PARTITION BY bp.subscription_id,
                            COALESCE(
                                CASE WHEN bp.metadata->>'cycle_key' ~ '^\d{4}-\d{2}-\d{2}$'
                                     THEN (bp.metadata->>'cycle_key')::date
                                END,
                                (bp.billing_period_start AT TIME ZONE 'America/Sao_Paulo')::date
                            )
               ORDER BY bp.created_at
           ) AS rn
      FROM public.billing_purchases bp
     WHERE bp.purchase_type = 'subscription'
       AND bp.subscription_id IS NOT NULL
       AND bp.billing_cycle_start IS NULL
       AND bp.billing_period_start IS NOT NULL
)
UPDATE public.billing_purchases bp
   SET billing_cycle_start = c.cycle_date
  FROM candidates c
 WHERE bp.id = c.id
   AND c.rn = 1
   AND c.cycle_date IS NOT NULL
   AND NOT EXISTS (
       SELECT 1
         FROM public.billing_purchases x
        WHERE x.subscription_id = bp.subscription_id
          AND x.id <> bp.id
          AND x.billing_cycle_start = c.cycle_date
   );

-- 5.2 Repair periods that are invalid (end before/equal start). A cycle is
-- [00:00 America/Sao_Paulo, next cycle start).
UPDATE public.billing_purchases bp
   SET billing_period_start = (bp.billing_cycle_start::timestamp AT TIME ZONE 'America/Sao_Paulo'),
       billing_period_end = (public.billing_cycle_next_start(
           bp.billing_cycle_start,
           COALESCE(
               s.billing_anchor_day,
               EXTRACT(DAY FROM (s.created_at AT TIME ZONE 'America/Sao_Paulo'))::int
           )
       )::timestamp AT TIME ZONE 'America/Sao_Paulo'),
       updated_at = now()
  FROM public.subscriptions s
 WHERE bp.subscription_id = s.id
   AND bp.purchase_type = 'subscription'
   AND bp.billing_cycle_start IS NOT NULL
   AND (
       bp.billing_period_start IS NULL
       OR bp.billing_period_end IS NULL
       OR bp.billing_period_end <= bp.billing_period_start
   );

-- 5.3 A cycle whose payment was approved is completed, even when a sync made
-- after the cancellation left it as pending/cancelled.
UPDATE public.billing_purchases bp
   SET status = CASE WHEN pay.has_refund THEN 'refunded' ELSE 'completed' END,
       updated_at = now()
  FROM (
      SELECT purchase_id,
             bool_or(status = 'approved') AS has_approved,
             bool_or(status IN ('refunded', 'chargeback')) AS has_refund
        FROM public.billing_payments
       GROUP BY purchase_id
  ) pay
 WHERE bp.id = pay.purchase_id
   AND bp.purchase_type = 'subscription'
   AND pay.has_approved
   AND bp.status IN ('pending', 'cancelled');

-- 5.4 Keep subscription invoice snapshots aligned with their purchase.
UPDATE public.billing_invoices i
   SET invoice_data = COALESCE(i.invoice_data, '{}'::jsonb) || jsonb_build_object(
           'period', jsonb_build_object(
               'start', bp.billing_period_start,
               'end', bp.billing_period_end
           ),
           'payment', COALESCE(i.invoice_data->'payment', '{}'::jsonb) || jsonb_build_object(
               'status', COALESCE(pay.status, bp.status),
               'paid_at', pay.paid_at
           ),
           'purchase', COALESCE(i.invoice_data->'purchase', '{}'::jsonb) || jsonb_build_object(
               'description', bp.description,
               'amount', bp.amount,
               'discount_amount', bp.discount_amount,
               'total_amount', bp.total_amount,
               'currency', bp.currency
           ),
           'status', CASE
               WHEN pay.status IN ('refunded', 'chargeback') OR bp.status = 'refunded'
                   THEN 'refunded'
               ELSE 'issued'
           END
       ),
       updated_at = now()
  FROM public.billing_purchases bp
  LEFT JOIN LATERAL (
      SELECT p.status, p.paid_at
        FROM public.billing_payments p
       WHERE p.purchase_id = bp.id
       ORDER BY (p.status = 'approved') DESC, p.created_at DESC
       LIMIT 1
  ) pay ON true
 WHERE i.purchase_id = bp.id
   AND bp.subscription_id IS NOT NULL;

COMMIT;
