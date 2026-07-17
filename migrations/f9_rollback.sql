-- ============================================================================
-- Fase 9 Rollback - Remove store_id from financial tables
-- ============================================================================
BEGIN;

-- ── transactions ──────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_transactions_partner_store;
ALTER TABLE public.transactions DROP COLUMN IF EXISTS store_id;

DROP POLICY IF EXISTS "transactions_select_own" ON public.transactions;
CREATE POLICY "transactions_select_own" ON public.transactions
  FOR SELECT USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "transactions_insert_own" ON public.transactions;
CREATE POLICY "transactions_insert_own" ON public.transactions
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "transactions_update_own" ON public.transactions;
CREATE POLICY "transactions_update_own" ON public.transactions
  FOR UPDATE USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "transactions_delete_own" ON public.transactions;
CREATE POLICY "transactions_delete_own" ON public.transactions
  FOR DELETE USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
  );

-- ── recurring_transactions ───────────────────────────────────────────────
DROP INDEX IF EXISTS idx_recurring_transactions_partner_store;
ALTER TABLE public.recurring_transactions DROP COLUMN IF EXISTS store_id;

DROP POLICY IF EXISTS "recurring_transactions_select_own" ON public.recurring_transactions;
CREATE POLICY "recurring_transactions_select_own" ON public.recurring_transactions
  FOR SELECT USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "recurring_transactions_insert_own" ON public.recurring_transactions;
CREATE POLICY "recurring_transactions_insert_own" ON public.recurring_transactions
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "recurring_transactions_update_own" ON public.recurring_transactions;
CREATE POLICY "recurring_transactions_update_own" ON public.recurring_transactions
  FOR UPDATE USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "recurring_transactions_delete_own" ON public.recurring_transactions;
CREATE POLICY "recurring_transactions_delete_own" ON public.recurring_transactions
  FOR DELETE USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
  );

-- ── accounts_payable (condicional) ───────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'accounts_payable') THEN
    DROP INDEX IF EXISTS idx_accounts_payable_partner_store;
    ALTER TABLE public.accounts_payable DROP COLUMN IF EXISTS store_id;

    DROP POLICY IF EXISTS "accounts_payable_select_own" ON public.accounts_payable;
    CREATE POLICY "accounts_payable_select_own" ON public.accounts_payable
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM partners WHERE id = partner_id AND user_id = auth.uid())
      );

    DROP POLICY IF EXISTS "accounts_payable_insert_own" ON public.accounts_payable;
    CREATE POLICY "accounts_payable_insert_own" ON public.accounts_payable
      FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM partners WHERE id = partner_id AND user_id = auth.uid())
      );

    DROP POLICY IF EXISTS "accounts_payable_update_own" ON public.accounts_payable;
    CREATE POLICY "accounts_payable_update_own" ON public.accounts_payable
      FOR UPDATE USING (
        EXISTS (SELECT 1 FROM partners WHERE id = partner_id AND user_id = auth.uid())
      );

    DROP POLICY IF EXISTS "accounts_payable_delete_own" ON public.accounts_payable;
    CREATE POLICY "accounts_payable_delete_own" ON public.accounts_payable
      FOR DELETE USING (
        EXISTS (SELECT 1 FROM partners WHERE id = partner_id AND user_id = auth.uid())
      );
  END IF;
END $$;

-- ── accounts_receivable (condicional) ────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'accounts_receivable') THEN
    DROP INDEX IF EXISTS idx_accounts_receivable_partner_store;
    ALTER TABLE public.accounts_receivable DROP COLUMN IF EXISTS store_id;

    DROP POLICY IF EXISTS "accounts_receivable_select_own" ON public.accounts_receivable;
    CREATE POLICY "accounts_receivable_select_own" ON public.accounts_receivable
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM partners WHERE id = partner_id AND user_id = auth.uid())
      );

    DROP POLICY IF EXISTS "accounts_receivable_insert_own" ON public.accounts_receivable;
    CREATE POLICY "accounts_receivable_insert_own" ON public.accounts_receivable
      FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM partners WHERE id = partner_id AND user_id = auth.uid())
      );

    DROP POLICY IF EXISTS "accounts_receivable_update_own" ON public.accounts_receivable;
    CREATE POLICY "accounts_receivable_update_own" ON public.accounts_receivable
      FOR UPDATE USING (
        EXISTS (SELECT 1 FROM partners WHERE id = partner_id AND user_id = auth.uid())
      );

    DROP POLICY IF EXISTS "accounts_receivable_delete_own" ON public.accounts_receivable;
    CREATE POLICY "accounts_receivable_delete_own" ON public.accounts_receivable
      FOR DELETE USING (
        EXISTS (SELECT 1 FROM partners WHERE id = partner_id AND user_id = auth.uid())
      );
  END IF;
END $$;

-- ── quotes ───────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_quotes_partner_store;
ALTER TABLE public.quotes DROP COLUMN IF EXISTS store_id;

DROP POLICY IF EXISTS quotes_select_policy ON public.quotes;
CREATE POLICY quotes_select_policy ON public.quotes
  FOR SELECT USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS quotes_insert_policy ON public.quotes;
CREATE POLICY quotes_insert_policy ON public.quotes
  FOR INSERT WITH CHECK (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid() AND role IN ('OWNER', 'ADMIN', 'MANAGER')
    )
  );

DROP POLICY IF EXISTS quotes_update_policy ON public.quotes;
CREATE POLICY quotes_update_policy ON public.quotes
  FOR UPDATE USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid() AND role IN ('OWNER', 'ADMIN', 'MANAGER')
    )
  ) WITH CHECK (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid() AND role IN ('OWNER', 'ADMIN', 'MANAGER')
    )
  );

DROP POLICY IF EXISTS quotes_delete_policy ON public.quotes;
CREATE POLICY quotes_delete_policy ON public.quotes
  FOR DELETE USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid() AND role IN ('OWNER', 'ADMIN')
    )
  );

-- ── quote_items ──────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_quote_items_partner_store;
ALTER TABLE public.quote_items DROP COLUMN IF EXISTS store_id;

DROP POLICY IF EXISTS qi_select_policy ON public.quote_items;
CREATE POLICY qi_select_policy ON public.quote_items
  FOR SELECT USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS qi_insert_policy ON public.quote_items;
CREATE POLICY qi_insert_policy ON public.quote_items
  FOR INSERT WITH CHECK (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid() AND role IN ('OWNER', 'ADMIN', 'MANAGER')
    )
  );

DROP POLICY IF EXISTS qi_update_policy ON public.quote_items;
CREATE POLICY qi_update_policy ON public.quote_items
  FOR UPDATE USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid() AND role IN ('OWNER', 'ADMIN', 'MANAGER')
    )
  ) WITH CHECK (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid() AND role IN ('OWNER', 'ADMIN', 'MANAGER')
    )
  );

DROP POLICY IF EXISTS qi_delete_policy ON public.quote_items;
CREATE POLICY qi_delete_policy ON public.quote_items
  FOR DELETE USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid() AND role IN ('OWNER', 'ADMIN')
    )
  );

COMMIT;
