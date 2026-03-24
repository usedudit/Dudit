-- ============================================================================
-- Migration: 961_security_fix_checkout_stock.sql
-- Security audit remediation: MED-04 - Upgrade atomic stock decrement to support variants
-- ============================================================================

CREATE OR REPLACE FUNCTION public.decrement_stock_atomic(
  p_product_id UUID,
  p_quantity INTEGER,
  p_variant_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rows_affected INTEGER;
BEGIN
  IF p_variant_id IS NOT NULL THEN
    -- Try to decrement variant stock
    UPDATE product_variants
    SET stock_quantity = stock_quantity - p_quantity,
        updated_at = NOW()
    WHERE id = p_variant_id
      AND product_id = p_product_id
      AND stock_quantity >= p_quantity
      AND is_active = TRUE;
      
    GET DIAGNOSTICS rows_affected = ROW_COUNT;
  ELSE
    -- Try to decrement parent product stock
    UPDATE products
    SET stock_quantity = stock_quantity - p_quantity,
        updated_at = NOW()
    WHERE id = p_product_id
      AND stock_quantity >= p_quantity
      AND is_active = TRUE;
      
    GET DIAGNOSTICS rows_affected = ROW_COUNT;
  END IF;

  RETURN rows_affected > 0;
END;
$$;
