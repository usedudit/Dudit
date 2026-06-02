-- ============================================================================
-- Migration: 971_perf_user_has_partner_access_rpc.sql
-- Performance (P1): consolidate the per-request "defense-in-depth" access check
-- used by getCurrentPartnerContext() into a SINGLE round-trip.
--
-- Before: every ERP request ran 2 queries (partners + partner_users) to confirm
-- the user still has access to the active partner during the cache TTL window.
-- After: one RPC returns a boolean (owner OR member).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.user_has_partner_access(
  p_partner_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.partners
    WHERE id = p_partner_id AND user_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.partner_users
    WHERE partner_id = p_partner_id AND user_id = p_user_id
  );
$$;

-- This check is invoked server-side with the service role. Restrict execution
-- so it cannot be called arbitrarily from the client.
REVOKE EXECUTE ON FUNCTION public.user_has_partner_access(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_partner_access(UUID, UUID) TO service_role;

-- Supporting indexes to keep the EXISTS lookups O(1). Created concurrently-safe
-- via IF NOT EXISTS so re-running the migration is a no-op.
CREATE INDEX IF NOT EXISTS idx_partners_id_user_id
  ON public.partners (id, user_id);

CREATE INDEX IF NOT EXISTS idx_partner_users_partner_id_user_id
  ON public.partner_users (partner_id, user_id);

COMMIT;
