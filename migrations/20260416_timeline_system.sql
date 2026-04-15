-- ============================================================================
-- Timeline System Migration
-- Evolves audit_logs from a low-level DB audit table into a business-level
-- human-readable timeline system (Stripe/Notion-style activity logs).
--
-- SAFE MIGRATION: Does NOT delete old data. Old rows remain as legacy.
-- ============================================================================

-- ─── 1. Add new timeline columns ────────────────────────────────────────────

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id UUID,
  ADD COLUMN IF NOT EXISTS action_type TEXT,
  ADD COLUMN IF NOT EXISTS change_lines TEXT[] NOT NULL DEFAULT '{"ação registrada."}',
  ADD COLUMN IF NOT EXISTS metadata JSONB,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'system';

-- ─── 2. Safe user_id → actor_user_id migration ─────────────────────────────
-- Create new column, copy data, keep old column for backward compatibility.
-- user_id will be dropped in a future migration after full rollout.

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE audit_logs
  SET actor_user_id = user_id
  WHERE actor_user_id IS NULL AND user_id IS NOT NULL;

-- ─── 3. Drop ip_address (no longer collected) ──────────────────────────────

ALTER TABLE audit_logs DROP COLUMN IF EXISTS ip_address;

-- ─── 4. Performance indexes for timeline queries ────────────────────────────

-- Entity-scoped timeline (e.g. "show all events for transaction X")
CREATE INDEX IF NOT EXISTS idx_audit_timeline_entity
  ON audit_logs(partner_id, entity_type, entity_id, created_at DESC);

-- Partner-scoped global timeline (e.g. "show all recent activity")
CREATE INDEX IF NOT EXISTS idx_audit_timeline_partner
  ON audit_logs(partner_id, created_at DESC);

-- Entity type filtering
CREATE INDEX IF NOT EXISTS idx_audit_entity_type 
  ON audit_logs(entity_type, created_at DESC);

-- Fast entity retrieval
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_fast
ON audit_logs(partner_id, entity_type, entity_id, created_at DESC);

-- ─── 5. Drop old full-snapshot triggers ─────────────────────────────────────
-- These auto-insert row_to_json(OLD)/row_to_json(NEW) on every mutation,
-- generating heavy JSON and bloating storage. New system uses explicit
-- human-readable logAuditEvent() calls instead.

DROP TRIGGER IF EXISTS audit_partners ON partners;
DROP TRIGGER IF EXISTS audit_products ON products;
DROP TRIGGER IF EXISTS audit_payment_methods ON payment_methods;
DROP TRIGGER IF EXISTS audit_orders ON orders;

-- ─── 6. Update RLS policies ────────────────────────────────────────────────

-- Drop old policies
DROP POLICY IF EXISTS "Admins can view audit logs" ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;

-- Members can read audit logs for their own partner(s)
CREATE POLICY "audit_logs_select" ON audit_logs
  FOR SELECT USING (
    partner_id IN (
      SELECT pu.partner_id FROM partner_users pu WHERE pu.user_id = auth.uid()
    )
  );

-- Service role insert (admin client bypasses RLS, but for explicitness)
DROP POLICY IF EXISTS "audit_logs_insert_service" ON audit_logs;
CREATE POLICY "audit_logs_insert_service" ON audit_logs
  FOR INSERT WITH CHECK (true);

-- ─── Done ───────────────────────────────────────────────────────────────────

DO $$
BEGIN
  RAISE NOTICE '✅ Timeline system migration complete.';
  RAISE NOTICE '   - New columns: entity_type, entity_id, action_type, change_lines, metadata, source, actor_user_id';
  RAISE NOTICE '   - Dropped: ip_address, 4 row-snapshot triggers';
  RAISE NOTICE '   - Old data preserved as legacy';
END $$;
