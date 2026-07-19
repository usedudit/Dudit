-- F17+ Fase 2: RLS para tabelas HYBRID nullable
-- Atualiza políticas para considerar store_id (NULL = global, UUID = store-específico)
-- Segue o padrão consolidado: AND (store_id IS NULL OR user_has_store_access(store_id))
-- f3_rls_store_aware.sql, f9_add_store_id_to_financial_tables.sql

BEGIN;

-- ============================================================
-- 1. financial_categories
-- ============================================================

DROP POLICY IF EXISTS "Partners can manage their own financial categories" ON public.financial_categories;

CREATE POLICY "financial_categories_partner_store" ON public.financial_categories
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM partners
      WHERE partners.id = financial_categories.partner_id
        AND partners.user_id = auth.uid()
    )
    AND (financial_categories.store_id IS NULL OR public.user_has_store_access(financial_categories.store_id))
  );

-- ============================================================
-- 2. finance_accounts
-- ============================================================

DROP POLICY IF EXISTS "Partners can manage their own finance accounts" ON public.finance_accounts;

CREATE POLICY "finance_accounts_partner_store" ON public.finance_accounts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM partners
      WHERE partners.id = finance_accounts.partner_id
        AND partners.user_id = auth.uid()
    )
    AND (finance_accounts.store_id IS NULL OR public.user_has_store_access(finance_accounts.store_id))
  );

-- ============================================================
-- 3. transaction_contacts
-- ============================================================

DROP POLICY IF EXISTS "transaction_contacts_select_own" ON public.transaction_contacts;
CREATE POLICY "transaction_contacts_select_own" ON public.transaction_contacts
  FOR SELECT USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS "transaction_contacts_insert_own" ON public.transaction_contacts;
CREATE POLICY "transaction_contacts_insert_own" ON public.transaction_contacts
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS "transaction_contacts_update_own" ON public.transaction_contacts;
CREATE POLICY "transaction_contacts_update_own" ON public.transaction_contacts
  FOR UPDATE USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS "transaction_contacts_delete_own" ON public.transaction_contacts;
CREATE POLICY "transaction_contacts_delete_own" ON public.transaction_contacts
  FOR DELETE USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

-- ============================================================
-- 4. campaigns
-- ============================================================

DROP POLICY IF EXISTS campaigns_partner_users ON public.campaigns;

CREATE POLICY campaigns_partner_store ON public.campaigns
  FOR ALL USING (
    partner_id IN (SELECT public.get_user_partner_ids())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

COMMIT;
