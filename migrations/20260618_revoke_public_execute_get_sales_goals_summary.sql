-- ============================================================
-- Security: Revoke PUBLIC EXECUTE on get_sales_goals_summary
-- The RPC is SECURITY DEFINER and was callable by any anon key
-- holder, allowing cross-partner data access.
-- Callers must go through the server action which has
-- requireUser() + requirePermission() checks.
-- ============================================================

-- Block anonymous (anon) and any unauthenticated access
REVOKE EXECUTE ON FUNCTION get_sales_goals_summary FROM PUBLIC;

-- Allow authenticated users — the server action
-- getSalesGoalsSummaryAction calls this RPC via
-- getSupabaseServerClient() (RLS client, authenticated role)
-- after its own requireUser() + requirePermission() checks.
GRANT EXECUTE ON FUNCTION get_sales_goals_summary TO authenticated;
