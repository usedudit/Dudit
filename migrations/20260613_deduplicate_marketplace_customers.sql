-- =============================================================================
-- Safety-net deduplication for marketplace customers (idempotent)
-- =============================================================================
-- Uses EXECUTE for dynamic SQL so it won't fail if the column doesn't exist.
-- Safe to rerun — no-ops when no duplicates or unique index is already in place.
-- =============================================================================

DO $$
DECLARE
  rec RECORD;
  v_survivor_id UUID;
  v_dup_id UUID;
  v_col_exists BOOLEAN;
  v_idx_exists BOOLEAN;
BEGIN
  -- Guard 1: skip if column doesn't exist yet
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'marketplace_user_id'
  ) INTO v_col_exists;

  IF NOT v_col_exists THEN
    RETURN;
  END IF;

  -- Guard 2: skip if unique index already exists (dedup already complete)
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'customers'
      AND indexname = 'idx_customers_unique_partner_marketplace_user'
  ) INTO v_idx_exists;

  IF v_idx_exists THEN
    RETURN;
  END IF;

  FOR rec IN
    EXECUTE $q$
      SELECT partner_id, marketplace_user_id, COUNT(*) AS cnt
      FROM public.customers
      WHERE marketplace_user_id IS NOT NULL
      GROUP BY partner_id, marketplace_user_id
      HAVING COUNT(*) > 1
    $q$
  LOOP
    EXECUTE 'SELECT id FROM public.customers
             WHERE partner_id = $1
               AND marketplace_user_id = $2
             ORDER BY created_at ASC LIMIT 1'
      INTO v_survivor_id
      USING rec.partner_id, rec.marketplace_user_id;

    IF v_survivor_id IS NULL THEN CONTINUE; END IF;

    FOR v_dup_id IN
      EXECUTE $q$
        SELECT id FROM public.customers
        WHERE partner_id = $1
          AND marketplace_user_id = $2
          AND id <> $3
      $q$
      USING rec.partner_id, rec.marketplace_user_id, v_survivor_id
    LOOP
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
      UPDATE public.return_requests SET customer_id = v_survivor_id WHERE customer_id = v_dup_id;
      UPDATE public.return_refunds SET customer_id = v_survivor_id WHERE customer_id = v_dup_id;
      UPDATE public.store_credits SET customer_id = v_survivor_id WHERE customer_id = v_dup_id;
      UPDATE public.return_notifications SET recipient_customer_id = v_survivor_id WHERE recipient_customer_id = v_dup_id;
      DELETE FROM public.customers WHERE id = v_dup_id;
    END LOOP;
  END LOOP;
END;
$$;
