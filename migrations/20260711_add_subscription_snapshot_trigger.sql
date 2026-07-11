-- SQL Migration: Add automatic trigger to snapshot plan items into subscription items on insert

CREATE OR REPLACE FUNCTION public.create_subscription_snapshot()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.recurring_subscription_items (
        subscription_id, item_type, product_id, variant_id, service_id,
        quantity, unit_price, staff_partner_user_id, preferred_time, duration_minutes, sort_order
    )
    SELECT 
        NEW.id,
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
    WHERE rpi.plan_id = NEW.recurring_plan_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_create_subscription_snapshot ON public.recurring_subscriptions;
CREATE TRIGGER trigger_create_subscription_snapshot
    AFTER INSERT ON public.recurring_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.create_subscription_snapshot();
