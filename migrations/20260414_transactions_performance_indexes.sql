-- ============================================================
-- Performance indexes for the transactions page
-- All operations are ADDITIVE (no data loss)
-- Execute in Supabase SQL Editor
-- ============================================================

-- 1. Primary listing query: WHERE partner_id = X ORDER BY created_at DESC
-- Currently only idx_transactions_partner_id exists (single-column).
-- This composite index lets Postgres satisfy both the filter AND sort from a single index scan.
CREATE INDEX IF NOT EXISTS idx_transactions_partner_created
  ON public.transactions(partner_id, created_at DESC);

-- 2. Recurring occupancy check: used by generate_recurring_occurrences_bulk
-- to check if a recurring occurrence date is already materialized.
-- Partial index (only rows with recurring_id) keeps the index small.
CREATE INDEX IF NOT EXISTS idx_transactions_recurring_due_date_status
  ON public.transactions(recurring_id, due_date, status)
  WHERE recurring_id IS NOT NULL;

-- 3. Installment group queries: used for installment detail lookups
-- Partial index (only rows with installment_group_id) keeps the index small.
CREATE INDEX IF NOT EXISTS idx_transactions_installment_group_partner
  ON public.transactions(partner_id, installment_group_id)
  WHERE installment_group_id IS NOT NULL;

-- ============================================================
-- VERIFICATION: Run after applying
-- ============================================================
-- EXPLAIN ANALYZE
-- SELECT id, description, category, amount, status, created_at
-- FROM transactions
-- WHERE partner_id = 'YOUR_PARTNER_ID'
-- ORDER BY created_at DESC
-- LIMIT 50;
-- Expected: Index Scan using idx_transactions_partner_created
