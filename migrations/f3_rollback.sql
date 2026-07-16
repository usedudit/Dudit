-- ============================================================================
-- Fase 3 - Rollback
-- ============================================================================
-- Reverte todas as alterações da Fase 3 (RLS e Permissões).
-- ============================================================================

BEGIN;

-- 1. Remover função user_has_store_access
DROP FUNCTION IF EXISTS public.user_has_store_access(UUID);

-- 2. Restaurar SELECT policies para o estado anterior (Fase 2)
-- Products
DROP POLICY IF EXISTS products_select_policy ON products;
CREATE POLICY products_select_policy ON products
  FOR SELECT USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid()
    )
  );

-- Services
DROP POLICY IF EXISTS services_select_policy ON services;
CREATE POLICY services_select_policy ON services
  FOR SELECT USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid()
    )
  );

-- Customers
DROP POLICY IF EXISTS customers_select_policy ON customers;
CREATE POLICY customers_select_policy ON customers
  FOR SELECT USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid()
    )
  );

-- Orders
DROP POLICY IF EXISTS orders_select_policy ON orders;
CREATE POLICY orders_select_policy ON orders
  FOR SELECT USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid()
    )
    OR buyer_id = auth.uid()
  );

-- Stock Movements
DROP POLICY IF EXISTS partner_team_can_view_stock_movements ON stock_movements;
CREATE POLICY partner_team_can_view_stock_movements ON stock_movements
  FOR SELECT USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid()
    )
  );

-- Payment Methods
DROP POLICY IF EXISTS payment_methods_select_active_for_checkout ON payment_methods;
CREATE POLICY payment_methods_select_active_for_checkout ON payment_methods
  FOR SELECT USING (
    is_active = TRUE
    AND partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid()
    )
  );

-- Suppliers - restore owner-only
DROP POLICY IF EXISTS suppliers_select_policy ON suppliers;
CREATE POLICY "suppliers_select_own" ON suppliers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM partners
      WHERE id = partner_id AND user_id = auth.uid()
    )
  );

-- Product Kits - restore owner-only
DROP POLICY IF EXISTS product_kits_select_policy ON product_kits;
CREATE POLICY "Parceiros podem ver seus kits" ON product_kits
  FOR SELECT USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
  );

COMMIT;
