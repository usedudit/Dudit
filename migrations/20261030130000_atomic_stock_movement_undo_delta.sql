BEGIN;

-- The current stock model stores stock on products/product_variants and the
-- latest create_batch_stock_movement implementation applies signed deltas.
-- Do not delegate undo to that generic RPC: reverse the recorded signed delta
-- directly under row locks, in this same transaction.
CREATE OR REPLACE FUNCTION public.undo_stock_movement_atomic(
  p_partner_id uuid,
  p_movement_id uuid,
  p_user_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_original public.stock_movements%ROWTYPE;
  v_item record;
  v_current_stock integer;
  v_new_stock integer;
  v_reversal_id uuid;
  v_reversal_quantity integer := 0;
  v_reason text;
  v_product_ids uuid[] := ARRAY[]::uuid[];
  v_now timestamptz := now();
BEGIN
  IF p_partner_id IS NULL OR p_movement_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Parceiro, movimentação e usuário são obrigatórios'
      USING ERRCODE = '22004';
  END IF;

  SELECT sm.*
    INTO v_original
  FROM public.stock_movements sm
  WHERE sm.id = p_movement_id
    AND sm.partner_id = p_partner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimentação não encontrada para este parceiro'
      USING ERRCODE = '42501';
  END IF;

  IF v_original.reversed_at IS NOT NULL OR v_original.reversal_movement_id IS NOT NULL THEN
    RAISE EXCEPTION 'Esta movimentação já foi desfeita'
      USING ERRCODE = '23505';
  END IF;

  IF v_original.store_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = v_original.store_id AND s.partner_id = p_partner_id
  ) THEN
    RAISE EXCEPTION 'Loja da movimentação não pertence ao parceiro'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.stock_movement_items smi
    WHERE smi.movement_id = p_movement_id
  ) THEN
    RAISE EXCEPTION 'Itens da movimentação não encontrados'
      USING ERRCODE = 'P0002';
  END IF;

  v_reason := left(
    COALESCE(NULLIF(btrim(p_reason), ''), 'Estorno da movimentação ' || left(p_movement_id::text, 8)),
    500
  );

  INSERT INTO public.stock_movements (
    partner_id, movement_type, reason, notes, reference_name,
    reference_type, created_by, store_id, created_at
  ) VALUES (
    p_partner_id, 'adjustment', v_reason,
    'Estorno da movimentação ID: ' || left(p_movement_id::text, 8),
    left(p_movement_id::text, 8), 'internal', p_user_id,
    v_original.store_id, v_now
  )
  RETURNING id INTO v_reversal_id;

  -- Stable row order reduces deadlock risk when separate movements touch the
  -- same products in different input orders. The original row lock serializes
  -- competing undo attempts for this movement.
  FOR v_item IN
    SELECT smi.product_id, smi.variant_id, smi.quantity
    FROM public.stock_movement_items smi
    WHERE smi.movement_id = p_movement_id
    ORDER BY smi.product_id, smi.variant_id NULLS FIRST, smi.id
  LOOP
    IF v_item.variant_id IS NOT NULL THEN
      SELECT COALESCE(pv.stock_quantity, 0)
        INTO v_current_stock
      FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
      WHERE pv.id = v_item.variant_id
        AND pv.product_id = v_item.product_id
        AND p.partner_id = p_partner_id
        AND (v_original.store_id IS NULL OR p.store_id = v_original.store_id)
      FOR UPDATE OF pv;
    ELSE
      SELECT COALESCE(p.stock_quantity, 0)
        INTO v_current_stock
      FROM public.products p
      WHERE p.id = v_item.product_id
        AND p.partner_id = p_partner_id
        AND (v_original.store_id IS NULL OR p.store_id = v_original.store_id)
      FOR UPDATE;
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto ou variação não pertence ao parceiro/loja da movimentação'
        USING ERRCODE = '42501';
    END IF;

    -- quantity is the signed delta actually applied by the original movement.
    -- Applying its inverse to current stock preserves later movements. If
    -- reversing an earlier stock-in would make stock negative, abort atomically.
    v_new_stock := v_current_stock - COALESCE(v_item.quantity, 0);
    IF v_new_stock < 0 THEN
      RAISE EXCEPTION 'Estoque atual insuficiente para desfazer integralmente a movimentação'
        USING ERRCODE = '23514';
    END IF;

    IF v_item.variant_id IS NOT NULL THEN
      UPDATE public.product_variants
      SET stock_quantity = v_new_stock, updated_at = v_now
      WHERE id = v_item.variant_id;
    ELSE
      UPDATE public.products
      SET stock_quantity = v_new_stock, updated_at = v_now
      WHERE id = v_item.product_id AND partner_id = p_partner_id;
    END IF;

    INSERT INTO public.stock_movement_items (
      movement_id, product_id, variant_id, quantity,
      previous_quantity, new_quantity, created_at
    ) VALUES (
      v_reversal_id, v_item.product_id, v_item.variant_id,
      -COALESCE(v_item.quantity, 0), v_current_stock, v_new_stock, v_now
    );

    v_reversal_quantity := v_reversal_quantity - COALESCE(v_item.quantity, 0);
    IF NOT (v_item.product_id = ANY(v_product_ids)) THEN
      v_product_ids := array_append(v_product_ids, v_item.product_id);
    END IF;
  END LOOP;

  UPDATE public.stock_movements
  SET reversed_at = v_now,
      reversed_by = p_user_id,
      reversal_movement_id = v_reversal_id
  WHERE id = p_movement_id
    AND partner_id = p_partner_id
    AND reversed_at IS NULL
    AND reversal_movement_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A movimentação foi revertida por outra operação'
      USING ERRCODE = '23505';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_reversal_id,
    'reversal_movement_id', v_reversal_id,
    'original_movement_id', p_movement_id,
    'quantity', v_reversal_quantity,
    'product_ids', to_jsonb(v_product_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.undo_stock_movement_atomic(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.undo_stock_movement_atomic(uuid, uuid, uuid, text)
  TO service_role;

COMMIT;
