-- ============================================================================
-- Fix: Drop broken trigger that references dropped columns
-- ============================================================================
-- As colunas store_name, store_image_url, store_description, opening_hours,
-- phone, banner_url, gallery etc. foram removidas da tabela partners
-- (ver migration 20260729_clean_partners_schema.sql).
--
-- A trigger `trigger_create_initial_store` tentava acessar NEW.store_name e
-- NEW.store_image_url, que não existem mais, causando erro:
--   "record 'new' has no field 'store_name'"
--
-- A criação da loja agora é feita diretamente no código da aplicação
-- (app/actions/partner.ts), então a trigger é redundante além de quebrada.
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_create_initial_store ON public.partners;
DROP FUNCTION IF EXISTS create_initial_store_for_partner();

-- ============================================================================
-- Fix: Atualizar sync_subscription_to_billing para usar stores em vez de
-- colunas removidas de partners (store_name, phone, store_image_url)
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_subscription_to_billing(sub_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    sub_record RECORD;
    plan_record RECORD;
    partner_record RECORD;
    store_record RECORD;
    existing_purchase_id UUID;
    v_purchase_id UUID;
    purchase_status TEXT;
    payment_status TEXT;
    inv_number TEXT;
    inv_hash TEXT;
    inv_data JSONB;
    v_now TIMESTAMPTZ := now();
    store_doc TEXT;
BEGIN
    -- ── 1. Load subscription + plan + partner ──
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

    -- Fetch store data (name, phone, logo_url from stores instead of old partners columns)
    SELECT * INTO store_record FROM stores WHERE partner_id = sub_record.partner_id AND is_headquarters = true LIMIT 1;

    -- Fetch store document (cnpj/cpf from stores, fiscal fields per-store)
    SELECT COALESCE(cnpj, cpf, '') INTO store_doc FROM stores WHERE partner_id = sub_record.partner_id AND is_headquarters = true LIMIT 1;

    -- ── 2. Map subscription status to purchase status ──
    purchase_status := CASE sub_record.status
        WHEN 'active'   THEN 'completed'
        WHEN 'trialing' THEN 'completed'
        WHEN 'past_due' THEN 'pending'
        WHEN 'pending'  THEN 'pending'
        WHEN 'cancelled' THEN 'cancelled'
        WHEN 'paused'   THEN 'pending'
        ELSE 'pending'
    END;

    payment_status := CASE
        WHEN sub_record.status IN ('active', 'trialing') THEN 'approved'
        ELSE 'pending'
    END;

    -- ── 3. Upsert billing_purchase (idempotent by subscription_id) ──
    SELECT bp.id INTO existing_purchase_id
    FROM billing_purchases bp
    WHERE bp.subscription_id = sub_id
    ORDER BY bp.created_at DESC
    LIMIT 1;

    IF existing_purchase_id IS NOT NULL THEN
        UPDATE billing_purchases
        SET status = purchase_status,
            amount = COALESCE(sub_record.plan_price, 0),
            total_amount = COALESCE(sub_record.plan_price, 0),
            description = CASE WHEN sub_record.plan_name IS NOT NULL
                THEN 'Plano ' || sub_record.plan_name
                ELSE 'Assinatura'
            END,
            gateway_payment_id = sub_record.mercado_pago_subscription_id,
            gateway_status = sub_record.status,
            metadata = jsonb_build_object(
                'plan_name', sub_record.plan_name,
                'plan_slug', sub_record.plan_slug,
                'synced_via', 'sql',
                'synced_at', v_now
            ),
            updated_at = v_now
        WHERE id = existing_purchase_id;

        v_purchase_id := existing_purchase_id;
    ELSE
        INSERT INTO billing_purchases (
            partner_id, user_id, purchase_type,
            purchaseable_type, purchaseable_id,
            amount, total_amount, discount_amount, currency,
            status, gateway, gateway_payment_id, gateway_status,
            subscription_id, description, metadata
        ) VALUES (
            sub_record.partner_id, partner_record.user_id, 'subscription',
            'plan', sub_record.plan_id,
            COALESCE(sub_record.plan_price, 0),
            COALESCE(sub_record.plan_price, 0),
            0, 'BRL',
            purchase_status, 'mercado_pago',
            sub_record.mercado_pago_subscription_id, sub_record.status,
            sub_id,
            CASE WHEN sub_record.plan_name IS NOT NULL
                THEN 'Plano ' || sub_record.plan_name
                ELSE 'Assinatura'
            END,
            jsonb_build_object(
                'plan_name', sub_record.plan_name,
                'plan_slug', sub_record.plan_slug,
                'synced_via', 'sql',
                'synced_at', v_now
            )
        )
        RETURNING id INTO v_purchase_id;
    END IF;

    -- ── 4. Upsert billing_payment (only for active/trialing) ──
    IF sub_record.status IN ('active', 'trialing') AND sub_record.mercado_pago_subscription_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM billing_payments
            WHERE purchase_id = v_purchase_id
              AND gateway_payment_id = sub_record.mercado_pago_subscription_id
        ) THEN
            INSERT INTO billing_payments (
                purchase_id, amount, currency, fee_amount, net_amount,
                status, gateway, gateway_payment_id, gateway_status,
                paid_at
            ) VALUES (
                v_purchase_id,
                COALESCE(sub_record.plan_price, 0),
                'BRL', 0, COALESCE(sub_record.plan_price, 0),
                payment_status, 'mercado_pago',
                sub_record.mercado_pago_subscription_id, sub_record.status,
                CASE WHEN payment_status = 'approved' THEN v_now ELSE NULL END
            );
        END IF;
    END IF;

    -- ── 5. Generate invoice (only if purchase is completed and no invoice exists) ──
    IF purchase_status = 'completed' THEN
        IF NOT EXISTS (SELECT 1 FROM billing_invoices WHERE purchase_id = v_purchase_id) THEN
            SELECT 'INV-' || EXTRACT(YEAR FROM v_now)::TEXT || '-' ||
                   LPAD(nextval('billing_invoice_number_seq')::TEXT, 6, '0')
            INTO inv_number;

            SELECT encode(
                digest(inv_number || ':' || v_purchase_id::TEXT || ':' || EXTRACT(EPOCH FROM v_now)::TEXT, 'sha256'),
                'hex'
            ) INTO inv_hash;

            inv_data := jsonb_build_object(
                'invoice_number', inv_number,
                'verification_hash', inv_hash,
                'created_at', v_now,
                'status', 'issued',
                'partner', jsonb_build_object(
                    'name', COALESCE(store_record.name, partner_record.name, ''),
                    'document', store_doc,
                    'address', '',
                    'phone', COALESCE(store_record.phone, ''),
                    'store_image_url', COALESCE(store_record.logo_url, '')
                ),
                'customer', null,
                'purchase', jsonb_build_object(
                    'id', v_purchase_id,
                    'type', 'subscription',
                    'description', sub_record.plan_name,
                    'amount', COALESCE(sub_record.plan_price, 0),
                    'discount_amount', 0,
                    'total_amount', COALESCE(sub_record.plan_price, 0),
                    'currency', 'BRL'
                ),
                'items', jsonb_build_array(jsonb_build_object(
                    'code', null,
                    'name', COALESCE(sub_record.plan_name, 'Assinatura'),
                    'description', sub_record.plan_name,
                    'quantity', 1,
                    'unit_price', COALESCE(sub_record.plan_price, 0),
                    'total', COALESCE(sub_record.plan_price, 0)
                ))
            );

            INSERT INTO billing_invoices (
                purchase_id, partner_id, invoice_number, verification_hash, invoice_data
            ) VALUES (
                v_purchase_id, sub_record.partner_id, inv_number, inv_hash, inv_data
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'purchase_id', v_purchase_id,
        'created', existing_purchase_id IS NULL,
        'purchase_status', purchase_status
    );
END;
$$;

