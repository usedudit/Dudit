-- Migration: finalize_order_inventory honors per-item allow_sell_without_stock
-- PDV: when the operator accepts the "Estoque insuficiente ... continuar mesmo assim?"
-- modal (or when the global sales setting "permitir venda com estoque zerado" is on),
-- the item carries allow_sell_without_stock=true in the p_items JSON and the reserve
-- RPC already skips the stock check for those lines (20260811). The finalize RPC did
-- not, raising "Reserva insuficiente para finalizar o produto %" and blocking the sale
-- even though everything was permitted in Sales Settings.
-- Mirrors the app-level validateERPItemsStock behaviour and the reserve RPC bypass.

BEGIN;

-- 7-param (with p_notes) variant - used by the ERP/PDV order flow
CREATE OR REPLACE FUNCTION public.finalize_order_inventory(
  p_partner_id UUID,
  p_order_id UUID,
  p_created_by UUID,
  p_reason TEXT,
  p_notes TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::JSONB,
  p_store_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_item JSONB;
  v_product_id UUID;
  v_variant_id UUID;
  v_qty INTEGER;
  v_reserved INTEGER;
  v_allow_sell_without_stock BOOLEAN;
  v_item_bypass BOOLEAN;
  v_movement JSONB;
  v_movement_id UUID;
  v_order_number TEXT;
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
      SELECT pv.stock_reserved, COALESCE(p.allow_sell_without_stock, false)
      INTO v_reserved, v_allow_sell_without_stock
      FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
      WHERE pv.id = v_variant_id
        AND pv.product_id = v_product_id
        AND p.partner_id = p_partner_id
      FOR UPDATE OF pv;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variante não encontrada para finalizar estoque: %', v_variant_id;
      END IF;

      IF NOT v_allow_sell_without_stock AND NOT v_item_bypass THEN
        IF COALESCE(v_reserved, 0) < v_qty THEN
          RAISE EXCEPTION 'Reserva insuficiente para finalizar a variante %', v_variant_id;
        END IF;
      END IF;

      UPDATE public.product_variants
      SET stock_reserved = GREATEST(0, COALESCE(stock_reserved, 0) - v_qty), updated_at = NOW()
      WHERE id = v_variant_id;

    -- Case 2: Product only
    ELSE
      SELECT stock_reserved, COALESCE(allow_sell_without_stock, false)
      INTO v_reserved, v_allow_sell_without_stock
      FROM public.products
      WHERE id = v_product_id AND partner_id = p_partner_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado para finalizar estoque: %', v_product_id;
      END IF;

      IF NOT v_allow_sell_without_stock AND NOT v_item_bypass THEN
        IF COALESCE(v_reserved, 0) < v_qty THEN
          RAISE EXCEPTION 'Reserva insuficiente para finalizar o produto %', v_product_id;
        END IF;
      END IF;

      UPDATE public.products
      SET stock_reserved = GREATEST(0, COALESCE(stock_reserved, 0) - v_qty), updated_at = NOW()
      WHERE id = v_product_id;
    END IF;
  END LOOP;

  -- Create batch stock movement to record stock reduction
  v_movement := public.create_batch_stock_movement(
    p_partner_id := p_partner_id,
    p_movement_type := 'out',
    p_reason := p_reason,
    p_notes := p_notes,
    p_created_by := p_created_by,
    p_items := p_items,
    p_store_id := p_store_id
  );

  v_movement_id := (v_movement->>'id')::UUID;

  IF v_movement_id IS NOT NULL THEN
    SELECT order_number INTO v_order_number
    FROM public.orders
    WHERE id = p_order_id;

    UPDATE public.stock_movements
    SET
      order_id = p_order_id,
      reference_name = 'Pedido #' || COALESCE(v_order_number, p_order_id::TEXT)
    WHERE id = v_movement_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'items_count', jsonb_array_length(p_items), 'movement_id', v_movement_id);
END;
$$;

-- 6-param variant (f109) - same per-item honouring
CREATE OR REPLACE FUNCTION public.finalize_order_inventory(
  p_partner_id UUID,
  p_order_id UUID,
  p_created_by UUID DEFAULT NULL,
  p_reason TEXT DEFAULT 'Venda de Produtos',
  p_items JSONB DEFAULT '[]'::JSONB,
  p_store_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_item JSONB;
  v_product_id UUID;
  v_variant_id UUID;
  v_qty INTEGER;
  v_reserved INTEGER;
  v_allow_sell_without_stock BOOLEAN;
  v_item_bypass BOOLEAN;
  v_movement JSON;
  v_movement_id UUID;
  v_order_number TEXT;
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
      SELECT stock_reserved, COALESCE(allow_sell_without_stock, false)
      INTO v_reserved, v_allow_sell_without_stock
      FROM public.product_variants
      WHERE id = v_variant_id AND product_id = v_product_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variante não encontrada para finalizar estoque: %', v_variant_id;
      END IF;

      IF NOT v_allow_sell_without_stock AND NOT v_item_bypass THEN
        IF COALESCE(v_reserved, 0) < v_qty THEN
          RAISE EXCEPTION 'Reserva insuficiente para finalizar a variante %', v_variant_id;
        END IF;
      END IF;

      UPDATE public.product_variants
      SET stock_reserved = GREATEST(0, COALESCE(stock_reserved, 0) - v_qty), updated_at = NOW()
      WHERE id = v_variant_id;

    ELSE
      SELECT stock_reserved, COALESCE(allow_sell_without_stock, false)
      INTO v_reserved, v_allow_sell_without_stock
      FROM public.products
      WHERE id = v_product_id AND partner_id = p_partner_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado para finalizar estoque: %', v_product_id;
      END IF;

      IF NOT v_allow_sell_without_stock AND NOT v_item_bypass THEN
        IF COALESCE(v_reserved, 0) < v_qty THEN
          RAISE EXCEPTION 'Reserva insuficiente para finalizar o produto %', v_product_id;
        END IF;
      END IF;

      UPDATE public.products
      SET stock_reserved = GREATEST(0, COALESCE(stock_reserved, 0) - v_qty), updated_at = NOW()
      WHERE id = v_product_id;
    END IF;
  END LOOP;

  v_movement := public.create_batch_stock_movement(
    p_partner_id := p_partner_id,
    p_movement_type := 'out',
    p_reason := p_reason,
    p_notes := NULL,
    p_created_by := p_created_by,
    p_items := p_items,
    p_store_id := p_store_id
  );

  v_movement_id := (v_movement->>'id')::UUID;

  IF v_movement_id IS NOT NULL THEN
    SELECT order_number INTO v_order_number
    FROM public.orders
    WHERE id = p_order_id;

    UPDATE public.stock_movements
    SET
      order_id = p_order_id,
      reference_name = 'Pedido #' || COALESCE(v_order_number, p_order_id::TEXT)
    WHERE id = v_movement_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'items_count', jsonb_array_length(p_items), 'movement_id', v_movement_id);
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
