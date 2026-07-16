-- ============================================================================
-- Fase 3 - Atualizar RLS de tabelas com store_id para verificar
--           user_has_store_access()
-- ============================================================================
-- Estratégia: Adicionar AND (store_id IS NULL OR user_has_store_access(store_id))
-- às SELECT policies existentes. Isso garante que o usuário só veja registros
-- de stores às quais tem acesso, mantendo compatibilidade com registros sem
-- store_id (store_id IS NULL) que são visíveis para todos com acesso ao partner.
--
-- Mutation policies (INSERT/UPDATE/DELETE) não são alteradas nesta fase pois:
-- 1. Já verificam partner_id via role_id gating (migration 20260703)
-- 2. Store-level mutation validation será feita via helpers server-side
-- ============================================================================

BEGIN;

-- ─── Products ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS products_select_policy ON products;
CREATE POLICY products_select_policy ON products
  FOR SELECT USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid()
    )
    AND (
      store_id IS NULL
      OR public.user_has_store_access(store_id)
    )
  );

-- ─── Services ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS services_select_policy ON services;
CREATE POLICY services_select_policy ON services
  FOR SELECT USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid()
    )
    AND (
      store_id IS NULL
      OR public.user_has_store_access(store_id)
    )
  );

-- ─── Customers ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS customers_select_policy ON customers;
CREATE POLICY customers_select_policy ON customers
  FOR SELECT USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid()
    )
    AND (
      store_id IS NULL
      OR public.user_has_store_access(store_id)
    )
  );

-- ─── Orders ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS orders_select_policy ON orders;
CREATE POLICY orders_select_policy ON orders
  FOR SELECT USING (
    (
      partner_id IN (
        SELECT id FROM partners WHERE user_id = auth.uid()
        UNION
        SELECT partner_id FROM partner_users WHERE user_id = auth.uid()
      )
      AND (
        store_id IS NULL
        OR public.user_has_store_access(store_id)
      )
    )
    OR buyer_id = auth.uid()
  );

-- ─── Suppliers ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS suppliers_select_own ON suppliers;
CREATE POLICY suppliers_select_policy ON suppliers
  FOR SELECT USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid()
    )
    AND (
      store_id IS NULL
      OR public.user_has_store_access(store_id)
    )
  );

-- ─── Stock Movements ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS partner_team_can_view_stock_movements ON stock_movements;
CREATE POLICY partner_team_can_view_stock_movements ON stock_movements
  FOR SELECT USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid()
    )
    AND (
      store_id IS NULL
      OR public.user_has_store_access(store_id)
    )
  );

-- ─── Payment Methods ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS payment_methods_select_active_for_checkout ON payment_methods;
CREATE POLICY payment_methods_select_active_for_checkout ON payment_methods
  FOR SELECT USING (
    is_active = TRUE
    AND partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid()
    )
    AND (
      store_id IS NULL
      OR public.user_has_store_access(store_id)
    )
  );

-- ─── Product Kits ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Parceiros podem ver seus kits" ON product_kits;
CREATE POLICY product_kits_select_policy ON product_kits
  FOR SELECT USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid()
    )
    AND (
      store_id IS NULL
      OR public.user_has_store_access(store_id)
    )
  );

-- ─── Reviews ────────────────────────────────────────────────────────────────
-- Reviews are publicly readable (marketplace), so no partner restriction needed.
-- store_id filter is done at the application level.

COMMIT;
