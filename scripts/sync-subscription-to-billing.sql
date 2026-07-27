-- ============================================================================
-- Sincronizar assinatura → billing manualmente (para testes/dev)
-- ============================================================================
-- Uso:
--   SELECT sync_subscription_to_billing('ID_DA_SUBSCRIPTION');
--
-- Retorna um JSON com { purchase_id, created, purchase_status }
--
-- Idempotente: pode chamar várias vezes com a mesma subscription.
-- Se a purchase já existir, atualiza o status. Se já existir pagamento,
-- não duplica. Se já existir invoice, não recria.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION sync_subscription_to_billing(sub_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    sub_record RECORD;
    plan_record RECORD;
    partner_record RECORD;
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
        -- Update existing
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
        -- Create new
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
        -- Check if invoice already exists for this purchase
        IF NOT EXISTS (SELECT 1 FROM billing_invoices WHERE purchase_id = v_purchase_id) THEN
            -- Generate invoice number from sequence
            SELECT 'INV-' || EXTRACT(YEAR FROM v_now)::TEXT || '-' ||
                   LPAD(nextval('billing_invoice_number_seq')::TEXT, 6, '0')
            INTO inv_number;

            -- Generate verification hash (SHA-256 of invoice number + purchase ID + timestamp)
            SELECT encode(
                digest(inv_number || ':' || v_purchase_id::TEXT || ':' || EXTRACT(EPOCH FROM v_now)::TEXT, 'sha256'),
                'hex'
            ) INTO inv_hash;

            -- Build invoice_data JSONB snapshot
            inv_data := jsonb_build_object(
                'invoice_number', inv_number,
                'verification_hash', inv_hash,
                'created_at', v_now,
                'status', 'issued',
                'partner', jsonb_build_object(
                    'name', COALESCE(partner_record.store_name, ''),
                    'document', store_doc,
                    'address', '',
                    'phone', COALESCE(partner_record.phone, ''),
                    'store_image_url', COALESCE(partner_record.store_image_url, '')
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
                    'code', sub_record.plan_slug,
                    'name', COALESCE(sub_record.plan_name, 'Assinatura'),
                    'description', sub_record.plan_name,
                    'quantity', 1,
                    'unit_price', COALESCE(sub_record.plan_price, 0),
                    'total', COALESCE(sub_record.plan_price, 0)
                )),
                'payment', jsonb_build_object(
                    'method', 'other',
                    'method_label', 'Assinatura',
                    'gateway', 'mercado_pago',
                    'gateway_label', 'Mercado Pago',
                    'status', payment_status,
                    'paid_at', CASE WHEN payment_status = 'approved' THEN v_now ELSE null END,
                    'installments', null
                ),
                'period', CASE
                    WHEN sub_record.current_period_start IS NOT NULL OR sub_record.current_period_end IS NOT NULL THEN
                        jsonb_build_object(
                            'start', sub_record.current_period_start,
                            'end', sub_record.current_period_end
                        )
                    ELSE null
                END,
                'notes', null,
                'footer', 'Criado via Dudit - dudit.com.br'
            );

            -- Insert invoice
            INSERT INTO billing_invoices (
                purchase_id, partner_id, invoice_number,
                verification_hash, invoice_data, status
            ) VALUES (
                v_purchase_id, sub_record.partner_id,
                inv_number, inv_hash, inv_data, 'issued'
            );

            -- Link invoice to purchase
            UPDATE billing_purchases
            SET invoice_id = (SELECT id FROM billing_invoices WHERE purchase_id = v_purchase_id LIMIT 1)
            WHERE id = v_purchase_id;
        END IF;
    END IF;

    -- ── Return result ──
    RETURN jsonb_build_object(
        'purchase_id', v_purchase_id,
        'created', existing_purchase_id IS NULL,
        'purchase_status', purchase_status
    );
END;
$$;
