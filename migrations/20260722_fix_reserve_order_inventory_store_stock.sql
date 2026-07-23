-- Migration: Complete Stock RPCs Simplification (No Store Overrides)
-- Updates reserve_order_inventory, finalize_order_inventory, release_order_inventory, create_batch_stock_movement
-- Operates directly on products and product_variants tables, removing reliance on store_products/store_product_variants overrides and respecting allow_sell_without_stock

BEGIN;

-- ============================================================
-- 1. reserve_order_inventory (4-param)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reserve_order_inventory(
  p_partner_id UUID,
  p_order_id UUID,
  p_items JSONB DEFAULT '[]'::JSONB,
  p_store_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_item JSONB;
  v_product_id UUID;
  v_variant_id UUID;
  v_qty INTEGER;
  v_available INTEGER;
  v_allow_sell_without_stock BOOLEAN;
BEGIN
  IF COALESCE(jsonb_array_length(p_items), 0) = 0 THEN
    RETURN jsonb_build_object('success', true, 'items_count', 0);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULLIF(v_item->>'product_id', '')::UUID;
    v_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
    v_qty := COALESCE((v_item->>'quantity')::INTEGER, 0);

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

      IF NOT v_allow_sell_without_stock THEN
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

      IF NOT v_allow_sell_without_stock THEN
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
$$;

-- reserve_order_inventory (3-param overload)
CREATE OR REPLACE FUNCTION public.reserve_order_inventory(
  p_partner_id UUID,
  p_order_id UUID,
  p_store_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_order RECORD;
  v_item JSONB;
  v_product_id UUID;
  v_variant_id UUID;
  v_qty INT;
  v_available INT;
  v_allow_sell_without_stock BOOLEAN;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id AND partner_id = p_partner_id AND status NOT IN ('cancelled', 'returned', 'delivered')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado ou já finalizado.';
  END IF;

  IF v_order.items IS NULL OR jsonb_array_length(v_order.items) = 0 THEN
    RAISE EXCEPTION 'Nenhum item no pedido.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_order.items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
    v_qty := COALESCE((v_item->>'quantity')::INT, 0);

    IF v_qty <= 0 THEN CONTINUE; END IF;

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

      IF NOT v_allow_sell_without_stock THEN
        IF COALESCE(v_available, 0) < v_qty THEN
          RAISE EXCEPTION 'Estoque insuficiente da variante %', v_variant_id;
        END IF;
      END IF;

      UPDATE public.product_variants
      SET stock_reserved = COALESCE(stock_reserved, 0) + v_qty, updated_at = NOW()
      WHERE id = v_variant_id;
    ELSE
      SELECT stock_available, COALESCE(allow_sell_without_stock, false)
      INTO v_available, v_allow_sell_without_stock
      FROM public.products
      WHERE id = v_product_id AND partner_id = p_partner_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado: %', v_product_id;
      END IF;

      IF NOT v_allow_sell_without_stock THEN
        IF COALESCE(v_available, 0) < v_qty THEN
          RAISE EXCEPTION 'Estoque insuficiente do produto %', v_product_id;
        END IF;
      END IF;

      UPDATE public.products
      SET stock_reserved = COALESCE(stock_reserved, 0) + v_qty, updated_at = NOW()
      WHERE id = v_product_id;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================
-- 2. finalize_order_inventory (7-param)
-- ============================================================
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
SET search_path = 'public'
AS $$
DECLARE
  v_item JSONB;
  v_product_id UUID;
  v_variant_id UUID;
  v_qty INTEGER;
  v_reserved INTEGER;
  v_allow_sell_without_stock BOOLEAN;
  v_movement JSONB;
  v_movement_id UUID;
BEGIN
  IF COALESCE(jsonb_array_length(p_items), 0) = 0 THEN
    RETURN jsonb_build_object('success', true, 'items_count', 0);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULLIF(v_item->>'product_id', '')::UUID;
    v_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
    v_qty := COALESCE((v_item->>'quantity')::INTEGER, 0);

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

      IF NOT v_allow_sell_without_stock THEN
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

      IF NOT v_allow_sell_without_stock THEN
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

  RETURN jsonb_build_object('success', true, 'items_count', jsonb_array_length(p_items), 'movement_id', v_movement_id);
END;
$$;

-- ============================================================
-- 3. release_order_inventory (4-param)
-- ============================================================
CREATE OR REPLACE FUNCTION public.release_order_inventory(
  p_partner_id UUID,
  p_order_id UUID,
  p_items JSONB DEFAULT '[]'::JSONB,
  p_store_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_item JSONB;
  v_product_id UUID;
  v_variant_id UUID;
  v_qty INTEGER;
BEGIN
  IF COALESCE(jsonb_array_length(p_items), 0) = 0 THEN
    RETURN jsonb_build_object('success', true, 'items_count', 0);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULLIF(v_item->>'product_id', '')::UUID;
    v_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
    v_qty := COALESCE((v_item->>'quantity')::INTEGER, 0);

    IF v_product_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    IF v_variant_id IS NOT NULL THEN
      UPDATE public.product_variants
      SET stock_reserved = GREATEST(0, COALESCE(stock_reserved, 0) - v_qty), updated_at = NOW()
      WHERE id = v_variant_id;
    ELSE
      UPDATE public.products
      SET stock_reserved = GREATEST(0, COALESCE(stock_reserved, 0) - v_qty), updated_at = NOW()
      WHERE id = v_product_id AND partner_id = p_partner_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'items_count', jsonb_array_length(p_items));
END;
$$;

-- release_order_inventory (3-param overload)
CREATE OR REPLACE FUNCTION public.release_order_inventory(
  p_partner_id UUID,
  p_order_id UUID,
  p_store_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_order RECORD;
  v_item JSONB;
  v_product_id UUID;
  v_variant_id UUID;
  v_qty INT;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id AND partner_id = p_partner_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;
  IF v_order.items IS NULL OR jsonb_array_length(v_order.items) = 0 THEN RETURN; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_order.items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
    v_qty := COALESCE((v_item->>'quantity')::INT, 0);

    IF v_qty <= 0 THEN CONTINUE; END IF;

    IF v_variant_id IS NOT NULL THEN
      UPDATE public.product_variants
      SET stock_reserved = GREATEST(0, COALESCE(stock_reserved, 0) - v_qty), updated_at = NOW()
      WHERE id = v_variant_id;
    ELSE
      UPDATE public.products
      SET stock_reserved = GREATEST(0, COALESCE(stock_reserved, 0) - v_qty), updated_at = NOW()
      WHERE id = v_product_id AND partner_id = p_partner_id;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================
-- 4. create_batch_stock_movement
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_batch_stock_movement(
    p_partner_id UUID,
    p_movement_type TEXT,
    p_reason TEXT,
    p_notes TEXT,
    p_created_by UUID DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::JSONB,
    p_store_id UUID DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
    v_movement_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_variant_id UUID;
    v_qty INT;
    v_previous_stock INT;
    v_new_stock INT;
    v_items_count INT;
BEGIN
    v_items_count := COALESCE(jsonb_array_length(p_items), 0);

    IF v_items_count = 0 THEN
        RAISE EXCEPTION 'Nenhum item fornecido';
    END IF;

    INSERT INTO public.stock_movements (
        partner_id, movement_type, reason, notes, created_by, store_id, created_at
    ) VALUES (
        p_partner_id, p_movement_type, p_reason, p_notes, p_created_by, p_store_id, NOW()
    )
    RETURNING id INTO v_movement_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := NULLIF(v_item->>'product_id', '')::UUID;
        v_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
        v_qty := COALESCE((v_item->>'quantity')::INT, 0);

        IF v_product_id IS NULL OR v_qty <= 0 THEN
            CONTINUE;
        END IF;

        -- Variant
        IF v_variant_id IS NOT NULL THEN
            SELECT stock_quantity INTO v_previous_stock
            FROM public.product_variants
            WHERE id = v_variant_id AND product_id = v_product_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Variante não encontrada: %', v_variant_id;
            END IF;

            IF p_movement_type = 'in' THEN
                v_new_stock := v_previous_stock + v_qty;
            ELSE
                v_new_stock := GREATEST(0, v_previous_stock - v_qty);
            END IF;

            UPDATE public.product_variants
            SET stock_quantity = v_new_stock, updated_at = NOW()
            WHERE id = v_variant_id;

        -- Product only
        ELSE
            SELECT stock_quantity INTO v_previous_stock
            FROM public.products
            WHERE id = v_product_id AND partner_id = p_partner_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Produto não encontrado: %', v_product_id;
            END IF;

            IF p_movement_type = 'in' THEN
                v_new_stock := v_previous_stock + v_qty;
            ELSE
                v_new_stock := GREATEST(0, v_previous_stock - v_qty);
            END IF;

            UPDATE public.products
            SET stock_quantity = v_new_stock, updated_at = NOW()
            WHERE id = v_product_id;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'id', v_movement_id,
        'success', true,
        'items_count', v_items_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

COMMIT;
