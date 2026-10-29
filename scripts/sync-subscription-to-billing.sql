-- ============================================================================
-- BACKUP/DEV ONLY - Production uses lib/billing/sync-subscription.ts
-- ============================================================================
-- This SQL script is retained for manual testing, development, and emergency
-- recovery. The production system uses the TypeScript implementation, which has
-- additional features (payment method resolution, MP payer info, notifications,
-- idempotency). Run this RPC only when the application path is unavailable.
--
-- The function is installed by migrations/20261029_fix_sync_subscription_to_billing_cycle.sql.
-- Its body is mirrored here so the manual script stays in sync.
-- ============================================================================

-- ============================================================================
-- Sincronizar assinatura → billing manualmente (para testes/dev/recuperação)
-- ============================================================================
-- Uso básico (mantém o status atual da subscription; sincroniza apenas o ciclo
-- vigente — ciclo, purchase, fatura e pagamento do ciclo, conforme já existe no
-- banco):
--   SELECT sync_subscription_to_billing('ID_DA_SUBSCRIPTION');
--
-- Uso avançado com OVERRIDE DE STATUS (simulações / fluxos de teste):
--   SELECT sync_subscription_to_billing('ID_DA_SUBSCRIPTION', 'active');       -- Ativa + fatura do ciclo
--   SELECT sync_subscription_to_billing('ID_DA_SUBSCRIPTION', 'trial');        -- Trial + fatura do ciclo
--   SELECT sync_subscription_to_billing('ID_DA_SUBSCRIPTION', 'pending');      -- Pendente / aguardando checkout
--   SELECT sync_subscription_to_billing('ID_DA_SUBSCRIPTION', 'past_due');     -- Cartão recusado (testa PIX QR Code)
--   SELECT sync_subscription_to_billing('ID_DA_SUBSCRIPTION', 'cancelled');    -- Cancela (cancela faturas futuras)
--
-- Com períodos customizados (p_period_start também define o ciclo a sincronizar):
--   SELECT sync_subscription_to_billing('ID_DA_SUBSCRIPTION', 'active', now(), now() + interval '1 month');
--
-- p_record_payment (padrão: NULL = automático):
--   NULL   -> grava o pagamento do ciclo SOMENTE para assinaturas sem preapproval
--             do Mercado Pago (PIX / dinheiro / "a combinar"). Assinaturas MP são
--             liquidadas pelo webhook/reconciliação — o sync não fabrica cobranças.
--   true   -> força o registro do pagamento mesmo com preapproval (testes).
--   false  -> nunca toca em billing_payments (status-only).
--   SELECT sync_subscription_to_billing('ID_DA_SUBSCRIPTION', 'past_due', NULL, NULL, true);
--   SELECT sync_subscription_to_billing('ID_DA_SUBSCRIPTION', 'active', NULL, NULL, true);
--
-- Regras do modelo atual (migração 20261028 + 20261029):
--   * Um purchase por assinatura por ciclo (chave: billing_cycle_start = data local).
--   * Ciclos são ancorados no dia do mês (America/Sao_Paulo) e não driftam.
--   * O status do purchase vem do pagamento do SEU ciclo, nunca do status global.
--   * Ciclos pagos (aprovados) não retrocedem a pending/cancelled.
--   * cancel_at_period_end só é limpo em reativação real/cancelamento definitivo.
--
-- Retorna JSON:
--   { success, subscription_id, partner_id, subscription_status, previous_status,
--     status_changed, plan_name, plan_price, cycle_key, cycle_start, cycle_end,
--     current_period_start, current_period_end,
--     current_purchase_id, current_purchase_status, current_purchase_created,
--     current_invoice_number, payment_recorded, payment_status,
--     next_purchase_id, next_due_date, next_invoice_number }
-- ============================================================================

-- NOTE: the function is created/updated by the migration file; this script only
-- documents the current manual contract. Re-running the migration is enough.

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
    v_purchase_id uuid;
    v_purchase_status text;
    v_purchase_created boolean := false;
    v_amount numeric;
    v_has_approved boolean := false;
    v_has_refund boolean := false;
    v_has_any boolean := false;
    v_payment_status text;
    v_paid_at timestamptz;
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
            RETURN jsonb_build_object('success', false, 'error', format('Invalid subscription status: %s', v_status));
        END IF;
    END IF;

    -- ── 2. Resolve the billing cycle (America/Sao_Paulo calendar days) ───────
    v_anchor := COALESCE(sub_record.created_at, sub_record.current_period_start, v_now);
    v_anchor_local := (v_anchor AT TIME ZONE 'America/Sao_Paulo')::date;
    v_anchor_day := COALESCE(
        NULLIF(sub_record.billing_anchor_day, 0),
        EXTRACT(DAY FROM v_anchor_local)::int
    );

    -- An explicit period_start selects the cycle being synced. Without it,
    -- sync the cycle containing now(), except for a cancelled subscription:
    -- its last (paid) cycle is the one starting at current_period_start.
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
    IF p_period_end IS NOT NULL AND p_period_end > v_period_start THEN
        v_period_end := p_period_end;
    END IF;

    v_period_broken := sub_record.current_period_start IS NULL
        OR sub_record.current_period_end IS NULL
        OR sub_record.current_period_end <= sub_record.current_period_start;

    -- Move the period forward only: a late cycle must never rewind access.
    v_move_period := p_period_start IS NOT NULL
        AND (
            sub_record.current_period_start IS NULL
            OR v_cycle_start > (sub_record.current_period_start AT TIME ZONE 'America/Sao_Paulo')::date
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
               WHEN p_period_end IS NOT NULL AND p_period_end > (CASE WHEN v_move_period OR v_period_broken
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
    -- Default: only off-gateway subscriptions get a locally recorded payment.
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

    IF existing.id IS NULL THEN
        v_purchase_status := CASE
            WHEN v_status = 'cancelled' THEN 'cancelled'
            WHEN v_record_payment AND v_status IN ('active', 'trialing') THEN 'completed'
            ELSE 'pending'
        END;
    ELSE
        v_purchase_status := existing.status;
        IF v_has_approved THEN
            v_purchase_status := 'completed';
        ELSIF v_has_refund THEN
            v_purchase_status := 'refunded';
        ELSIF existing.status IN ('completed', 'refunded', 'partially_refunded') THEN
            v_purchase_status := existing.status;
        ELSIF v_status = 'cancelled' THEN
            v_purchase_status := 'cancelled';
        ELSIF v_record_payment AND v_status IN ('active', 'trialing') THEN
            v_purchase_status := 'completed';
        ELSE
            v_purchase_status := 'pending';
        END IF;
    END IF;

    IF existing.id IS NULL THEN
        IF v_status <> 'cancelled' AND v_plan_price > 0 THEN
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
                SELECT bp.id INTO v_purchase_id
                  FROM billing_purchases bp
                 WHERE bp.subscription_id = sub_id
                   AND bp.billing_cycle_start = v_cycle_start
                 LIMIT 1;
            END IF;
        END IF;
    ELSE
        v_purchase_id := existing.id;

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
    END IF;

    -- ── 6. Payment of THIS cycle ─────────────────────────────────────────────
    IF v_purchase_id IS NOT NULL THEN
        SELECT *
          INTO existing_pay
          FROM billing_payments
         WHERE purchase_id = v_purchase_id
         ORDER BY (status = 'approved') DESC, created_at DESC
         LIMIT 1;

        IF v_record_payment
           AND v_status IN ('active', 'trialing', 'past_due')
           AND v_plan_price > 0 THEN
            IF existing_pay.id IS NOT NULL THEN
                -- Never "unpay" an approved/refunded cycle; keep its state.
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
            -- Only unpaid cycles are cancelled; money already received stays
            -- approved on its own cycle.
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
    IF v_purchase_id IS NOT NULL AND v_purchase_status IN ('completed', 'pending') THEN
        PERFORM billing_generate_invoice_for_purchase(v_purchase_id);
    END IF;

    IF v_purchase_id IS NOT NULL THEN
        SELECT bp.billing_period_start, bp.billing_period_end, bp.amount,
               bp.description
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
                       'total_amount', existing.amount,
                       'currency', 'BRL'
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
           AND id <> COALESCE(v_purchase_id, '00000000-0000-0000-0000-000000000000'::uuid)
           AND status = 'pending'
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
