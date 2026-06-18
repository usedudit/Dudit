-- ============================================================================
-- MIGRATION: Add purchase tracking fields to product_suppliers
-- Description: Adds last_purchase_price, last_purchase_date, last_invoice_key
-- to track the most recent purchase from NF-e imports.
-- ============================================================================

ALTER TABLE public.product_suppliers
  ADD COLUMN IF NOT EXISTS last_purchase_price NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS last_purchase_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_invoice_key TEXT;

-- Index for querying by last purchase date
CREATE INDEX IF NOT EXISTS idx_product_suppliers_last_purchase_date
  ON public.product_suppliers(last_purchase_date DESC NULLS LAST)
  WHERE last_purchase_date IS NOT NULL;
