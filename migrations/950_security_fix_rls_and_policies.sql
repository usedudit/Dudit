-- ============================================================================
-- Migration: 950_security_fix_rls_and_policies.sql
-- Security audit remediation: DB trigger, RLS updates, atomic stock RPC
-- ============================================================================

-- ─── CRIT-01: Auto-create user_profiles on signup via DB trigger ─────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, full_name, phone, pending_partner_registration)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1), ''),
    NULL,
    FALSE
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop if exists to avoid duplicates on re-run
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── CRIT-02: Atomic stock decrement RPC ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.decrement_stock_atomic(
  p_product_id UUID,
  p_quantity INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rows_affected INTEGER;
BEGIN
  UPDATE products
  SET stock_quantity = stock_quantity - p_quantity,
      updated_at = NOW()
  WHERE id = p_product_id
    AND stock_quantity >= p_quantity
    AND is_active = TRUE;

  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected > 0;
END;
$$;

-- ─── HIGH-02: Update RLS policies to include partner_users team access ────
-- Adds team member access (via partner_users) to all tenant-scoped policies.
-- Destructive ops (DELETE/UPDATE sensitive) require OWNER or ADMIN role.

-- Products: SELECT - owners + team members
DROP POLICY IF EXISTS products_select_policy ON products;
CREATE POLICY products_select_policy ON products
  FOR SELECT USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid()
    )
  );

-- Products: INSERT - owners + team members with OWNER/ADMIN/MANAGER role
DROP POLICY IF EXISTS products_insert_policy ON products;
CREATE POLICY products_insert_policy ON products
  FOR INSERT WITH CHECK (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users
        WHERE user_id = auth.uid()
        AND role IN ('OWNER', 'ADMIN', 'MANAGER')
    )
  );

-- Products: UPDATE - owners + team OWNER/ADMIN/MANAGER
DROP POLICY IF EXISTS products_update_policy ON products;
CREATE POLICY products_update_policy ON products
  FOR UPDATE USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users
        WHERE user_id = auth.uid()
        AND role IN ('OWNER', 'ADMIN', 'MANAGER')
    )
  )
  WITH CHECK (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users
        WHERE user_id = auth.uid()
        AND role IN ('OWNER', 'ADMIN', 'MANAGER')
    )
  );

-- Products: DELETE - owners + team OWNER/ADMIN only
DROP POLICY IF EXISTS products_delete_policy ON products;
CREATE POLICY products_delete_policy ON products
  FOR DELETE USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users
        WHERE user_id = auth.uid()
        AND role IN ('OWNER', 'ADMIN')
    )
  );

-- Services: same pattern
DROP POLICY IF EXISTS services_select_policy ON services;
CREATE POLICY services_select_policy ON services
  FOR SELECT USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS services_insert_policy ON services;
CREATE POLICY services_insert_policy ON services
  FOR INSERT WITH CHECK (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users
        WHERE user_id = auth.uid()
        AND role IN ('OWNER', 'ADMIN', 'MANAGER')
    )
  );

DROP POLICY IF EXISTS services_update_policy ON services;
CREATE POLICY services_update_policy ON services
  FOR UPDATE USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users
        WHERE user_id = auth.uid()
        AND role IN ('OWNER', 'ADMIN', 'MANAGER')
    )
  )
  WITH CHECK (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users
        WHERE user_id = auth.uid()
        AND role IN ('OWNER', 'ADMIN', 'MANAGER')
    )
  );

DROP POLICY IF EXISTS services_delete_policy ON services;
CREATE POLICY services_delete_policy ON services
  FOR DELETE USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users
        WHERE user_id = auth.uid()
        AND role IN ('OWNER', 'ADMIN')
    )
  );

-- Customers: SELECT all team, mutations require OWNER/ADMIN/MANAGER
DROP POLICY IF EXISTS customers_select_policy ON customers;
CREATE POLICY customers_select_policy ON customers
  FOR SELECT USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS customers_insert_policy ON customers;
CREATE POLICY customers_insert_policy ON customers
  FOR INSERT WITH CHECK (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users
        WHERE user_id = auth.uid()
        AND role IN ('OWNER', 'ADMIN', 'MANAGER')
    )
  );

DROP POLICY IF EXISTS customers_delete_policy ON customers;
CREATE POLICY customers_delete_policy ON customers
  FOR DELETE USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users
        WHERE user_id = auth.uid()
        AND role IN ('OWNER', 'ADMIN')
    )
  );

-- Orders: SELECT all team, no team delete
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

-- ─── MED-05: Fix payment_methods RLS ─────────────────────────────────────
-- Remove OR TRUE, scope to partner team members only
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

-- ─── HIGH-05: Admin audit logs RLS ────────────────────────────────────────
-- Only admins can read audit logs (uses admin_roles table)
DROP POLICY IF EXISTS admin_audit_logs_select ON admin_audit_logs;
CREATE POLICY admin_audit_logs_select ON admin_audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM admin_roles
      WHERE user_id = auth.uid()
    )
  );

-- ─── Performance indexes for new policy patterns ──────────────────────────
CREATE INDEX IF NOT EXISTS idx_partner_users_user_role
  ON partner_users(user_id, role);
