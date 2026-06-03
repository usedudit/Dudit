-- Migration: Add missing performance indexes for orders and promotion usages
-- Date: 2026-06-03

-- 1. Index foreign key order_id in order_items to speed up joins and subqueries in My Orders page
CREATE INDEX IF NOT EXISTS idx_order_items_order_id 
  ON public.order_items(order_id);

-- 2. Index promotion_usages on customer_id and promotion_id to speed up limit checks
CREATE INDEX IF NOT EXISTS idx_promotion_usages_customer_promo 
  ON public.promotion_usages(customer_id, promotion_id);
