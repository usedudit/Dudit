-- SQL Migration: Add automatic trigger to grant subscription credits on order payment (INSERT or UPDATE)

CREATE OR REPLACE FUNCTION public.grant_subscription_credits_on_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_sub_record RECORD;
    v_plan_record RECORD;
    v_item RECORD;
    v_expires_at TIMESTAMPTZ;
    v_idempotency_key TEXT;
    v_credit_id UUID;
    v_is_paid BOOLEAN := FALSE;
BEGIN
    -- Determine if it's paid
    IF TG_OP = 'INSERT' THEN
        IF NEW.situation = 'paid' THEN
            v_is_paid := TRUE;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.situation = 'paid' AND (OLD.situation IS NULL OR OLD.situation != 'paid') THEN
            v_is_paid := TRUE;
        END IF;
    END IF;

    -- Only proceed if the order is paid and has subscription/execution references
    IF v_is_paid AND NEW.recurring_subscription_id IS NOT NULL AND NEW.recurring_execution_id IS NOT NULL THEN
        -- Get subscription details
        SELECT next_execution_at, recurring_plan_id 
        INTO v_sub_record
        FROM public.recurring_subscriptions
        WHERE id = NEW.recurring_subscription_id;
        
        IF v_sub_record IS NULL THEN
            RETURN NEW;
        END IF;
        
        -- Get plan credit policy
        SELECT credit_expiration_policy, credit_expiration_days
        INTO v_plan_record
        FROM public.recurring_plans
        WHERE id = v_sub_record.recurring_plan_id;
        
        IF v_plan_record IS NULL THEN
            RETURN NEW;
        END IF;
        
        -- Calculate expiration date
        IF v_plan_record.credit_expiration_policy = 'end_of_cycle' THEN
            v_expires_at := v_sub_record.next_execution_at;
        ELSIF v_plan_record.credit_expiration_policy = 'fixed_days' AND v_plan_record.credit_expiration_days IS NOT NULL THEN
            v_expires_at := NOW() + (v_plan_record.credit_expiration_days || ' days')::INTERVAL;
        ELSE
            v_expires_at := NULL;
        END IF;
        
        -- Iterate through service items of this subscription
        FOR v_item IN
            SELECT id, service_id, quantity
            FROM public.recurring_subscription_items
            WHERE subscription_id = NEW.recurring_subscription_id
              AND item_type = 'service'
        LOOP
            v_idempotency_key := 'grant:' || NEW.recurring_execution_id || ':' || v_item.id;
            
            -- Idempotency check
            IF NOT EXISTS (
                SELECT 1 FROM public.subscription_item_credit_ledger 
                WHERE idempotency_key = v_idempotency_key
            ) THEN
                -- Insert credit
                INSERT INTO public.subscription_item_credits (
                    partner_id, customer_id, subscription_id, subscription_item_id,
                    service_id, product_id, quantity, consumed, expires_at
                ) VALUES (
                    NEW.partner_id, NEW.customer_id, NEW.recurring_subscription_id, v_item.id,
                    v_item.service_id, NULL, v_item.quantity, 0, v_expires_at
                ) RETURNING id INTO v_credit_id;
                
                -- Log ledger entry
                INSERT INTO public.subscription_item_credit_ledger (
                    partner_id, customer_id, service_id, product_id, quantity,
                    transaction_type, credit_id, appointment_id, order_id, execution_id, idempotency_key
                ) VALUES (
                    NEW.partner_id, NEW.customer_id, v_item.service_id, NULL, v_item.quantity,
                    'grant', v_credit_id, NULL, NEW.id, NEW.recurring_execution_id, v_idempotency_key
                );
            END IF;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_grant_subscription_credits ON public.orders;
CREATE TRIGGER trigger_grant_subscription_credits
    AFTER INSERT OR UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.grant_subscription_credits_on_payment();
