-- Migration: reserve_order_inventory honors per-item allow_sell_without_stock
-- PDV: when the operator accepts the "sem estoque, continuar mesmo assim" modal,
-- the item carries allow_sell_without_stock=true in the p_items JSON. The SQL
-- validation below must skip the stock check for those lines (matching the
-- app-level validateERPItemsStock behaviour).

BEGIN;

-- 4-param (store) variant - used by the ERP/PDV order flow
CREATE OR REPLACE FUNCTION public.__mvp_unsafe_reserve_order_inventory_store(
  p_partner_id UUID,
  p_order_id UUID,
  p_items JSONB DEFAULT '[]'::JSONB,
  p_store_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_item JSONB;
  v_product_id UUID;
  v_variant_id UUID;
  v_qty INTEGER;
  v_available INTEGER;
  v_allow_sell_without_stock BOOLEAN;
  v_item_bypass BOOLEAN;
BEGIN
  IF COALESCE(jsonb_array_length(p_items), 0) = 0 THEN
    RETURN jsonb_build_object('success', true, 'items_count', 0);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULLIF(v_item->>'product_id', '')::UUID;
    v_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
    v_qty := COALESCE((v_item->>'quantity')::INTEGER, 0);
    v_item_bypass := COALESCE((v_item->>'allow_sell_without_stock')::BOOLEAN, false);

    IF v_product_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    -- Case 1: Variant
    IF v_variant_id IS NOT NULL THEN
      SELECT pv.stock_available, COALESCE(p.allow_sell_without_stock, false)
      INTO v_available, v_allow_sell_without_stock
      FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
      WHERE pv.id = v_variant_id AND pv.product_id = v_product_id AND p.partner_id = p_partner_id
      FOR UPDATE OF pv;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variante não encontrada: %', v_variant_id;
      END IF;

      IF NOT v_allow_sell_without_stock AND NOT v_item_bypass THEN
        IF COALESCE(v_available, 0) < v_qty THEN
          RAISE EXCEPTION 'Estoque insuficiente da variante %', v_variant_id;
        END IF;
      END IF;

      UPDATE public.product_variants
      SET stock_reserved = COALESCE(stock_reserved, 0) + v_qty, updated_at = NOW()
      WHERE id = v_variant_id;

    -- Case 2: Product only
    ELSE
      SELECT stock_available, COALESCE(allow_sell_without_stock, false)
      INTO v_available, v_allow_sell_without_stock
      FROM public.products
      WHERE id = v_product_id AND partner_id = p_partner_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado: %', v_product_id;
      END IF;

      IF NOT v_allow_sell_without_stock AND NOT v_item_bypass THEN
        IF COALESCE(v_available, 0) < v_qty THEN
          RAISE EXCEPTION 'Estoque insuficiente do produto %', v_product_id;
        END IF;
      END IF;

      UPDATE public.products
      SET stock_reserved = COALESCE(stock_reserved, 0) + v_qty, updated_at = NOW()
      WHERE id = v_product_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'items_count', jsonb_array_length(p_items));
END;
$function$;

-- 3-param variant - same per-item honouring
CREATE OR REPLACE FUNCTION public.__mvp_unsafe_reserve_order_inventory(
  p_partner_id UUID,
  p_order_id UUID,
  p_items JSONB DEFAULT '[]'::JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_item JSONB;
  v_product_id UUID;
  v_variant_id UUID;
  v_qty INTEGER;
  v_available INTEGER;
  v_allow_without_stock BOOLEAN;
  v_item_bypass BOOLEAN;
BEGIN
  IF COALESCE(jsonb_array_length(p_items), 0) = 0 THEN
    RETURN jsonb_build_object('success', true, 'items_count', 0);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULLIF(v_item->>'product_id', '')::UUID;
    v_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
    v_qty := COALESCE((v_item->>'quantity')::INTEGER, 0);
    v_item_bypass := COALESCE((v_item->>'allow_sell_without_stock')::BOOLEAN, false);

    IF v_product_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    IF v_variant_id IS NOT NULL THEN
      SELECT pv.stock_available, COALESCE(p.allow_sell_without_stock, false)
      INTO v_available, v_allow_without_stock
      FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
      WHERE pv.id = v_variant_id
        AND pv.product_id = v_product_id
        AND p.partner_id = p_partner_id
      FOR UPDATE OF pv, p;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variante não encontrada para reserva: %', v_variant_id;
      END IF;

      IF NOT v_allow_without_stock AND NOT v_item_bypass AND v_available < v_qty THEN
        RAISE EXCEPTION 'Estoque disponível insuficiente para a variante %', v_variant_id;
      END IF;

      UPDATE public.product_variants
      SET
        stock_reserved = stock_reserved + v_qty,
        updated_at = NOW()
      WHERE id = v_variant_id;
    ELSE
      SELECT stock_available, COALESCE(allow_sell_without_stock, false)
      INTO v_available, v_allow_without_stock
      FROM public.products
      WHERE id = v_product_id
        AND partner_id = p_partner_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado para reserva: %', v_product_id;
      END IF;

      IF NOT v_allow_without_stock AND NOT v_item_bypass AND v_available < v_qty THEN
        RAISE EXCEPTION 'Estoque disponível insuficiente para o produto %', v_product_id;
      END IF;

      UPDATE public.products
      SET
        stock_reserved = stock_reserved + v_qty,
        updated_at = NOW()
      WHERE id = v_product_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'items_count', jsonb_array_length(p_items)
  );
END;
$function$;

COMMIT;
