-- ============================================================================
-- Fase 7 - Store-Aware Stock Management
-- ============================================================================
--
-- Changes:
-- 1. Add store_product_id to stock_movement_items
-- 2. Add 'transfer' movement type
-- 3. Create RPCs for store-specific stock operations
-- 4. Update create_batch_stock_movement to accept p_store_id
-- 5. Update order_payment_stock_trigger to pass store_id from the order
-- ============================================================================

BEGIN;

-- ============================================================
-- 1. Add store_product_id to stock_movement_items
-- ============================================================
ALTER TABLE public.stock_movement_items
  ADD COLUMN IF NOT EXISTS store_product_id UUID REFERENCES public.store_products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_smi_store_product_id ON public.stock_movement_items(store_product_id);

-- ============================================================
-- 2. Add 'transfer' to stock_movements movement_type CHECK
-- ============================================================
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;

ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_movement_type_check
  CHECK (movement_type IN ('sale', 'return', 'adjustment', 'purchase', 'damage', 'loss', 'in', 'out', 'transfer'));

-- ============================================================
-- 3. RPC: get_store_product_stock
-- Returns the effective stock for a product in a store
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_store_product_stock(
  p_product_id UUID,
  p_store_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_store_product_id UUID;
  v_override_stock INTEGER;
  v_base_stock INTEGER;
BEGIN
  SELECT sp.id, sp.override_stock_quantity
  INTO v_store_product_id, v_override_stock
  FROM public.store_products sp
  WHERE sp.product_id = p_product_id AND sp.store_id = p_store_id;

  IF NOT FOUND THEN
    -- No store override, return base product stock
    SELECT COALESCE(stock_quantity, 0) INTO v_base_stock
    FROM public.products WHERE id = p_product_id;

    RETURN jsonb_build_object(
      'store_product_id', null,
      'has_override', false,
      'effective_stock', v_base_stock,
      'source', 'base_product'
    );
  END IF;

  IF v_override_stock IS NOT NULL THEN
    RETURN jsonb_build_object(
      'store_product_id', v_store_product_id,
      'has_override', true,
      'effective_stock', v_override_stock,
      'source', 'store_override'
    );
  ELSE
    SELECT COALESCE(stock_quantity, 0) INTO v_base_stock
    FROM public.products WHERE id = p_product_id;

    RETURN jsonb_build_object(
      'store_product_id', v_store_product_id,
      'has_override', true,
      'effective_stock', v_base_stock,
      'source', 'base_product_fallback'
    );
  END IF;
END;
$$;

-- ============================================================
-- 4. RPC: decrement_store_product_stock
-- ============================================================
CREATE OR REPLACE FUNCTION public.decrement_store_product_stock(
  p_store_product_id UUID,
  p_quantity INTEGER,
  p_allow_negative BOOLEAN DEFAULT false
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current INTEGER;
  v_new INTEGER;
  v_product_id UUID;
BEGIN
  SELECT override_stock_quantity, product_id INTO v_current, v_product_id
  FROM public.store_products
  WHERE id = p_store_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Store product não encontrado');
  END IF;

  IF v_current IS NULL THEN
    SELECT stock_quantity INTO v_current
    FROM public.products
    WHERE id = v_product_id;
  END IF;

  v_current := COALESCE(v_current, 0);

  IF NOT p_allow_negative AND v_current < p_quantity THEN
    RETURN jsonb_build_object('success', false, 'error', 'Estoque insuficiente');
  END IF;

  v_new := v_current - p_quantity;

  UPDATE public.store_products
  SET override_stock_quantity = v_new, updated_at = NOW()
  WHERE id = p_store_product_id;

  RETURN jsonb_build_object('success', true, 'previous_quantity', v_current, 'new_quantity', v_new);
END;
$$;

-- ============================================================
-- 5. RPC: increment_store_product_stock
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_store_product_stock(
  p_store_product_id UUID,
  p_quantity INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current INTEGER;
  v_new INTEGER;
  v_product_id UUID;
BEGIN
  SELECT override_stock_quantity, product_id INTO v_current, v_product_id
  FROM public.store_products
  WHERE id = p_store_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Store product não encontrado');
  END IF;

  v_current := COALESCE(v_current, 0);
  v_new := v_current + p_quantity;

  UPDATE public.store_products
  SET override_stock_quantity = v_new, updated_at = NOW()
  WHERE id = p_store_product_id;

  RETURN jsonb_build_object('success', true, 'previous_quantity', v_current, 'new_quantity', v_new);
END;
$$;

-- ============================================================
-- 6. RPC: transfer_store_stock
-- ============================================================
CREATE OR REPLACE FUNCTION public.transfer_store_stock(
  p_from_store_product_id UUID,
  p_to_store_product_id UUID,
  p_quantity INTEGER,
  p_partner_id UUID,
  p_created_by UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_from_current INTEGER;
  v_to_current INTEGER;
  v_from_new INTEGER;
  v_to_new INTEGER;
  v_movement_id UUID;
  v_product_id UUID;
  v_from_store_id UUID;
BEGIN
  SELECT sp1.product_id, sp1.override_stock_quantity, sp1.store_id
  INTO v_product_id, v_from_current, v_from_store_id
  FROM public.store_products sp1
  WHERE sp1.id = p_from_store_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Store product de origem não encontrado');
  END IF;

  SELECT override_stock_quantity INTO v_to_current
  FROM public.store_products
  WHERE id = p_to_store_product_id AND product_id = v_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Store product de destino não encontrado ou produto diferente');
  END IF;

  v_from_current := COALESCE(v_from_current, 0);
  v_to_current := COALESCE(v_to_current, 0);

  IF v_from_current < p_quantity THEN
    RETURN jsonb_build_object('success', false, 'error', 'Estoque insuficiente na origem');
  END IF;

  v_from_new := v_from_current - p_quantity;
  v_to_new := v_to_current + p_quantity;

  UPDATE public.store_products
  SET override_stock_quantity = v_from_new, updated_at = NOW()
  WHERE id = p_from_store_product_id;

  UPDATE public.store_products
  SET override_stock_quantity = v_to_new, updated_at = NOW()
  WHERE id = p_to_store_product_id;

  INSERT INTO public.stock_movements (
    partner_id, store_id, movement_type, reason, notes, created_by, created_at
  ) VALUES (
    p_partner_id,
    v_from_store_id,
    'transfer',
    'Transferência entre lojas',
    p_notes,
    p_created_by,
    NOW()
  )
  RETURNING id INTO v_movement_id;

  INSERT INTO public.stock_movement_items (
    movement_id, product_id, quantity, previous_quantity, new_quantity, store_product_id, created_at
  ) VALUES (
    v_movement_id, v_product_id, -p_quantity, v_from_current, v_from_new, p_from_store_product_id, NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'movement_id', v_movement_id,
    'product_id', v_product_id,
    'from_previous', v_from_current,
    'from_new', v_from_new,
    'to_previous', v_to_current,
    'to_new', v_to_new
  );
END;
$$;

-- ============================================================
-- 7. Update create_batch_stock_movement to accept p_store_id
--    When p_store_id is provided, updates store_products.override_stock_quantity
--    instead of products.stock_quantity.
--    Falls back to products.stock_quantity when no store_products link exists.
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
    v_total_quantity INT := 0;
    v_result JSON;
    v_items_count INT;
    v_store_product_id UUID;
    v_store_override_qty INT;
    v_use_store_override BOOLEAN;
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

        v_use_store_override := p_store_id IS NOT NULL AND v_variant_id IS NULL;
        v_store_product_id := NULL;

        IF v_use_store_override THEN
            SELECT sp.id, sp.override_stock_quantity
            INTO v_store_product_id, v_store_override_qty
            FROM public.store_products sp
            WHERE sp.product_id = v_product_id AND sp.store_id = p_store_id;

            IF NOT FOUND THEN
                v_use_store_override := false;
            END IF;
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

        ELSIF v_use_store_override AND v_store_product_id IS NOT NULL THEN
            v_previous_stock := COALESCE(v_store_override_qty, 0);

            IF p_movement_type = 'in' THEN
                v_new_stock := v_previous_stock + v_qty;
            ELSE
                v_new_stock := GREATEST(0, v_previous_stock - v_qty);
            END IF;

            UPDATE public.store_products
            SET override_stock_quantity = v_new_stock, updated_at = NOW()
            WHERE id = v_store_product_id;

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
            movement_id, product_id, variant_id, quantity,
            previous_quantity, new_quantity, store_product_id, created_at
        ) VALUES (
            v_movement_id,
            v_product_id,
            v_variant_id,
            CASE WHEN p_movement_type = 'in' THEN v_qty ELSE -v_qty END,
            v_previous_stock,
            v_new_stock,
            v_store_product_id,
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

-- ============================================================
-- 8. Update order_payment_stock_trigger to pass store_id
-- ============================================================
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
        v_items,
        new.store_id
      );
    END IF;
  END IF;

  RETURN new;
END;
$$;

-- ============================================================
-- 9. Update finalize_order_inventory to accept and pass p_store_id
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
    p_items,
    p_store_id
  )::JSONB;

  v_movement_id := NULLIF(v_movement->>'id', '')::UUID;

  IF v_movement_id IS NOT NULL THEN
    UPDATE public.stock_movements
    SET
      order_id = p_order_id,
      reference_name = 'Pedido: ' || p_order_id::TEXT
    WHERE id = v_movement_id;
  END IF;

  -- Release reserved from store_products when store-aware
  IF p_store_id IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      v_product_id := NULLIF(v_item->>'product_id', '')::UUID;
      v_qty := COALESCE((v_item->>'quantity')::INTEGER, 0);
      CONTINUE WHEN v_product_id IS NULL OR v_qty <= 0;

      UPDATE public.store_products
      SET stock_reserved = GREATEST(0, COALESCE(stock_reserved, 0) - v_qty),
          updated_at = NOW()
      WHERE product_id = v_product_id AND store_id = p_store_id;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'movement_id', v_movement_id,
    'items_count', jsonb_array_length(p_items)
  );
END;
$$;

-- ============================================================
-- 10. Add stock_reserved + stock_available to store_products
-- ============================================================
ALTER TABLE public.store_products
  ADD COLUMN IF NOT EXISTS stock_reserved INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_available INTEGER NOT NULL DEFAULT 0;

UPDATE public.store_products
SET
  stock_reserved = COALESCE(stock_reserved, 0),
  stock_available = GREATEST(0, COALESCE(override_stock_quantity, 0) - COALESCE(stock_reserved, 0));

ALTER TABLE public.store_products
  DROP CONSTRAINT IF EXISTS store_products_stock_reserved_non_negative;

ALTER TABLE public.store_products
  ADD CONSTRAINT store_products_stock_reserved_non_negative
  CHECK (stock_reserved >= 0);

CREATE OR REPLACE FUNCTION public.sync_store_products_stock_availability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.stock_reserved := COALESCE(NEW.stock_reserved, 0);
  NEW.stock_available := GREATEST(0, COALESCE(NEW.override_stock_quantity, 0) - NEW.stock_reserved);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_store_products_stock_availability ON public.store_products;
CREATE TRIGGER sync_store_products_stock_availability
BEFORE INSERT OR UPDATE OF override_stock_quantity, stock_reserved
ON public.store_products
FOR EACH ROW
EXECUTE FUNCTION public.sync_store_products_stock_availability();

-- ============================================================
-- 11. Update reserve_order_inventory to accept p_store_id
-- ============================================================
CREATE OR REPLACE FUNCTION public.reserve_order_inventory(
  p_partner_id UUID,
  p_order_id UUID,
  p_items JSONB DEFAULT '[]'::JSONB,
  p_store_id UUID DEFAULT NULL
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
  v_store_product_id UUID;
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

    ELSIF p_store_id IS NOT NULL THEN
      SELECT sp.id, sp.stock_available, COALESCE(p.allow_sell_without_stock, false)
      INTO v_store_product_id, v_available, v_allow_without_stock
      FROM public.store_products sp
      JOIN public.products p ON p.id = sp.product_id
      WHERE sp.product_id = v_product_id
        AND sp.store_id = p_store_id
        AND p.partner_id = p_partner_id
      FOR UPDATE OF sp, p;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado na loja para reserva: %', v_product_id;
      END IF;

      IF NOT v_allow_without_stock AND v_available < v_qty THEN
        RAISE EXCEPTION 'Estoque disponível insuficiente na loja para o produto %', v_product_id;
      END IF;

      UPDATE public.store_products
      SET stock_reserved = stock_reserved + v_qty, updated_at = NOW()
      WHERE id = v_store_product_id;

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

-- ============================================================
-- 12. Update release_order_inventory to accept p_store_id
-- ============================================================
CREATE OR REPLACE FUNCTION public.release_order_inventory(
  p_partner_id UUID,
  p_order_id UUID,
  p_items JSONB DEFAULT '[]'::JSONB,
  p_store_id UUID DEFAULT NULL
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
  v_store_product_id UUID;
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

    ELSIF p_store_id IS NOT NULL THEN
      SELECT sp.id, sp.stock_reserved
      INTO v_store_product_id, v_reserved
      FROM public.store_products sp
      JOIN public.products p ON p.id = sp.product_id
      WHERE sp.product_id = v_product_id
        AND sp.store_id = p_store_id
        AND p.partner_id = p_partner_id
      FOR UPDATE OF sp, p;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado na loja para liberar reserva: %', v_product_id;
      END IF;

      IF v_reserved < v_qty THEN
        RAISE EXCEPTION 'Reserva insuficiente na loja para o produto %', v_product_id;
      END IF;

      UPDATE public.store_products
      SET stock_reserved = stock_reserved - v_qty, updated_at = NOW()
      WHERE id = v_store_product_id;

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

COMMIT;
