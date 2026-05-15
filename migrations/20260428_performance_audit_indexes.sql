-- ============================================================
-- PERFORMANCE AUDIT: Missing Indexes
-- 2026-04-28
-- All operations are ADDITIVE (no data loss, no schema changes)
-- Safe to run multiple times (IF NOT EXISTS on every statement)
-- ============================================================

-- 1. Customers: composite index for list queries
--    Used by: getPartnerCustomersAction, fetchCustomersWithStorePriority, getERPCustomersPageAction
--    Current: no composite index → sequential scan on large customer tables
CREATE INDEX IF NOT EXISTS idx_customers_partner_created
  ON public.customers(partner_id, created_at DESC);

-- 2. Customers: keyset pagination support (created_at DESC, id DESC)
--    Used by: getERPCustomersPageAction with cursor-based pagination
CREATE INDEX IF NOT EXISTS idx_customers_partner_created_id_desc
  ON public.customers(partner_id, created_at DESC, id DESC);

-- 3. Sales: partner + payment_status + created_at (ranking and summary queries)
--    Used by: fetchRanking, getSalesGoalsSummaryAction
--    Current: no composite index → full table scan on sales
CREATE INDEX IF NOT EXISTS idx_sales_partner_status_created
  ON public.sales(partner_id, payment_status, created_at DESC);

-- 4. Sales: finalized_by_user_id for ranking query grouping
--    Used by: fetchRanking groups sales by finalized_by_user_id
CREATE INDEX IF NOT EXISTS idx_sales_finalized_by_user
  ON public.sales(partner_id, finalized_by_user_id);

-- 5. Sales goals: active goal lookup by date range
--    Used by: getActiveGoalsForSeller (called on every sale finalization)
CREATE INDEX IF NOT EXISTS idx_sales_goals_partner_dates
  ON public.sales_goals(partner_id, start_date, end_date);

-- 6. Sales goal progress: unique constraint + index for upsert hot path
--    Used by: applySaleToGoals upsert with onConflict: "goal_id,user_id"
--    NOTE: If this unique index already exists from the upsert constraint, this is a no-op
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_goal_progress_goal_user
  ON public.sales_goal_progress(goal_id, user_id);

-- 7. Transactions: reference_note lookups (dedup checks in commissions + goal bonuses)
--    Used by: createCommissionExpenseForEntity, createGoalBonusExpense, reverseGoalBonusExpense
--    Partial index: only rows with reference_note are indexed (keeps index small)
CREATE INDEX IF NOT EXISTS idx_transactions_partner_reference_note
  ON public.transactions(partner_id, reference_note)
  WHERE reference_note IS NOT NULL;

-- 8. Transactions: category + type filter (summary aggregation queries)
--    Used by: getSalesGoalsSummaryAction filters by category + transaction_type
CREATE INDEX IF NOT EXISTS idx_transactions_partner_category_type
  ON public.transactions(partner_id, category, transaction_type);

-- 9. Employee commissions: lookup by partner + user + role
--    Used by: getCommissionConfig (called on every sale for seller commission)
CREATE INDEX IF NOT EXISTS idx_employee_commissions_partner_user_role
  ON public.employee_commissions(partner_id, user_id, role);

-- 10. Audit logs: entity lookup for order/transaction history
--     Used by: fetchOrderHistoryEntries, getTimelineEntries
CREATE INDEX IF NOT EXISTS idx_audit_logs_partner_entity
  ON public.audit_logs(partner_id, entity_type, entity_id);

-- 11. (Removed - sale_id column does not exist on orders table)

-- 12. Payment methods: partner + active status (checkout, POS initial data)
--     Used by: getPOSInitialDataAction, applyPaymentMethodPricingToTotal
CREATE INDEX IF NOT EXISTS idx_payment_methods_partner_active
  ON public.payment_methods(partner_id, is_active);

-- 13. Cash movements: session lookup with ordering
--     Used by: loadMovementsForSession
CREATE INDEX IF NOT EXISTS idx_cash_movements_partner_session
  ON public.cash_movements(partner_id, cash_session_id, created_at DESC);

-- 14. Pre-sales: draft lookup for PDV initial load
--     Used by: getPOSInitialDataAction filters by partner_id + status = 'draft'
CREATE INDEX IF NOT EXISTS idx_pre_sales_partner_status
  ON public.pre_sales(partner_id, status, created_at DESC);

-- 15. Addresses: customer address lookup by type
--     Used by: updateComprehensiveCustomerAction address sync
--     Partial index: only rows linked to a customer
CREATE INDEX IF NOT EXISTS idx_addresses_customer_type
  ON public.addresses(customer_id, address_type)
  WHERE customer_id IS NOT NULL;

-- 16. Partner users: user_id lookup (authorization hot path)
--     Used by: checkPartnerAccess, getAllUserPartnerAccess
--     This is queried on EVERY authenticated ERP request
CREATE INDEX IF NOT EXISTS idx_partner_users_user_id
  ON public.partner_users(user_id);

-- ============================================================
-- VERIFICATION: Run these after applying to confirm index usage
-- ============================================================
-- EXPLAIN ANALYZE SELECT * FROM customers WHERE partner_id = 'xxx' ORDER BY created_at DESC LIMIT 100;
-- EXPLAIN ANALYZE SELECT * FROM sales WHERE partner_id = 'xxx' AND payment_status IN ('paid') ORDER BY created_at DESC;
-- EXPLAIN ANALYZE SELECT * FROM transactions WHERE partner_id = 'xxx' AND reference_note = 'xxx';
-- EXPLAIN ANALYZE SELECT * FROM partner_users WHERE user_id = 'xxx';
