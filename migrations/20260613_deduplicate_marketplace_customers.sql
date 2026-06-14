-- =============================================================================
-- Deduplicate marketplace customers: merge duplicates and preserve history
-- =============================================================================
-- Idempotent: safe to rerun. Only processes groups with > 1 customer sharing
-- the same (partner_id, marketplace_user_id). Keeps the oldest customer and
-- migrates all FK references from duplicates to the survivor.
-- =============================================================================

DO $$
DECLARE
  rec RECORD;
  v_survivor_id UUID;
  v_dup_id UUID;
  v_dup_count INT;
BEGIN
  FOR rec IN
    SELECT partner_id, marketplace_user_id, COUNT(*) AS cnt
    FROM public.customers
    WHERE marketplace_user_id IS NOT NULL
    GROUP BY partner_id, marketplace_user_id
    HAVING COUNT(*) > 1
  LOOP
    -- Survivor = oldest customer (earliest created_at)
    SELECT id INTO v_survivor_id
    FROM public.customers
    WHERE partner_id = rec.partner_id
      AND marketplace_user_id = rec.marketplace_user_id
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_survivor_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Process each duplicate (exclude survivor)
    FOR v_dup_id IN
      SELECT id FROM public.customers
      WHERE partner_id = rec.partner_id
        AND marketplace_user_id = rec.marketplace_user_id
        AND id <> v_survivor_id
    LOOP
      -- Migrate FK references from duplicate to survivor
      -- Tables with explicit FK to customers.id
      UPDATE public.accounts_receivable SET customer_id = v_survivor_id WHERE customer_id = v_dup_id;
      UPDATE public.addresses SET customer_id = v_survivor_id WHERE customer_id = v_dup_id;
      UPDATE public.appointments SET customer_id = v_survivor_id WHERE customer_id = v_dup_id;
      UPDATE public.campaign_customers SET customer_id = v_survivor_id WHERE customer_id = v_dup_id;
      UPDATE public.coupon_customers SET customer_id = v_survivor_id WHERE customer_id = v_dup_id;
      UPDATE public.coupon_usages SET customer_id = v_survivor_id WHERE customer_id = v_dup_id;
      UPDATE public.pre_sales SET customer_id = v_survivor_id WHERE customer_id = v_dup_id;
      UPDATE public.promotion_audit_logs SET customer_id = v_survivor_id WHERE customer_id = v_dup_id;
      UPDATE public.promotion_usages SET customer_id = v_survivor_id WHERE customer_id = v_dup_id;
      UPDATE public.quotes SET customer_id = v_survivor_id WHERE customer_id = v_dup_id;
      UPDATE public.recurring_subscriptions SET customer_id = v_survivor_id WHERE customer_id = v_dup_id;
      UPDATE public.recurring_transactions SET customer_id = v_survivor_id WHERE customer_id = v_dup_id;
      UPDATE public.sales SET customer_id = v_survivor_id WHERE customer_id = v_dup_id;
      UPDATE public.transactions SET customer_id = v_survivor_id WHERE customer_id = v_dup_id;
      UPDATE public.whatsapp_messages SET customer_id = v_survivor_id WHERE customer_id = v_dup_id;

      -- Tables with customer_id column but no explicit FK
      UPDATE public.return_requests SET customer_id = v_survivor_id WHERE customer_id = v_dup_id;
      UPDATE public.return_refunds SET customer_id = v_survivor_id WHERE customer_id = v_dup_id;
      UPDATE public.store_credits SET customer_id = v_survivor_id WHERE customer_id = v_dup_id;
      UPDATE public.return_notifications SET recipient_customer_id = v_survivor_id WHERE recipient_customer_id = v_dup_id;

      -- Delete the duplicate customer
      DELETE FROM public.customers WHERE id = v_dup_id;
    END LOOP;
  END LOOP;
END;
$$;
