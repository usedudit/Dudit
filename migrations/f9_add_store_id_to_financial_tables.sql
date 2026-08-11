-- ============================================================================
-- Fase 9 - Add store_id to financial tables
-- ============================================================================
BEGIN;

-- ── transactions ──────────────────────────────────────────────────────────
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_partner_store ON public.transactions(partner_id, store_id);

DROP POLICY IF EXISTS "transactions_select_own" ON public.transactions;
CREATE POLICY "transactions_select_own" ON public.transactions
  FOR SELECT USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS "transactions_insert_own" ON public.transactions;
CREATE POLICY "transactions_insert_own" ON public.transactions
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS "transactions_update_own" ON public.transactions;
CREATE POLICY "transactions_update_own" ON public.transactions
  FOR UPDATE USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS "transactions_delete_own" ON public.transactions;
CREATE POLICY "transactions_delete_own" ON public.transactions
  FOR DELETE USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

-- ── recurring_transactions ───────────────────────────────────────────────
ALTER TABLE public.recurring_transactions
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recurring_transactions_partner_store ON public.recurring_transactions(partner_id, store_id);

DROP POLICY IF EXISTS "recurring_transactions_select_own" ON public.recurring_transactions;
CREATE POLICY "recurring_transactions_select_own" ON public.recurring_transactions
  FOR SELECT USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS "recurring_transactions_insert_own" ON public.recurring_transactions;
CREATE POLICY "recurring_transactions_insert_own" ON public.recurring_transactions
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS "recurring_transactions_update_own" ON public.recurring_transactions;
CREATE POLICY "recurring_transactions_update_own" ON public.recurring_transactions
  FOR UPDATE USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS "recurring_transactions_delete_own" ON public.recurring_transactions;
CREATE POLICY "recurring_transactions_delete_own" ON public.recurring_transactions
  FOR DELETE USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

-- ── accounts_payable (condicional - tabela pode não existir) ────────────
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'accounts_payable') THEN
    ALTER TABLE public.accounts_payable
      ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_accounts_payable_partner_store ON public.accounts_payable(partner_id, store_id);

    DROP POLICY IF EXISTS "accounts_payable_select_own" ON public.accounts_payable;
    CREATE POLICY "accounts_payable_select_own" ON public.accounts_payable
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM partners WHERE id = partner_id AND user_id = auth.uid())
        AND (store_id IS NULL OR public.user_has_store_access(store_id))
      );

    DROP POLICY IF EXISTS "accounts_payable_insert_own" ON public.accounts_payable;
    CREATE POLICY "accounts_payable_insert_own" ON public.accounts_payable
      FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM partners WHERE id = partner_id AND user_id = auth.uid())
        AND (store_id IS NULL OR public.user_has_store_access(store_id))
      );

    DROP POLICY IF EXISTS "accounts_payable_update_own" ON public.accounts_payable;
    CREATE POLICY "accounts_payable_update_own" ON public.accounts_payable
      FOR UPDATE USING (
        EXISTS (SELECT 1 FROM partners WHERE id = partner_id AND user_id = auth.uid())
        AND (store_id IS NULL OR public.user_has_store_access(store_id))
      );

    DROP POLICY IF EXISTS "accounts_payable_delete_own" ON public.accounts_payable;
    CREATE POLICY "accounts_payable_delete_own" ON public.accounts_payable
      FOR DELETE USING (
        EXISTS (SELECT 1 FROM partners WHERE id = partner_id AND user_id = auth.uid())
        AND (store_id IS NULL OR public.user_has_store_access(store_id))
      );
  END IF;
END $$;

-- ── accounts_receivable (condicional - tabela pode não existir) ──────────
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'accounts_receivable') THEN
    ALTER TABLE public.accounts_receivable
      ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_accounts_receivable_partner_store ON public.accounts_receivable(partner_id, store_id);

    DROP POLICY IF EXISTS "accounts_receivable_select_own" ON public.accounts_receivable;
    CREATE POLICY "accounts_receivable_select_own" ON public.accounts_receivable
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM partners WHERE id = partner_id AND user_id = auth.uid())
        AND (store_id IS NULL OR public.user_has_store_access(store_id))
      );

    DROP POLICY IF EXISTS "accounts_receivable_insert_own" ON public.accounts_receivable;
    CREATE POLICY "accounts_receivable_insert_own" ON public.accounts_receivable
      FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM partners WHERE id = partner_id AND user_id = auth.uid())
        AND (store_id IS NULL OR public.user_has_store_access(store_id))
      );

    DROP POLICY IF EXISTS "accounts_receivable_update_own" ON public.accounts_receivable;
    CREATE POLICY "accounts_receivable_update_own" ON public.accounts_receivable
      FOR UPDATE USING (
        EXISTS (SELECT 1 FROM partners WHERE id = partner_id AND user_id = auth.uid())
        AND (store_id IS NULL OR public.user_has_store_access(store_id))
      );

    DROP POLICY IF EXISTS "accounts_receivable_delete_own" ON public.accounts_receivable;
    CREATE POLICY "accounts_receivable_delete_own" ON public.accounts_receivable
      FOR DELETE USING (
        EXISTS (SELECT 1 FROM partners WHERE id = partner_id AND user_id = auth.uid())
        AND (store_id IS NULL OR public.user_has_store_access(store_id))
      );
  END IF;
END $$;

-- ── quotes ───────────────────────────────────────────────────────────────
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_partner_store ON public.quotes(partner_id, store_id);

DROP POLICY IF EXISTS quotes_select_policy ON public.quotes;
CREATE POLICY quotes_select_policy ON public.quotes
  FOR SELECT USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid()
    )
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS quotes_insert_policy ON public.quotes;
CREATE POLICY quotes_insert_policy ON public.quotes
  FOR INSERT WITH CHECK (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid() AND role IN ('OWNER', 'ADMIN', 'MANAGER')
    )
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
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
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS quotes_delete_policy ON public.quotes;
CREATE POLICY quotes_delete_policy ON public.quotes
  FOR DELETE USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid() AND role IN ('OWNER', 'ADMIN')
    )
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

-- ── quote_items ──────────────────────────────────────────────────────────
ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quote_items_partner_store ON public.quote_items(partner_id, store_id);

DROP POLICY IF EXISTS qi_select_policy ON public.quote_items;
CREATE POLICY qi_select_policy ON public.quote_items
  FOR SELECT USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid()
    )
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS qi_insert_policy ON public.quote_items;
CREATE POLICY qi_insert_policy ON public.quote_items
  FOR INSERT WITH CHECK (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid() AND role IN ('OWNER', 'ADMIN', 'MANAGER')
    )
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
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
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS qi_delete_policy ON public.quote_items;
CREATE POLICY qi_delete_policy ON public.quote_items
  FOR DELETE USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid() AND role IN ('OWNER', 'ADMIN')
    )
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

-- ── Backfill: set Loja Principal for existing records ────────────────────
UPDATE public.transactions t
SET store_id = (SELECT s.id FROM public.stores s WHERE s.partner_id = t.partner_id AND s.is_headquarters = true LIMIT 1)
WHERE t.store_id IS NULL;

UPDATE public.recurring_transactions rt
SET store_id = (SELECT s.id FROM public.stores s WHERE s.partner_id = rt.partner_id AND s.is_headquarters = true LIMIT 1)
WHERE rt.store_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'accounts_payable') THEN
    UPDATE public.accounts_payable ap
    SET store_id = (SELECT s.id FROM public.stores s WHERE s.partner_id = ap.partner_id AND s.is_headquarters = true LIMIT 1)
    WHERE ap.store_id IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'accounts_receivable') THEN
    UPDATE public.accounts_receivable ar
    SET store_id = (SELECT s.id FROM public.stores s WHERE s.partner_id = ar.partner_id AND s.is_headquarters = true LIMIT 1)
    WHERE ar.store_id IS NULL;
  END IF;
END $$;

UPDATE public.quotes q
SET store_id = (SELECT s.id FROM public.stores s WHERE s.partner_id = q.partner_id AND s.is_headquarters = true LIMIT 1)
WHERE q.store_id IS NULL;

UPDATE public.quote_items qi
SET store_id = (SELECT s.id FROM public.stores s WHERE s.partner_id = qi.partner_id AND s.is_headquarters = true LIMIT 1)
WHERE qi.store_id IS NULL;

COMMIT;
