-- ============================================================================
-- F21: Simplify stock RPCs - remove Branch 1/3 (store_product_variants /
-- store_products).  Com store_id direto nas tabelas base, o estoque vive
-- exclusivamente em products.stock_quantity / product_variants.stock_quantity.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. create_batch_stock_movement
-- ============================================================================
DROP FUNCTION IF EXISTS public.create_batch_stock_movement(
  p_partner_id UUID,
  p_movement_type TEXT,
  p_reason TEXT,
  p_notes TEXT,
  p_created_by UUID,
  p_items JSONB,
  p_store_id UUID
);

DROP FUNCTION IF EXISTS public.create_batch_stock_movement(
  p_partner_id UUID,
  p_movement_type TEXT,
  p_reason TEXT,
  p_notes TEXT,
  p_created_by UUID,
  p_items JSONB
);

CREATE OR REPLACE FUNCTION public.create_batch_stock_movement(
    p_partner_id UUID,
    p_movement_type TEXT,
    p_reason TEXT,
    p_notes TEXT,
    p_created_by UUID DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::JSONB,
    p_store_id UUID DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_movement_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_variant_id UUID;
    v_qty INT;
    v_previous_stock INT;
    v_new_stock INT;
    v_total_quantity INT := 0;
    v_result JSON;
    v_items_count INT;
BEGIN
    v_items_count := jsonb_array_length(p_items);

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
        v_product_id := (v_item->>'product_id')::UUID;
        v_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
        v_qty := (v_item->>'quantity')::INT;

        IF v_qty <= 0 THEN
            RAISE EXCEPTION 'Quantidade deve ser maior que zero para cada item';
        END IF;

        IF v_variant_id IS NOT NULL THEN
            SELECT COALESCE(stock_quantity, 0) INTO v_previous_stock
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
        ELSE
            SELECT COALESCE(stock_quantity, 0) INTO v_previous_stock
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

        INSERT INTO public.stock_movement_items (
            movement_id, product_id, variant_id, quantity,
            previous_quantity, new_quantity, created_at
        ) VALUES (
            v_movement_id,
            v_product_id,
            v_variant_id,
            CASE WHEN p_movement_type = 'in' THEN v_qty ELSE -v_qty END,
            v_previous_stock,
            v_new_stock,
            NOW()
        );

        v_total_quantity := v_total_quantity + v_qty;
    END LOOP;

    SELECT json_build_object(
        'id', v_movement_id,
        'items_count', v_items_count,
        'total_quantity', v_total_quantity
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- ============================================================================
-- 2. reserve_order_inventory
-- ============================================================================
DROP FUNCTION IF EXISTS public.reserve_order_inventory(
  p_partner_id UUID,
  p_order_id UUID,
  p_store_id UUID
);

DROP FUNCTION IF EXISTS public.reserve_order_inventory(
  p_partner_id UUID,
  p_order_id UUID
);

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
      UPDATE public.product_variants
      SET stock_reserved = COALESCE(stock_reserved, 0) + v_qty, updated_at = NOW()
      WHERE id = v_variant_id AND product_id = v_product_id;
    ELSE
      UPDATE public.products
      SET stock_reserved = COALESCE(stock_reserved, 0) + v_qty, updated_at = NOW()
      WHERE id = v_product_id AND partner_id = p_partner_id;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================================
-- 3. release_order_inventory
-- ============================================================================
DROP FUNCTION IF EXISTS public.release_order_inventory(
  p_partner_id UUID,
  p_order_id UUID,
  p_store_id UUID
);

DROP FUNCTION IF EXISTS public.release_order_inventory(
  p_partner_id UUID,
  p_order_id UUID
);

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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
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
      UPDATE public.product_variants
      SET stock_reserved = GREATEST(0, COALESCE(stock_reserved, 0) - v_qty), updated_at = NOW()
      WHERE id = v_variant_id AND product_id = v_product_id;
    ELSE
      UPDATE public.products
      SET stock_reserved = GREATEST(0, COALESCE(stock_reserved, 0) - v_qty), updated_at = NOW()
      WHERE id = v_product_id AND partner_id = p_partner_id;
    END IF;
  END LOOP;
END;
$$;

-- Force reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
