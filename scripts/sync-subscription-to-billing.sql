-- ============================================================================
-- Sincronizar assinatura → billing manualmente (para testes/dev)
-- ============================================================================
-- Uso:
--   SELECT sync_subscription_to_billing('ID_DA_SUBSCRIPTION');
--
-- Retorna um JSON com { purchase_id, next_purchase_id, purchase_status }
--
-- Idempotente: pode chamar várias vezes com a mesma subscription.
-- Sincroniza:
--   - purchase do ciclo ATUAL (status conforme a assinatura) + fatura
--   - purchase do próximo ciclo (status pending) + fatura ("Próxima Fatura")
--   - pagamento (quando ativo e com Mercado Pago)
--
-- Obs: as funções também são criadas pela migration
-- `20260811_subscription_billing_cycles.sql`. Este script existe para
-- ambientes de dev que ainda não rodaram a migration.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- Colunas de ciclo em billing_purchases (idempotente)
-- ============================================================================
ALTER TABLE public.billing_purchases
  ADD COLUMN IF NOT EXISTS billing_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS billing_period_end timestamptz;

DROP INDEX IF EXISTS idx_billing_purchases_active_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_purchases_active_unique
  ON public.billing_purchases (partner_id, purchaseable_type, purchaseable_id, billing_period_start)
  WHERE status IN ('pending', 'completed');

-- ============================================================================
-- Helper: gerar (ou reutilizar) a fatura de uma purchase, server-side.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.billing_generate_invoice_for_purchase(p_purchase_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    p RECORD;
    plan_name TEXT;
    inv_number TEXT;
    inv_hash TEXT;
    inv_id UUID;
    inv_data JSONB;
    store_doc TEXT;
    store_rec RECORD;
BEGIN
    IF EXISTS (SELECT 1 FROM billing_invoices WHERE purchase_id = p_purchase_id) THEN
        RETURN jsonb_build_object('status', 'exists');
    END IF;

    SELECT bp.*, pn.name AS partner_name, pn.email AS partner_email
    INTO p
    FROM billing_purchases bp
    LEFT JOIN partners pn ON pn.id = bp.partner_id
    WHERE bp.id = p_purchase_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'purchase not found');
    END IF;

    SELECT * INTO store_rec
    FROM stores WHERE partner_id = p.partner_id AND is_headquarters = true LIMIT 1;
    SELECT COALESCE(cnpj, cpf, '') INTO store_doc
    FROM stores WHERE partner_id = p.partner_id AND is_headquarters = true LIMIT 1;

    SELECT name INTO plan_name FROM plans WHERE id = p.purchaseable_id;

    inv_number := 'INV-' || EXTRACT(YEAR FROM now())::TEXT || '-' ||
                  LPAD(nextval('billing_invoice_number_seq')::TEXT, 6, '0');
    inv_hash := encode(
        digest(inv_number || ':' || p.id::TEXT || ':' || EXTRACT(EPOCH FROM now())::TEXT, 'sha256'),
        'hex'
    );

    inv_data := jsonb_build_object(
        'invoice_number', inv_number,
        'verification_hash', inv_hash,
        'created_at', now(),
        'status', 'issued',
        'partner', jsonb_build_object(
            'name', COALESCE(store_rec.name, p.partner_name, ''),
            'document', store_doc,
            'address', '',
            'email', p.partner_email,
            'phone', COALESCE(store_rec.phone, ''),
            'image_url', COALESCE(store_rec.logo_url, '')
        ),
        'customer', null,
        'purchase', jsonb_build_object(
            'id', p.id,
            'type', p.purchase_type,
            'description', p.description,
            'amount', COALESCE(p.amount, 0),
            'discount_amount', COALESCE(p.discount_amount, 0),
            'total_amount', COALESCE(p.total_amount, 0),
            'currency', p.currency
        ),
        'items', jsonb_build_array(jsonb_build_object(
            'code', null,
            'name', COALESCE(plan_name, p.description, 'Assinatura'),
            'description', p.description,
            'quantity', 1,
            'unit_price', COALESCE(p.amount, 0),
            'total', COALESCE(p.amount, 0)
        )),
        'payment', jsonb_build_object(
            'method', 'other',
            'method_label', 'Outro',
            'gateway', p.gateway,
            'gateway_label', p.gateway,
            'status', p.status,
            'paid_at', null,
            'installments', null
        ),
        'period', CASE WHEN p.billing_period_start IS NOT NULL OR p.billing_period_end IS NOT NULL THEN
            jsonb_build_object('start', p.billing_period_start, 'end', p.billing_period_end)
        ELSE null END,
        'notes', null,
        'footer', 'Criado via Dudit - dudit.com.br'
    );

    INSERT INTO billing_invoices (purchase_id, partner_id, invoice_number, verification_hash, invoice_data)
    VALUES (p.id, p.partner_id, inv_number, inv_hash, inv_data)
    RETURNING id INTO inv_id;

    UPDATE billing_purchases SET invoice_id = inv_id WHERE id = p.id;

    RETURN jsonb_build_object('status', 'generated', 'invoice_number', inv_number);
END;
$$;

-- ============================================================================
-- sync_subscription_to_billing: ciclo atual + próximo ciclo (com faturas).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_subscription_to_billing(sub_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    sub_record RECORD;
    partner_record RECORD;
    existing RECORD;
    purchase_status TEXT;
    v_purchase_id UUID;
    next_purchase_id UUID;
    v_now TIMESTAMPTZ := now();
    period_start TIMESTAMPTZ;
    period_end TIMESTAMPTZ;
    next_start TIMESTAMPTZ;
    next_end TIMESTAMPTZ;
    plan_price NUMERIC;
    descr TEXT;
    mp_sub_id TEXT;
BEGIN
    SELECT s.*, p.id AS plan_id, p.name AS plan_name, p.price AS plan_price, p.slug AS plan_slug
    INTO sub_record
    FROM subscriptions s
    LEFT JOIN plans p ON p.id = s.plan_id
    WHERE s.id = sub_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Subscription not found');
    END IF;

    SELECT * INTO partner_record FROM partners WHERE id = sub_record.partner_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Partner not found');
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

    -- Computa os períodos (a próxima cobrança nunca fica no passado)
    period_start := COALESCE(sub_record.current_period_start, sub_record.created_at, v_now);
    period_end := COALESCE(sub_record.current_period_end, period_start + interval '1 month');
    IF period_end <= v_now THEN
        next_start := period_start + interval '1 month';
        WHILE next_start <= v_now LOOP
            next_start := next_start + interval '1 month';
        END LOOP;
        period_end := next_start;
    ELSE
        next_start := period_end;
    END IF;
    next_end := next_start + interval '1 month';

    -- ── PURCHASE do ciclo ATUAL (upsert) ──
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
            metadata = metadata || jsonb_build_object('synced_via', 'sql', 'synced_at', v_now),
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
                'synced_via', 'sql',
                'synced_at', v_now
            )
        )
        RETURNING id INTO v_purchase_id;
    END IF;

    -- ── Pagamento (apenas active/trialing com Mercado Pago) ──
    IF sub_record.status IN ('active', 'trialing') AND mp_sub_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM billing_payments
            WHERE purchase_id = v_purchase_id AND gateway_payment_id = mp_sub_id
        ) THEN
            INSERT INTO billing_payments (
                purchase_id, amount, currency, fee_amount, net_amount,
                status, gateway, gateway_payment_id, gateway_status, paid_at
            ) VALUES (
                v_purchase_id, plan_price, 'BRL', 0, plan_price,
                CASE WHEN purchase_status = 'completed' THEN 'approved' ELSE 'pending' END,
                'mercado_pago', mp_sub_id, sub_record.status,
                CASE WHEN purchase_status = 'completed' THEN v_now ELSE NULL END
            );
        END IF;
    END IF;

    -- ── Fatura do ciclo ATUAL ──
    IF purchase_status IN ('completed', 'pending') THEN
        PERFORM billing_generate_invoice_for_purchase(v_purchase_id);
    END IF;

    -- ── PURCHASE do próximo ciclo ("Próxima Fatura") ──
    next_purchase_id := NULL;
    IF sub_record.status IN ('active', 'trialing') AND plan_price > 0 THEN
        SELECT bp.id INTO next_purchase_id
        FROM billing_purchases bp
        WHERE bp.subscription_id = sub_id
          AND bp.status = 'pending'
          AND bp.billing_period_start IS NOT NULL
          AND bp.billing_period_start::date = next_start::date
        ORDER BY bp.created_at DESC LIMIT 1;

        IF next_purchase_id IS NULL THEN
            SELECT bp.id INTO next_purchase_id
            FROM billing_purchases bp
            WHERE bp.subscription_id = sub_id AND bp.status = 'pending'
            ORDER BY bp.created_at DESC LIMIT 1;
        END IF;

        IF next_purchase_id IS NOT NULL THEN
            UPDATE billing_purchases
            SET amount = plan_price,
                total_amount = plan_price,
                description = descr,
                billing_period_start = next_start,
                billing_period_end = next_end,
                metadata = metadata || jsonb_build_object(
                    'billing_cycle', 'next',
                    'due_date', next_start,
                    'synced_via', 'sql',
                    'synced_at', v_now
                ),
                updated_at = v_now
            WHERE id = next_purchase_id;
        ELSE
            INSERT INTO billing_purchases (
                partner_id, user_id, purchase_type, purchaseable_type, purchaseable_id,
                amount, total_amount, discount_amount, currency, status, gateway,
                gateway_payment_id, gateway_status, subscription_id, description,
                billing_period_start, billing_period_end, metadata
            ) VALUES (
                sub_record.partner_id, partner_record.user_id, 'subscription', 'plan', sub_record.plan_id,
                plan_price, plan_price, 0, 'BRL', 'pending', 'mercado_pago',
                mp_sub_id, sub_record.status, sub_id, descr,
                next_start, next_end,
                jsonb_build_object(
                    'plan_name', sub_record.plan_name,
                    'plan_slug', sub_record.plan_slug,
                    'billing_cycle', 'next',
                    'due_date', next_start,
                    'synced_via', 'sql',
                    'synced_at', v_now
                )
            )
            RETURNING id INTO next_purchase_id;
        END IF;

        IF next_purchase_id IS NOT NULL THEN
            PERFORM billing_generate_invoice_for_purchase(next_purchase_id);
        END IF;
    ELSE
        -- Assinatura não fatura mais → cancela purchases "next" pendentes antigas.
        UPDATE billing_purchases
        SET status = 'cancelled', updated_at = v_now
        WHERE subscription_id = sub_id AND status = 'pending' AND id <> v_purchase_id;
    END IF;

    RETURN jsonb_build_object(
        'purchase_id', v_purchase_id,
        'next_purchase_id', next_purchase_id,
        'purchase_status', purchase_status
    );
END;
$$;
