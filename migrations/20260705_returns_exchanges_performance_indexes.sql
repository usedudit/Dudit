-- Migration: Returns and Exchanges Module Performance Indexes
-- Optimizes queries, eliminates table scans, and prevents deadlock potential under concurrency.

-- 1. Optimize FIFO store credits allocation and customer detail listings
CREATE INDEX IF NOT EXISTS idx_store_credits_customer_partner_status
  ON public.store_credits(customer_id, partner_id, status, created_at ASC);

-- 2. Optimize return items query for returnable quantities calculation
CREATE INDEX IF NOT EXISTS idx_return_requests_order_id_status
  ON public.return_requests(order_id, status, deleted_at)
  WHERE deleted_at IS NULL;

-- 3. Optimize return items mappings
CREATE INDEX IF NOT EXISTS idx_return_items_return_request_id
  ON public.return_items(return_request_id);

CREATE INDEX IF NOT EXISTS idx_return_items_order_item_id
  ON public.return_items(order_item_id);

-- 4. Optimize refund lookups
CREATE INDEX IF NOT EXISTS idx_return_refunds_return_request_id
  ON public.return_refunds(return_request_id);

CREATE INDEX IF NOT EXISTS idx_return_refunds_order_id_status
  ON public.return_refunds(order_id, status);
