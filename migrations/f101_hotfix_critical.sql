-- ============================================================================
-- Fase 10.1 Hotfix - Correções Críticas Pós-Auditoria
-- ============================================================================
-- C2: FOR UPDATE em Branch 1 e Branch 3 de create_batch_stock_movement
-- C3: Remove loop duplicado (double decrement) em finalize_order_inventory
-- C7: SET search_path = 'public' em todas as SECURITY DEFINER functions
-- ============================================================================

BEGIN;

-- ============================================================
-- C7 + C2: create_batch_stock_movement com FOR UPDATE + search_path
-- ============================================================
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
    v_store_product_id UUID;
    v_store_override_qty INT;
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

        v_store_product_id := NULL;

        -- Branch 1: Variant + Store → store_product_variants (WITH FOR UPDATE)
        IF v_variant_id IS NOT NULL AND p_store_id IS NOT NULL THEN
            SELECT spv.id, spv.override_stock_quantity
            INTO v_store_product_id, v_store_override_qty
            FROM public.store_product_variants spv
            WHERE spv.variant_id = v_variant_id AND spv.store_id = p_store_id
            FOR UPDATE OF spv;

            IF v_store_product_id IS NOT NULL THEN
                v_previous_stock := COALESCE(v_store_override_qty, 0);
                IF p_movement_type = 'in' THEN
                    v_new_stock := v_previous_stock + v_qty;
                ELSE
                    v_new_stock := GREATEST(0, v_previous_stock - v_qty);
                END IF;
                UPDATE public.store_product_variants
                SET override_stock_quantity = v_new_stock, updated_at = NOW()
                WHERE id = v_store_product_id;
            ELSE
                -- Fallback: no store override → use base variant stock
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
            END IF;

        -- Branch 2: Variant only → product_variants
        ELSIF v_variant_id IS NOT NULL THEN
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

        -- Branch 3: Store only (no variant) → store_products (WITH FOR UPDATE)
        ELSIF p_store_id IS NOT NULL THEN
            SELECT sp.id, sp.override_stock_quantity
            INTO v_store_product_id, v_store_override_qty
            FROM public.store_products sp
            WHERE sp.product_id = v_product_id AND sp.store_id = p_store_id
            FOR UPDATE OF sp;

            IF v_store_product_id IS NOT NULL THEN
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

        -- Branch 4: Neither → products
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
$$;

-- ============================================================
-- C7 + C3: finalize_order_inventory sem double decrement + search_path
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
  v_movement JSONB;
  v_movement_id UUID;
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

    -- Branch 1: Variant + Store → store_product_variants
    IF v_variant_id IS NOT NULL AND p_store_id IS NOT NULL THEN
      SELECT spv.id, spv.stock_reserved
      INTO v_store_product_id, v_reserved
      FROM public.store_product_variants spv
      JOIN public.product_variants pv ON pv.id = spv.variant_id
      JOIN public.products p ON p.id = pv.product_id
      WHERE spv.variant_id = v_variant_id
        AND spv.store_id = p_store_id
        AND pv.product_id = v_product_id
        AND p.partner_id = p_partner_id
      FOR UPDATE OF spv;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variação não encontrada na loja para finalizar estoque: %', v_variant_id;
      END IF;

      IF v_reserved < v_qty THEN
        RAISE EXCEPTION 'Reserva insuficiente na loja para finalizar a variação %', v_variant_id;
      END IF;

      UPDATE public.store_product_variants
      SET
        stock_reserved = stock_reserved - v_qty,
        updated_at = NOW()
      WHERE id = v_store_product_id;

    -- Branch 2: Variant only → product_variants
    ELSIF v_variant_id IS NOT NULL THEN
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

    -- Branch 3: Store only → store_products
    ELSIF p_store_id IS NOT NULL THEN
      SELECT sp.id, sp.stock_reserved
      INTO v_store_product_id, v_reserved
      FROM public.store_products sp
      JOIN public.products p ON p.id = sp.product_id
      WHERE sp.product_id = v_product_id
        AND sp.store_id = p_store_id
        AND p.partner_id = p_partner_id
      FOR UPDATE OF sp;

      IF NOT FOUND THEN
        -- Fallback: try products directly (product exists but not linked to store)
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
        CONTINUE;
      END IF;

      IF v_reserved < v_qty THEN
        RAISE EXCEPTION 'Reserva insuficiente na loja para finalizar o produto %', v_product_id;
      END IF;

      UPDATE public.store_products
      SET
        stock_reserved = stock_reserved - v_qty,
        updated_at = NOW()
      WHERE id = v_store_product_id;

    -- Branch 4: Neither → products
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

  RETURN jsonb_build_object(
    'success', true,
    'movement_id', v_movement_id,
    'items_count', jsonb_array_length(p_items)
  );
END;
$$;

-- ============================================================
-- C7: reserve_order_inventory com SET search_path
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
  v_store_product_id UUID;
  v_store_override_qty INTEGER;
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

    -- Branch 1: Variant + Store → store_product_variants
    IF v_variant_id IS NOT NULL AND p_store_id IS NOT NULL THEN
      SELECT spv.id, spv.override_stock_quantity, spv.stock_reserved
      INTO v_store_product_id, v_store_override_qty, v_available
      FROM public.store_product_variants spv
      JOIN public.product_variants pv ON pv.id = spv.variant_id
      JOIN public.products p ON p.id = pv.product_id
      WHERE spv.variant_id = v_variant_id
        AND spv.store_id = p_store_id
        AND pv.product_id = v_product_id
        AND p.partner_id = p_partner_id
      FOR UPDATE OF spv;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variação não encontrada na loja: %', v_variant_id;
      END IF;

      v_available := COALESCE(v_store_override_qty, 0) - COALESCE(v_available, 0);

      IF v_available < v_qty THEN
        RAISE EXCEPTION 'Estoque insuficiente na loja para a variação %', v_variant_id;
      END IF;

      UPDATE public.store_product_variants
      SET stock_reserved = COALESCE(stock_reserved, 0) + v_qty, updated_at = NOW()
      WHERE id = v_store_product_id;

    -- Branch 2: Variant only → product_variants
    ELSIF v_variant_id IS NOT NULL THEN
      SELECT stock_available - COALESCE(stock_reserved, 0)
      INTO v_available
      FROM public.product_variants
      WHERE id = v_variant_id AND product_id = v_product_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variante não encontrada: %', v_variant_id;
      END IF;

      IF v_available < v_qty THEN
        RAISE EXCEPTION 'Estoque insuficiente da variante %', v_variant_id;
      END IF;

      UPDATE public.product_variants
      SET stock_reserved = COALESCE(stock_reserved, 0) + v_qty, updated_at = NOW()
      WHERE id = v_variant_id;

    -- Branch 3: Store only → store_products
    ELSIF p_store_id IS NOT NULL THEN
      SELECT sp.id, sp.override_stock_quantity, sp.stock_reserved
      INTO v_store_product_id, v_store_override_qty, v_available
      FROM public.store_products sp
      JOIN public.products p ON p.id = sp.product_id
      WHERE sp.product_id = v_product_id
        AND sp.store_id = p_store_id
        AND p.partner_id = p_partner_id
      FOR UPDATE OF sp;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado na loja: %', v_product_id;
      END IF;

      v_available := COALESCE(v_store_override_qty, 0) - COALESCE(v_available, 0);

      IF v_available < v_qty THEN
        RAISE EXCEPTION 'Estoque insuficiente na loja para o produto %', v_product_id;
      END IF;

      UPDATE public.store_products
      SET stock_reserved = COALESCE(stock_reserved, 0) + v_qty, updated_at = NOW()
      WHERE id = v_store_product_id;

    -- Branch 4: Neither → products
    ELSE
      SELECT stock_available - COALESCE(stock_reserved, 0)
      INTO v_available
      FROM public.products
      WHERE id = v_product_id AND partner_id = p_partner_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado: %', v_product_id;
      END IF;

      IF v_available < v_qty THEN
        RAISE EXCEPTION 'Estoque insuficiente do produto %', v_product_id;
      END IF;

      UPDATE public.products
      SET stock_reserved = COALESCE(stock_reserved, 0) + v_qty, updated_at = NOW()
      WHERE id = v_product_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'items_count', jsonb_array_length(p_items));
END;
$$;

-- ============================================================
-- C7: release_order_inventory com SET search_path
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

    -- Branch 1: Variant + Store
    IF v_variant_id IS NOT NULL AND p_store_id IS NOT NULL THEN
      UPDATE public.store_product_variants
      SET stock_reserved = GREATEST(0, COALESCE(stock_reserved, 0) - v_qty), updated_at = NOW()
      WHERE variant_id = v_variant_id AND store_id = p_store_id;

    -- Branch 2: Variant only
    ELSIF v_variant_id IS NOT NULL THEN
      UPDATE public.product_variants
      SET stock_reserved = GREATEST(0, COALESCE(stock_reserved, 0) - v_qty), updated_at = NOW()
      WHERE id = v_variant_id;

    -- Branch 3: Store only
    ELSIF p_store_id IS NOT NULL THEN
      UPDATE public.store_products
      SET stock_reserved = GREATEST(0, COALESCE(stock_reserved, 0) - v_qty), updated_at = NOW()
      WHERE product_id = v_product_id AND store_id = p_store_id;

    -- Branch 4: Neither
    ELSE
      UPDATE public.products
      SET stock_reserved = GREATEST(0, COALESCE(stock_reserved, 0) - v_qty), updated_at = NOW()
      WHERE id = v_product_id AND partner_id = p_partner_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'items_count', jsonb_array_length(p_items));
END;
$$;

-- ============================================================
-- C7: finalize_pos_sale com SET search_path
-- ============================================================
CREATE OR REPLACE FUNCTION public.finalize_pos_sale(
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
  v_result JSONB;
BEGIN
  v_result := public.finalize_order_inventory(
    p_partner_id, p_order_id, p_created_by, p_reason,
    p_notes, p_items, p_store_id
  );
  RETURN v_result;
END;
$$;

-- ============================================================
-- C7: handle_order_payment_stock com SET search_path
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_order_payment_stock(
  p_partner_id UUID,
  p_order_id UUID,
  p_created_by UUID,
  p_payment_status TEXT,
  p_items JSONB DEFAULT '[]'::JSONB,
  p_store_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_reservation JSONB;
  v_finalization JSONB;
BEGIN
  IF p_payment_status IN ('paid', 'partially_paid') THEN
    v_reservation := public.reserve_order_inventory(p_partner_id, p_order_id, p_items, p_store_id);
    IF (v_reservation->>'success')::boolean IS NOT TRUE THEN
      RETURN jsonb_build_object('success', false, 'step', 'reserve', 'error', v_reservation->>'error');
    END IF;

    v_finalization := public.finalize_order_inventory(
      p_partner_id, p_order_id, p_created_by,
      'Venda confirmada', NULL, p_items, p_store_id
    );
    RETURN v_finalization;
  ELSIF p_payment_status = 'unpaid' OR p_payment_status IS NULL THEN
    v_reservation := public.release_order_inventory(p_partner_id, p_order_id, p_items, p_store_id);
    RETURN jsonb_build_object('success', true, 'step', 'release', 'items_count', (v_reservation->>'items_count')::INT);
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Unknown payment_status: ' || COALESCE(p_payment_status, 'NULL'));
  END IF;
END;
$$;

-- ============================================================
-- C7: get_store_product_stock com SET search_path
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_store_product_stock(
  p_product_id UUID DEFAULT NULL,
  p_store_id UUID DEFAULT NULL,
  p_variant_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_store_product_id UUID;
  v_override_stock INTEGER;
  v_base_stock INTEGER;
BEGIN
  IF p_variant_id IS NOT NULL AND p_store_id IS NOT NULL THEN
    SELECT spv.id, spv.override_stock_quantity
    INTO v_store_product_id, v_override_stock
    FROM public.store_product_variants spv
    WHERE spv.variant_id = p_variant_id AND spv.store_id = p_store_id;

    IF NOT FOUND THEN
      SELECT COALESCE(stock_quantity, 0) INTO v_base_stock
      FROM public.product_variants WHERE id = p_variant_id;
      RETURN jsonb_build_object('stock', v_base_stock, 'source', 'base_variant');
    END IF;

    RETURN jsonb_build_object(
      'stock', COALESCE(v_override_stock, 0),
      'store_product_variant_id', v_store_product_id,
      'source', 'store_product_variant'
    );
  ELSIF p_product_id IS NOT NULL AND p_store_id IS NOT NULL THEN
    SELECT sp.id, sp.override_stock_quantity
    INTO v_store_product_id, v_override_stock
    FROM public.store_products sp
    WHERE sp.product_id = p_product_id AND sp.store_id = p_store_id;

    IF NOT FOUND THEN
      SELECT COALESCE(stock_quantity, 0) INTO v_base_stock
      FROM public.products WHERE id = p_product_id;
      RETURN jsonb_build_object('stock', v_base_stock, 'source', 'base_product');
    END IF;

    RETURN jsonb_build_object(
      'stock', COALESCE(v_override_stock, 0),
      'store_product_id', v_store_product_id,
      'source', 'store_product'
    );
  ELSE
    RETURN jsonb_build_object('stock', 0, 'source', 'no_context');
  END IF;
END;
$$;

COMMIT;
