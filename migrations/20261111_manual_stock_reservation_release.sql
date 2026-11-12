-- ============================================================================
-- Migration: Manual Stock Reservation Release Support
--
-- Adds support for releasing reserved stock directly on products and variants.
-- Automatically recalculates stock_available via existing triggers:
--   - sync_products_stock_availability
--   - sync_product_variants_stock_availability
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.release_product_reserved_stock(
  p_partner_id UUID,
  p_product_id UUID,
  p_variant_id UUID DEFAULT NULL,
  p_quantity INT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_reserved INT;
  v_qty_to_release INT;
  v_new_reserved INT;
  v_current_stock INT;
  v_new_available INT;
BEGIN
  IF p_partner_id IS NULL OR p_product_id IS NULL THEN
    RAISE EXCEPTION 'Parâmetros inválidos' USING ERRCODE = '22004';
  END IF;

  IF p_variant_id IS NOT NULL THEN
    SELECT v.stock_reserved, v.stock_quantity
      INTO v_current_reserved, v_current_stock
    FROM public.product_variants v
    JOIN public.products p ON p.id = v.product_id
    WHERE v.id = p_variant_id
      AND v.product_id = p_product_id
      AND p.partner_id = p_partner_id
    FOR UPDATE OF v;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Variação não encontrada ou não pertence ao parceiro' USING ERRCODE = '42501';
    END IF;

    v_current_reserved := GREATEST(0, COALESCE(v_current_reserved, 0));
    IF v_current_reserved = 0 THEN
      RAISE EXCEPTION 'Variação não possui estoque reservado' USING ERRCODE = '22023';
    END IF;

    v_qty_to_release := CASE
      WHEN p_quantity IS NOT NULL AND p_quantity > 0 THEN LEAST(p_quantity, v_current_reserved)
      ELSE v_current_reserved
    END;

    v_new_reserved := GREATEST(0, v_current_reserved - v_qty_to_release);
    v_new_available := GREATEST(0, COALESCE(v_current_stock, 0) - v_new_reserved);

    UPDATE public.product_variants
    SET stock_reserved = v_new_reserved,
        updated_at = NOW()
    WHERE id = p_variant_id AND product_id = p_product_id;

  ELSE
    SELECT p.stock_reserved, p.stock_quantity
      INTO v_current_reserved, v_current_stock
    FROM public.products p
    WHERE p.id = p_product_id
      AND p.partner_id = p_partner_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto não encontrado ou não pertence ao parceiro' USING ERRCODE = '42501';
    END IF;

    v_current_reserved := GREATEST(0, COALESCE(v_current_reserved, 0));
    IF v_current_reserved = 0 THEN
      RAISE EXCEPTION 'Produto não possui estoque reservado' USING ERRCODE = '22023';
    END IF;

    v_qty_to_release := CASE
      WHEN p_quantity IS NOT NULL AND p_quantity > 0 THEN LEAST(p_quantity, v_current_reserved)
      ELSE v_current_reserved
    END;

    v_new_reserved := GREATEST(0, v_current_reserved - v_qty_to_release);
    v_new_available := GREATEST(0, COALESCE(v_current_stock, 0) - v_new_reserved);

    UPDATE public.products
    SET stock_reserved = v_new_reserved,
        updated_at = NOW()
    WHERE id = p_product_id AND partner_id = p_partner_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'released_quantity', v_qty_to_release,
    'stock_quantity', v_current_stock,
    'stock_reserved', v_new_reserved,
    'stock_available', v_new_available
  );
END;
$$;

REVOKE ALL ON FUNCTION public.release_product_reserved_stock(UUID, UUID, UUID, INT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_product_reserved_stock(UUID, UUID, UUID, INT)
  TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
