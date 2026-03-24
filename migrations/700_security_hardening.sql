-- ============================================================================
-- 700: Security Hardening
-- Adds audit logging, invite revocation, and performance indexes
-- ============================================================================

-- ─── 1. Invite Revocation Columns ──────────────────────────────────────────

ALTER TABLE partner_invitations
  ADD COLUMN IF NOT EXISTS revoked_at   timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by   uuid REFERENCES auth.users(id);

-- Partial index for fast lookup of active (unused, unrevoked, unexpired) invites
CREATE INDEX IF NOT EXISTS idx_partner_invitations_active
  ON partner_invitations(token_hash)
  WHERE used_at IS NULL AND revoked_at IS NULL;

-- ─── 2. Audit Logs — Add missing columns to existing table ─────────────────
-- Existing schema: id, table_name, action, user_id, old_values, new_values,
--                  ip_address, created_at
-- We add: partner_id, target_user_id for multi-tenant audit scoping.

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS partner_id      uuid REFERENCES partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- New indexes (existing ones: idx_audit_logs_table_name, idx_audit_logs_user_id)
CREATE INDEX IF NOT EXISTS idx_audit_logs_partner_id  ON audit_logs(partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action      ON audit_logs(action, created_at DESC);

-- RLS: Only service role can insert (via admin client in server actions)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Members can read audit logs for their own partner
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND policyname = 'audit_logs_select'
  ) THEN
    CREATE POLICY "audit_logs_select" ON audit_logs
      FOR SELECT USING (
        partner_id IN (
          SELECT pu.partner_id FROM partner_users pu WHERE pu.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ─── 3. Performance Indexes for Multi-Tenant Queries ───────────────────────

-- Composite index for products by partner (most common ERP query)
CREATE INDEX IF NOT EXISTS idx_products_partner_active
  ON products(partner_id, is_active)
  WHERE is_active = true;

-- Composite index for customers by partner
CREATE INDEX IF NOT EXISTS idx_customers_partner_id
  ON customers(partner_id);

-- Composite index for suppliers by partner
CREATE INDEX IF NOT EXISTS idx_suppliers_partner_id
  ON suppliers(partner_id);

-- Composite index for orders by partner + situation (common filter)
CREATE INDEX IF NOT EXISTS idx_orders_partner_situation
  ON orders(partner_id, situation);

-- Composite index for orders by buyer
CREATE INDEX IF NOT EXISTS idx_orders_buyer_id
  ON orders(buyer_id);

-- Composite index for stores by partner
CREATE INDEX IF NOT EXISTS idx_stores_partner_id
  ON stores(partner_id);

-- Index for partner_users compound lookups (already exists as unique constraint,
-- but adding explicit index on user_id + partner_id for reverse lookups)
CREATE INDEX IF NOT EXISTS idx_partner_users_user_partner
  ON partner_users(user_id, partner_id);
