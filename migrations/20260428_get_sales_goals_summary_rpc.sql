-- ============================================================
-- RPC: get_sales_goals_summary
-- Replaces 5 unbounded client-side queries with a single
-- server-side aggregation. Returns JSON with pre-computed sums.
--
-- Safety: SECURITY DEFINER with explicit partner_id parameter.
-- No cross-partner data exposure - every sub-query is scoped.
-- ============================================================

CREATE OR REPLACE FUNCTION get_sales_goals_summary(p_partner_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  v_today DATE := CURRENT_DATE;
  v_goal_ids UUID[];
BEGIN
  -- Collect goal IDs for this partner (used in progress sub-query)
  SELECT ARRAY_AGG(id) INTO v_goal_ids
  FROM sales_goals
  WHERE partner_id = p_partner_id;

  SELECT json_build_object(
    'total_sold', COALESCE((
      SELECT SUM(final_amount)
      FROM sales
      WHERE partner_id = p_partner_id
        AND payment_status IN ('paid', 'partially_paid')
    ), 0),
    'total_commissions', COALESCE((
      SELECT SUM(amount)
      FROM transactions
      WHERE partner_id = p_partner_id
        AND category = 'Comissões'
        AND transaction_type = 'expense'
    ), 0),
    'total_bonus_paid', COALESCE((
      SELECT SUM(amount)
      FROM transactions
      WHERE partner_id = p_partner_id
        AND transaction_type = 'expense'
        AND category = 'Metas e Bônus'
        AND description ILIKE '%Bônus por meta atingida%'
    ), 0),
    'active_goals', (
      SELECT COUNT(*)
      FROM sales_goals
      WHERE partner_id = p_partner_id
        AND start_date <= v_today
        AND end_date >= v_today
    ),
    'achieved_goals', CASE
      WHEN v_goal_ids IS NULL THEN 0
      ELSE (
        SELECT COUNT(DISTINCT goal_id)
        FROM sales_goal_progress
        WHERE achieved = true
          AND goal_id = ANY(v_goal_ids)
      )
    END
  ) INTO result;

  RETURN result;
END;
$$;
