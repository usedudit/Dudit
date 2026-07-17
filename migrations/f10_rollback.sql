-- ============================================================================
-- Fase 10 Rollback - Remove store_id from POS/Cash Register tables
-- ============================================================================

BEGIN;

-- Restore unique index on cash_sessions (partner_id only, shared cash sessions)
-- NOTE: user_id was renamed to opened_by_user_id in 20260421_cash_register_production.sql
DROP INDEX IF EXISTS public.idx_cash_sessions_open_user_partner_store;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_sessions_open_partner
  ON public.cash_sessions (partner_id)
  WHERE status = 'open';

-- Remove store_id from cash_movements
DROP INDEX IF EXISTS public.idx_cash_movements_store_id;
ALTER TABLE public.cash_movements DROP COLUMN IF EXISTS store_id;

-- Remove store_id from cash_sessions
DROP INDEX IF EXISTS public.idx_cash_sessions_store_id;
ALTER TABLE public.cash_sessions DROP COLUMN IF EXISTS store_id;

-- Remove store_id from sale_items
DROP INDEX IF EXISTS public.idx_sale_items_store_id;
ALTER TABLE public.sale_items DROP COLUMN IF EXISTS store_id;

-- Remove store_id from sales
DROP INDEX IF EXISTS public.idx_sales_store_id;
DROP INDEX IF EXISTS public.idx_sales_partner_store_created;
ALTER TABLE public.sales DROP COLUMN IF EXISTS store_id;

-- Remove store_id from pre_sales
DROP INDEX IF EXISTS public.idx_pre_sales_store_id;
DROP INDEX IF EXISTS public.idx_pre_sales_partner_store_status;
ALTER TABLE public.pre_sales DROP COLUMN IF EXISTS store_id;

-- Restore original RLS policies for pre_sales (owner-only access)
DROP POLICY IF EXISTS "pre_sales_select_own" ON public.pre_sales;
CREATE POLICY "pre_sales_select_own" ON public.pre_sales
  FOR SELECT USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS "pre_sales_insert_own" ON public.pre_sales;
CREATE POLICY "pre_sales_insert_own" ON public.pre_sales
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS "pre_sales_update_own" ON public.pre_sales;
CREATE POLICY "pre_sales_update_own" ON public.pre_sales
  FOR UPDATE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS "pre_sales_delete_own" ON public.pre_sales;
CREATE POLICY "pre_sales_delete_own" ON public.pre_sales
  FOR DELETE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );

-- Restore original RLS policies for sales
DROP POLICY IF EXISTS "sales_select_own" ON public.sales;
CREATE POLICY "sales_select_own" ON public.sales
  FOR SELECT USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS "sales_insert_own" ON public.sales;
CREATE POLICY "sales_insert_own" ON public.sales
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS "sales_update_own" ON public.sales;
CREATE POLICY "sales_update_own" ON public.sales
  FOR UPDATE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS "sales_delete_own" ON public.sales;
CREATE POLICY "sales_delete_own" ON public.sales
  FOR DELETE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );

-- Restore original RLS policies for sale_items
DROP POLICY IF EXISTS "sale_items_select_own" ON public.sale_items;
CREATE POLICY "sale_items_select_own" ON public.sale_items
  FOR SELECT USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS "sale_items_insert_own" ON public.sale_items;
CREATE POLICY "sale_items_insert_own" ON public.sale_items
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS "sale_items_update_own" ON public.sale_items;
CREATE POLICY "sale_items_update_own" ON public.sale_items
  FOR UPDATE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS "sale_items_delete_own" ON public.sale_items;
CREATE POLICY "sale_items_delete_own" ON public.sale_items
  FOR DELETE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );

-- Restore original RLS policies for cash_sessions
DROP POLICY IF EXISTS "cash_sessions_select_own" ON public.cash_sessions;
CREATE POLICY "cash_sessions_select_own" ON public.cash_sessions
  FOR SELECT USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS "cash_sessions_insert_own" ON public.cash_sessions;
CREATE POLICY "cash_sessions_insert_own" ON public.cash_sessions
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS "cash_sessions_update_own" ON public.cash_sessions;
CREATE POLICY "cash_sessions_update_own" ON public.cash_sessions
  FOR UPDATE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS "cash_sessions_delete_own" ON public.cash_sessions;
CREATE POLICY "cash_sessions_delete_own" ON public.cash_sessions
  FOR DELETE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );

-- Restore original RLS policies for cash_movements
DROP POLICY IF EXISTS "cash_movements_select_own" ON public.cash_movements;
CREATE POLICY "cash_movements_select_own" ON public.cash_movements
  FOR SELECT USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS "cash_movements_insert_own" ON public.cash_movements;
CREATE POLICY "cash_movements_insert_own" ON public.cash_movements
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS "cash_movements_update_own" ON public.cash_movements;
CREATE POLICY "cash_movements_update_own" ON public.cash_movements
  FOR UPDATE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS "cash_movements_delete_own" ON public.cash_movements;
CREATE POLICY "cash_movements_delete_own" ON public.cash_movements
  FOR DELETE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );

-- Note: finalize_pos_sale RPC is NOT reverted here because the rollback is
-- a structural rollback. If you need the pre-F10 RPC, run the original
-- 20260715_finalize_pos_sale_fee_interest_fix.sql migration again.

COMMIT;
