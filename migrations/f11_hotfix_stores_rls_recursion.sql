-- ============================================================================
-- Hotfix F11: Break infinite RLS recursion on stores table
--
-- The stores_select policy was querying store_members, which in turn queried
-- stores (to verify partner ownership), creating a circular dependency:
--
--   stores_select → store_members → stores_select → ... INFINITE RECURSION
--
-- Fix: Use get_user_partner_ids() in stores_select instead of querying
-- store_members. get_user_partner_ids() queries partners + partner_users
-- only (SECURITY DEFINER, no recursion), and already covers all valid cases:
--
--   1. Owner:       partners.user_id = auth.uid()
--   2. Team member: partner_users.user_id = auth.uid()
--   3. Store member: must have partner_users record (FK constraint)
--
-- The user_has_store_access() function is NOT affected — it's SECURITY DEFINER
-- and bypasses RLS internally (runs as function owner / superuser).
-- All other stores_* policies already use get_user_partner_ids() safely.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "stores_select" ON stores;

CREATE POLICY "stores_select" ON stores
  FOR SELECT USING (
    partner_id IN (SELECT public.get_user_partner_ids())
  );

COMMIT;
