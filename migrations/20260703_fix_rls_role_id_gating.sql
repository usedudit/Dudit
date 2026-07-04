-- ============================================================================
-- Migration: 20260703_fix_rls_role_id_gating.sql
-- Security fix: align RLS mutation policies with the RBAC refactor.
--
-- CONTEXT
-- Migration 950 gated destructive RLS policies on the LEGACY `partner_users.role`
-- column (uppercase: 'OWNER'/'ADMIN'/'MANAGER'). The RBAC refactor
-- (20260505_rbac_roles_table.sql) made `partner_users.role_id` (lowercase:
-- 'owner'/'admin'/'manager'/'operator'/'delivery') the source of truth, and the
-- application now writes ONLY `role_id`. New team members therefore keep the
-- legacy `role` at its default ('OPERATOR'), so the 950 policies would deny
-- access to legitimate admins/managers. This was masked only because mutations
-- run through the service-role client (which bypasses RLS), leaving RLS inert as
-- a second line of defense.
--
-- This migration recreates the role-gated mutation policies using `role_id` so
-- RLS becomes a reliable second layer of tenant isolation. SELECT policies and
-- non-role-gated policies from 950 are intentionally left untouched.
--
-- Idempotent: safe to re-run (DROP POLICY IF EXISTS + CREATE).
-- ============================================================================

-- ─── Products ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS products_insert_policy ON products;
CREATE POLICY products_insert_policy ON products
  FOR INSERT WITH CHECK (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users
        WHERE user_id = auth.uid()
        AND role_id IN ('owner', 'admin', 'manager')
    )
  );

DROP POLICY IF EXISTS products_update_policy ON products;
CREATE POLICY products_update_policy ON products
  FOR UPDATE USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users
        WHERE user_id = auth.uid()
        AND role_id IN ('owner', 'admin', 'manager')
    )
  )
  WITH CHECK (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users
        WHERE user_id = auth.uid()
        AND role_id IN ('owner', 'admin', 'manager')
    )
  );

DROP POLICY IF EXISTS products_delete_policy ON products;
CREATE POLICY products_delete_policy ON products
  FOR DELETE USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users
        WHERE user_id = auth.uid()
        AND role_id IN ('owner', 'admin')
    )
  );

-- ─── Services ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS services_insert_policy ON services;
CREATE POLICY services_insert_policy ON services
  FOR INSERT WITH CHECK (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users
        WHERE user_id = auth.uid()
        AND role_id IN ('owner', 'admin', 'manager')
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
        AND role_id IN ('owner', 'admin', 'manager')
    )
  )
  WITH CHECK (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users
        WHERE user_id = auth.uid()
        AND role_id IN ('owner', 'admin', 'manager')
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
        AND role_id IN ('owner', 'admin')
    )
  );

-- ─── Customers ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS customers_insert_policy ON customers;
CREATE POLICY customers_insert_policy ON customers
  FOR INSERT WITH CHECK (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users
        WHERE user_id = auth.uid()
        AND role_id IN ('owner', 'admin', 'manager')
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
        AND role_id IN ('owner', 'admin')
    )
  );

-- ─── Performance index for the new role_id predicate ──────────────────────
CREATE INDEX IF NOT EXISTS idx_partner_users_user_role_id
  ON partner_users(user_id, role_id);
