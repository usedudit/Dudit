-- =============================================================================
-- Shared cash sessions per partner (not per user)
-- 
-- Changes:
--   1. Drop per-user unique index, create per-partner unique index
--   2. Add index for operator grouping on cash_movements
-- =============================================================================

-- Drop the OLD per-user unique index
DROP INDEX IF EXISTS public.idx_cash_sessions_open_user_partner;

-- Create NEW unique index: ONE open session per partner
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_sessions_open_partner
  ON public.cash_sessions (partner_id)
  WHERE status = 'open';

-- Add index for operator-based grouping on cash_movements (for closing summaries)
CREATE INDEX IF NOT EXISTS idx_cash_movements_session_operator
  ON public.cash_movements (cash_session_id, created_by_user_id, type)
  WHERE reversed_at IS NULL;
