-- ============================================================================
-- BACKUP/DEV ONLY - Production uses lib/billing/sync-subscription.ts
-- ============================================================================
-- This SQL script is retained for manual testing, development, and emergency
-- recovery. The production system uses the TypeScript implementation which
-- has additional features (payment method resolution, MP payer info, etc.).
-- ============================================================================

-- ============================================================================
-- Sincronizar assinatura → billing manualmente (para testes/dev/produção)
-- ============================================================================
-- Uso básico (mantém status atual da subscription):
--   SELECT sync_subscription_to_billing('ID_DA_SUBSCRIPTION');
--
-- Uso avançado com OVERRIDE DE STATUS (para testes de fluxos e simulações):
--   SELECT sync_subscription_to_billing('ID_DA_SUBSCRIPTION', 'active');    -- Ativa + Próxima fatura
--   SELECT sync_subscription_to_billing('ID_DA_SUBSCRIPTION', 'trial');     -- Trial + Próxima fatura
--   SELECT sync_subscription_to_billing('ID_DA_SUBSCRIPTION', 'pending');   -- Pendente / aguardando checkout
--   SELECT sync_subscription_to_billing('ID_DA_SUBSCRIPTION', 'past_due');  -- Erro/Cartão recusado (testar PIX QR Code)
--   SELECT sync_subscription_to_billing('ID_DA_SUBSCRIPTION', 'error');     -- Alias para past_due
--   SELECT sync_subscription_to_billing('ID_DA_SUBSCRIPTION', 'cancelled'); -- Cancelada (cancela faturas futuras)
--
-- Com períodos customizados opcionais:
--   SELECT sync_subscription_to_billing('ID_DA_SUBSCRIPTION', 'active', now(), now() + interval '1 month');
--
-- Retorna JSON com:
--   { success, subscription_id, partner_id, subscription_status, plan_name, plan_price,
--     current_purchase_id, current_purchase_status, current_period_start, current_period_end,
--     current_invoice_number, next_purchase_id, next_due_date, next_invoice_number }
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
    owner_email TEXT;
    cust_name TEXT;
    cust_phone TEXT;
    cust_address TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM billing_invoices WHERE purchase_id = p_purchase_id) THEN
        RETURN jsonb_build_object('status', 'exists');
    END IF;

    SELECT bp.*
    INTO p
    FROM billing_purchases bp
    WHERE bp.id = p_purchase_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'purchase not found');
    END IF;

    -- Dados do emissor vêm da loja matriz do parceiro (partners não tem
    -- mais name/email/phone/logo_url).
    SELECT * INTO store_rec
    FROM stores WHERE partner_id = p.partner_id AND is_headquarters = true LIMIT 1;
    SELECT COALESCE(cnpj, cpf, '') INTO store_doc
    FROM stores WHERE partner_id = p.partner_id AND is_headquarters = true LIMIT 1;

    -- Email de faturamento da assinatura (quando a purchase é de subscription).
    SELECT s.billing_email INTO owner_email
    FROM subscriptions s WHERE s.id = p.subscription_id;

    -- Dados do cliente (dono do ERP) para o campo customer da fatura.
    SELECT COALESCE(up.full_name, '') INTO cust_name
    FROM user_profiles up WHERE up.user_id = p.user_id LIMIT 1;

    SELECT COALESCE(st.phone, '') INTO cust_phone
    FROM stores st WHERE st.partner_id = p.partner_id AND st.is_headquarters = true LIMIT 1;

    SELECT COALESCE(
        a.street || ', ' || a.number ||
        CASE WHEN a.complement IS NOT NULL AND a.complement <> '' THEN ' - ' || a.complement ELSE '' END ||
        ' - ' || a.neighborhood || ', ' || a.city || '/' || a.state ||
        CASE WHEN a.zip_code IS NOT NULL AND a.zip_code <> '' THEN ' - ' || a.zip_code ELSE '' END,
        ''
    ) INTO cust_address
    FROM addresses a WHERE a.user_id = p.user_id AND a.is_default = true LIMIT 1;

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
            'name', COALESCE(store_rec.name, ''),
            'document', store_doc,
            'address', '',
            'email', COALESCE(owner_email, ''),
            'phone', COALESCE(store_rec.phone, ''),
            'image_url', COALESCE(store_rec.logo_url, '')
        ),
        'customer', jsonb_build_object(
            'name', cust_name,
            'email', COALESCE(owner_email, ''),
            'phone', cust_phone,
            'address', cust_address
        ),
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
-- Suporta override de status: 'active', 'trial', 'pending', 'past_due' (erro/falha no cartão), 'cancelled', etc.
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

        -- Atualizar a assinatura no banco com o status e períodos atualizados
        UPDATE subscriptions
        SET status = target_sub_status::subscription_status,
            current_period_start = CASE
                WHEN p_period_start IS NOT NULL THEN p_period_start
                WHEN target_sub_status = 'active' AND (current_period_end IS NULL OR current_period_end <= v_now) THEN v_now
                ELSE COALESCE(current_period_start, v_now)
            END,
            current_period_end = CASE
                WHEN p_period_end IS NOT NULL THEN p_period_end
                WHEN target_sub_status = 'active' AND (current_period_end IS NULL OR current_period_end <= v_now) THEN v_now + interval '1 month'
                ELSE COALESCE(current_period_end, v_now + interval '1 month')
            END,
            past_due_at = CASE WHEN target_sub_status = 'past_due' THEN COALESCE(past_due_at, v_now) ELSE NULL END,
            trial_end = CASE WHEN target_sub_status = 'trialing' THEN COALESCE(p_period_end, current_period_end, v_now + interval '14 days') ELSE trial_end END,
            cancelled_at = CASE WHEN target_sub_status = 'cancelled' THEN COALESCE(cancelled_at, v_now) ELSE NULL END,
            ended_at = CASE WHEN target_sub_status = 'cancelled' THEN COALESCE(ended_at, v_now) ELSE NULL END,
            cancel_at_period_end = CASE WHEN target_sub_status IN ('active', 'trialing') THEN false ELSE cancel_at_period_end END,
            updated_at = v_now
        WHERE id = sub_id;

        -- Recarregar registro atualizado
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

    -- Computa os períodos do ciclo vigente
    period_start := COALESCE(p_period_start, sub_record.current_period_start, sub_record.created_at, v_now);
    period_end := COALESCE(p_period_end, sub_record.current_period_end, period_start + interval '1 month');

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
        -- Simula tentativa de cobrança no cartão com falha/rejeição (permite testar PIX QR Code)
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

    -- ── 5. Limpar purchases/faturas "next" pendentes geradas indevidamente por syncs antigos ──
    -- A próxima fatura NÃO deve ser pré-gerada no futuro. Ela só existirá quando
    -- a cobrança for efetivada ou processada (approved -> completed, failed -> pending/rejected).
    DELETE FROM billing_invoices
    WHERE purchase_id IN (
        SELECT id FROM billing_purchases
        WHERE subscription_id = sub_id
          AND status = 'pending'
          AND id <> v_purchase_id
    );

    DELETE FROM billing_purchases
    WHERE subscription_id = sub_id
      AND status = 'pending'
      AND id <> v_purchase_id;

    -- Obter número de fatura atual para o retorno
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
        'next_due_date', period_end,
        'next_invoice_number', null
    );
END;
$$;
