-- Extend consume_credits_fifo to support product credits (entitlement model).
-- Backward compatible: p_product_id DEFAULT NULL, existing callers keep working.

-- Adding a parameter creates a new overload; drop the old 7-arg version first.
DROP FUNCTION IF EXISTS public.consume_credits_fifo(uuid, uuid, uuid, integer, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.consume_credits_fifo(
    p_partner_id UUID,
    p_customer_id UUID,
    p_service_id UUID,
    p_quantity INT,
    p_appointment_id UUID,
    p_order_id UUID,
    p_idempotency_key TEXT,
    p_product_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_remaining_to_consume INT := p_quantity;
    v_credit RECORD;
    v_consume_qty INT;
    v_total_available INT := 0;
BEGIN
    IF p_service_id IS NULL AND p_product_id IS NULL THEN
        RAISE EXCEPTION 'Informe service_id ou product_id';
    END IF;

    -- Check total available credits first
    SELECT COALESCE(SUM(quantity - consumed), 0)
    INTO v_total_available
    FROM public.subscription_item_credits
    WHERE customer_id = p_customer_id
      AND (expires_at IS NULL OR expires_at > NOW())
      AND (
        (p_service_id IS NOT NULL AND service_id = p_service_id)
        OR (p_product_id IS NOT NULL AND product_id = p_product_id)
      );

    IF v_total_available < p_quantity THEN
        RETURN FALSE;
    END IF;

    -- Fetch credits ordered by expires_at (FIFO) and lock them
    FOR v_credit IN
        SELECT id, quantity, consumed
        FROM public.subscription_item_credits
        WHERE customer_id = p_customer_id
          AND (expires_at IS NULL OR expires_at > NOW())
          AND (
            (p_service_id IS NOT NULL AND service_id = p_service_id)
            OR (p_product_id IS NOT NULL AND product_id = p_product_id)
          )
        ORDER BY expires_at ASC NULLS LAST
        FOR UPDATE
    LOOP
        IF v_remaining_to_consume <= 0 THEN
            EXIT;
        END IF;

        v_consume_qty := LEAST(v_credit.quantity - v_credit.consumed, v_remaining_to_consume);

        IF v_consume_qty > 0 THEN
            UPDATE public.subscription_item_credits
            SET consumed = consumed + v_consume_qty,
                updated_at = NOW()
            WHERE id = v_credit.id;

            INSERT INTO public.subscription_item_credit_ledger (
                partner_id, customer_id, service_id, product_id, quantity, transaction_type,
                credit_id, appointment_id, order_id, idempotency_key
            ) VALUES (
                p_partner_id, p_customer_id, p_service_id, p_product_id, -v_consume_qty, 'consume',
                v_credit.id, p_appointment_id, p_order_id,
                COALESCE(p_idempotency_key, gen_random_uuid()::text) || '_' || v_credit.id::text
            );

            v_remaining_to_consume := v_remaining_to_consume - v_consume_qty;
        END IF;
    END LOOP;

    IF v_remaining_to_consume > 0 THEN
        RAISE EXCEPTION 'Erro inesperado ao consumir créditos por FIFO';
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Product lookup index (mirrors the existing service one)
CREATE INDEX IF NOT EXISTS idx_sub_item_credits_lookup_product
  ON public.subscription_item_credits (customer_id, product_id, expires_at);
