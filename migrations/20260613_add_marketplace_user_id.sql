-- =============================================================================
-- Add marketplace_user_id to customers for one-ERP-customer-per-seller mapping
-- =============================================================================
-- Order matters: (1) add column, (2) backfill, (3) deduplicate, (4) create index
-- =============================================================================

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS marketplace_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill marketplace_user_id from existing user_id values
UPDATE public.customers
SET marketplace_user_id = user_id
WHERE marketplace_user_id IS NULL
  AND user_id IS NOT NULL;

-- ── Deduplicate customers that share the same (partner_id, marketplace_user_id) ──
DO $$
DECLARE
  rec RECORD;
  v_survivor_id UUID;
  v_dup_id UUID;
  v_tables TEXT[] := ARRAY[
    'accounts_receivable','addresses','appointments','campaign_customers',
    'coupon_customers','coupon_usages','pre_sales','promotion_audit_logs',
    'promotion_usages','quotes','recurring_subscriptions','recurring_transactions',
    'sales','transactions','whatsapp_messages','return_requests','return_refunds',
    'store_credits','return_notifications'
  ];
  v_tbl TEXT;
  v_col TEXT;
BEGIN
  FOR rec IN
    SELECT partner_id, marketplace_user_id, COUNT(*) AS cnt
    FROM public.customers
    WHERE marketplace_user_id IS NOT NULL
    GROUP BY partner_id, marketplace_user_id
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO v_survivor_id
    FROM public.customers
    WHERE partner_id = rec.partner_id
      AND marketplace_user_id = rec.marketplace_user_id
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_survivor_id IS NULL THEN
      CONTINUE;
    END IF;

    FOR v_dup_id IN
      SELECT id FROM public.customers
      WHERE partner_id = rec.partner_id
        AND marketplace_user_id = rec.marketplace_user_id
        AND id <> v_survivor_id
    LOOP
      FOREACH v_tbl IN ARRAY v_tables
      LOOP
        v_col := CASE WHEN v_tbl = 'return_notifications' THEN 'recipient_customer_id' ELSE 'customer_id' END;
        IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = v_tbl) THEN
          EXECUTE format('UPDATE public.%I SET %I = $1 WHERE %I = $2', v_tbl, v_col, v_col)
            USING v_survivor_id, v_dup_id;
        END IF;
      END LOOP;
      DELETE FROM public.customers WHERE id = v_dup_id;
    END LOOP;
  END LOOP;
END;
$$;

-- Now safe to create the unique index (no duplicates remain)
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_unique_partner_marketplace_user
  ON public.customers(partner_id, marketplace_user_id)
  WHERE marketplace_user_id IS NOT NULL;
