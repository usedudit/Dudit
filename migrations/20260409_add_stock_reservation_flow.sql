ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_reserved INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_available INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS stock_reserved INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_available INTEGER NOT NULL DEFAULT 0;

UPDATE public.products
SET
  stock_reserved = COALESCE(stock_reserved, 0),
  stock_available = COALESCE(stock_quantity, 0) - COALESCE(stock_reserved, 0);

UPDATE public.product_variants
SET
  stock_reserved = COALESCE(stock_reserved, 0),
  stock_available = COALESCE(stock_quantity, 0) - COALESCE(stock_reserved, 0);

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_stock_reserved_non_negative;

ALTER TABLE public.products
  ADD CONSTRAINT products_stock_reserved_non_negative
  CHECK (stock_reserved >= 0);

ALTER TABLE public.product_variants
  DROP CONSTRAINT IF EXISTS product_variants_stock_reserved_non_negative;

ALTER TABLE public.product_variants
  ADD CONSTRAINT product_variants_stock_reserved_non_negative
  CHECK (stock_reserved >= 0);

CREATE OR REPLACE FUNCTION public.sync_stock_availability_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.stock_quantity := COALESCE(NEW.stock_quantity, 0);
  NEW.stock_reserved := COALESCE(NEW.stock_reserved, 0);
  NEW.stock_available := NEW.stock_quantity - NEW.stock_reserved;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_products_stock_availability ON public.products;
CREATE TRIGGER sync_products_stock_availability
BEFORE INSERT OR UPDATE OF stock_quantity, stock_reserved
ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.sync_stock_availability_fields();

DROP TRIGGER IF EXISTS sync_product_variants_stock_availability ON public.product_variants;
CREATE TRIGGER sync_product_variants_stock_availability
BEFORE INSERT OR UPDATE OF stock_quantity, stock_reserved
ON public.product_variants
FOR EACH ROW
EXECUTE FUNCTION public.sync_stock_availability_fields();

DROP TRIGGER IF EXISTS order_payment_stock_trigger ON public.orders;
DROP FUNCTION IF EXISTS public.handle_order_payment_stock() CASCADE;

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

      IF NOT v_allow_without_stock AND v_available < v_qty THEN
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
$$;

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
        RAISE EXCEPTION 'Produto não encontrado para liberar reserva: %', v_product_id;
      END IF;

      IF v_reserved < v_qty THEN
        RAISE EXCEPTION 'Reserva insuficiente para o produto %', v_product_id;
      END IF;

      UPDATE public.products
      SET
        stock_reserved = stock_reserved - v_qty,
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
$$;

CREATE OR REPLACE FUNCTION public.finalize_order_inventory(
  p_partner_id UUID,
  p_order_id UUID,
  p_created_by UUID,
  p_reason TEXT,
  p_notes TEXT,
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
