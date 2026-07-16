-- ============================================================================
-- Fase 7 - Rollback: Store-Aware Stock Management
-- ============================================================================
BEGIN;

DROP FUNCTION IF EXISTS public.get_store_product_stock(UUID, UUID);

DROP FUNCTION IF EXISTS public.decrement_store_product_stock(UUID, INTEGER, BOOLEAN);

DROP FUNCTION IF EXISTS public.increment_store_product_stock(UUID, INTEGER);

DROP FUNCTION IF EXISTS public.transfer_store_stock(UUID, UUID, INTEGER, UUID, UUID, TEXT);

ALTER TABLE public.stock_movement_items DROP COLUMN IF EXISTS store_product_id;

ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;

ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_movement_type_check
  CHECK (movement_type IN ('sale', 'return', 'adjustment', 'purchase', 'damage', 'loss', 'in', 'out'));

-- Restore reserve_order_inventory (pre-Fase7 version from 20260409_add_stock_reservation_flow.sql)
CREATE OR REPLACE FUNCTION public.reserve_order_inventory(
  p_partner_id UUID,
  p_order_id UUID,
  p_items JSONB DEFAULT '[]'::JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item JSONB;
  v_product_id UUID;
  v_variant_id UUID;
  v_qty INTEGER;
  v_available INTEGER;
  v_allow_without_stock BOOLEAN;
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

      IF NOT v_allow_without_stock AND v_available < v_qty THEN
        RAISE EXCEPTION 'Estoque disponível insuficiente para a variante %', v_variant_id;
      END IF;

      UPDATE public.product_variants
      SET stock_reserved = stock_reserved + v_qty, updated_at = NOW()
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

      IF NOT v_allow_without_stock AND v_available < v_qty THEN
        RAISE EXCEPTION 'Estoque disponível insuficiente para o produto %', v_product_id;
      END IF;

      UPDATE public.products
      SET stock_reserved = stock_reserved + v_qty, updated_at = NOW()
      WHERE id = v_product_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'items_count', jsonb_array_length(p_items)
  );
END;
$$;

-- Restore release_order_inventory (pre-Fase7 version from 20260409_add_stock_reservation_flow.sql)
CREATE OR REPLACE FUNCTION public.release_order_inventory(
  p_partner_id UUID,
  p_order_id UUID,
  p_items JSONB DEFAULT '[]'::JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item JSONB;
  v_product_id UUID;
  v_variant_id UUID;
  v_qty INTEGER;
  v_reserved INTEGER;
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
      SELECT pv.stock_reserved
      INTO v_reserved
      FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
      WHERE pv.id = v_variant_id
        AND pv.product_id = v_product_id
        AND p.partner_id = p_partner_id
      FOR UPDATE OF pv, p;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variante não encontrada para liberar reserva: %', v_variant_id;
      END IF;

      IF v_reserved < v_qty THEN
        RAISE EXCEPTION 'Reserva insuficiente para a variante %', v_variant_id;
      END IF;

      UPDATE public.product_variants
      SET stock_reserved = stock_reserved - v_qty, updated_at = NOW()
      WHERE id = v_variant_id;
    ELSE
      SELECT stock_reserved
      INTO v_reserved
      FROM public.products
      WHERE id = v_product_id
        AND partner_id = p_partner_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado para liberar reserva: %', v_product_id;
      END IF;

      IF v_reserved < v_qty THEN
        RAISE EXCEPTION 'Reserva insuficiente para o produto %', v_product_id;
      END IF;

      UPDATE public.products
      SET stock_reserved = stock_reserved - v_qty, updated_at = NOW()
      WHERE id = v_product_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'items_count', jsonb_array_length(p_items)
  );
END;
$$;

-- Drop store_products stock_reserved/stock_availability fields
DROP TRIGGER IF EXISTS sync_store_products_stock_availability ON public.store_products;
DROP FUNCTION IF EXISTS public.sync_store_products_stock_availability();

ALTER TABLE public.store_products
  DROP CONSTRAINT IF EXISTS store_products_stock_reserved_non_negative;

ALTER TABLE public.store_products
  DROP COLUMN IF EXISTS stock_reserved,
  DROP COLUMN IF EXISTS stock_available;

-- Restore create_batch_stock_movement to pre-Fase7 version (from 061_migrate_stock_movements.sql)
CREATE OR REPLACE FUNCTION public.create_batch_stock_movement(
    p_partner_id UUID,
    p_movement_type TEXT,
    p_reason TEXT,
    p_notes TEXT,
    p_created_by UUID DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::JSONB
) RETURNS JSON AS $$
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
        partner_id,
        movement_type,
        reason,
        notes,
        created_by,
        created_at
    ) VALUES (
        p_partner_id,
        p_movement_type,
        p_reason,
        p_notes,
        p_created_by,
        NOW()
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
            SELECT stock_quantity INTO v_previous_stock
            FROM product_variants
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

            UPDATE product_variants
            SET stock_quantity = v_new_stock, updated_at = NOW()
            WHERE id = v_variant_id;

        ELSE
            SELECT stock_quantity INTO v_previous_stock
            FROM products
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

            UPDATE products
            SET stock_quantity = v_new_stock, updated_at = NOW()
            WHERE id = v_product_id;
        END IF;

        INSERT INTO public.stock_movement_items (
            movement_id,
            product_id,
            variant_id,
            quantity,
            previous_quantity,
            new_quantity,
            created_at
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Restore handle_order_payment_stock (pre-Fase7 version from 20260408_fix_order_payment_stock_trigger.sql)
CREATE OR REPLACE FUNCTION public.handle_order_payment_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_items jsonb;
BEGIN
  IF new.situation = 'paid' AND coalesce(old.situation, '') <> 'paid' THEN
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'product_id', oi.product_id,
          'variant_id', null,
          'quantity', oi.quantity
        )
      ),
      '[]'::jsonb
    )
    INTO v_items
    FROM public.order_items oi
    WHERE oi.order_id = new.id
      AND oi.product_id is not null;

    IF jsonb_array_length(v_items) > 0 THEN
      perform public.create_batch_stock_movement(
        new.partner_id,
        'out',
        'Venda confirmada',
        'Baixa automática do pedido ' || coalesce(new.order_number, new.id::text),
        new.created_by,
        v_items
      );
    END IF;
  END IF;

  RETURN new;
END;
$$;

-- Restore finalize_order_inventory (pre-Fase7 version from 20260409_add_stock_reservation_flow.sql)
CREATE OR REPLACE FUNCTION public.finalize_order_inventory(
  p_partner_id UUID,
  p_order_id UUID,
  p_created_by UUID,
  p_reason TEXT,
  p_notes TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item JSONB;
  v_product_id UUID;
  v_variant_id UUID;
  v_qty INTEGER;
  v_reserved INTEGER;
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

    IF v_variant_id IS NOT NULL THEN
      SELECT pv.stock_reserved
      INTO v_reserved
      FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
      WHERE pv.id = v_variant_id
        AND pv.product_id = v_product_id
        AND p.partner_id = p_partner_id
      FOR UPDATE OF pv, p;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variante não encontrada para finalizar estoque: %', v_variant_id;
      END IF;

      IF v_reserved < v_qty THEN
        RAISE EXCEPTION 'Reserva insuficiente para finalizar a variante %', v_variant_id;
      END IF;

      UPDATE public.product_variants
      SET
        stock_reserved = stock_reserved - v_qty,
        updated_at = NOW()
      WHERE id = v_variant_id;
    ELSE
      SELECT stock_reserved
      INTO v_reserved
      FROM public.products
      WHERE id = v_product_id
        AND partner_id = p_partner_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado para finalizar estoque: %', v_product_id;
      END IF;

      IF v_reserved < v_qty THEN
        RAISE EXCEPTION 'Reserva insuficiente para finalizar o produto %', v_product_id;
      END IF;

      UPDATE public.products
      SET
        stock_reserved = stock_reserved - v_qty,
        updated_at = NOW()
      WHERE id = v_product_id;
    END IF;
  END LOOP;

  v_movement := public.create_batch_stock_movement(
    p_partner_id,
    'out',
    p_reason,
    p_notes,
    p_created_by,
    p_items
  )::JSONB;

  v_movement_id := NULLIF(v_movement->>'id', '')::UUID;

  IF v_movement_id IS NOT NULL THEN
    UPDATE public.stock_movements
    SET
      order_id = p_order_id,
      reference_name = 'Pedido: ' || p_order_id::TEXT
    WHERE id = v_movement_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'movement_id', v_movement_id,
    'items_count', jsonb_array_length(p_items)
  );
END;
$$;

COMMIT;
