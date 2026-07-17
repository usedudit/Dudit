-- ============================================================================
-- Fase 10.1 Hotfix — Correções Médias Pós-Auditoria
-- ============================================================================
-- M1: FOR UPDATE no fallback de decrement_store_product_stock
-- M2: Lock ordering consistente em transfer_store_stock (prevenir deadlock)
-- C7: SET search_path = 'public' em todas as SECURITY DEFINER functions
-- ============================================================================

BEGIN;

-- ============================================================
-- M1 + C7: decrement_store_product_stock com FOR UPDATE + search_path
-- ============================================================
CREATE OR REPLACE FUNCTION public.decrement_store_product_stock(
  p_store_product_id UUID,
  p_quantity INTEGER,
  p_allow_negative BOOLEAN DEFAULT false
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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
    WHERE id = v_product_id
    FOR UPDATE;
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
-- C7: increment_store_product_stock com search_path
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_store_product_stock(
  p_store_product_id UUID,
  p_quantity INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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
-- M2 + C7: transfer_store_stock com lock ordering + search_path
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
SET search_path = 'public'
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
  -- Lock ordering: always acquire locks in ascending ID order to prevent deadlocks
  IF p_from_store_product_id < p_to_store_product_id THEN
    SELECT sp1.product_id, sp1.override_stock_quantity, sp1.store_id
    INTO v_product_id, v_from_current, v_from_store_id
    FROM public.store_products sp1
    WHERE sp1.id = p_from_store_product_id
    FOR UPDATE;

    SELECT override_stock_quantity INTO v_to_current
    FROM public.store_products
    WHERE id = p_to_store_product_id AND product_id = v_product_id
    FOR UPDATE;
  ELSE
    SELECT sp1.product_id, sp1.override_stock_quantity, sp1.store_id
    INTO v_product_id, v_to_current, v_from_store_id
    FROM public.store_products sp1
    WHERE sp1.id = p_to_store_product_id
    FOR UPDATE;

    SELECT override_stock_quantity INTO v_from_current
    FROM public.store_products
    WHERE id = p_from_store_product_id AND product_id = v_product_id
    FOR UPDATE;
  END IF;

  IF v_product_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Store product de origem não encontrado');
  END IF;

  IF v_to_current IS NULL AND p_from_store_product_id < p_to_store_product_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Store product de destino não encontrado ou produto diferente');
  END IF;
  IF v_from_current IS NULL AND p_from_store_product_id >= p_to_store_product_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Store product de origem não encontrado ou produto diferente');
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
    partner_id, movement_type, reason, notes, created_by, created_at
  ) VALUES (
    p_partner_id, 'transfer', 'Transferência entre lojas',
    p_notes, p_created_by, NOW()
  )
  RETURNING id INTO v_movement_id;

  INSERT INTO public.stock_movement_items (movement_id, product_id, quantity, previous_quantity, new_quantity, created_at)
  VALUES
    (v_movement_id, v_product_id, -p_quantity, v_from_current, v_from_new, NOW()),
    (v_movement_id, v_product_id, p_quantity, v_to_current, v_to_new, NOW());

  RETURN jsonb_build_object(
    'success', true,
    'movement_id', v_movement_id,
    'from_previous', v_from_current,
    'from_new', v_from_new,
    'to_previous', v_to_current,
    'to_new', v_to_new
  );
END;
$$;

COMMIT;
