BEGIN;

-- Stock movements are created through authenticated server actions. The RPC is
-- SECURITY DEFINER and does not implement the application's permission model,
-- so it must not be exposed directly through the authenticated Data API.
REVOKE ALL ON FUNCTION public.create_batch_stock_movement(
  uuid, text, text, text, uuid, jsonb, uuid, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_batch_stock_movement(
  uuid, text, text, text, uuid, jsonb, uuid, text, text
) TO service_role;

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
  v_items jsonb;
  v_product_ids uuid[];
  v_result json;
  v_reversal_id uuid;
  v_reason text;
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

  SELECT
    jsonb_agg(
      jsonb_build_object(
        'product_id', smi.product_id,
        'variant_id', smi.variant_id,
        -- The adjustment RPC interprets quantity as the target stock. Restoring
        -- previous_quantity reverses the original movement's effective delta.
        'quantity', GREATEST(COALESCE(smi.previous_quantity, 0), 0)
      ) ORDER BY smi.created_at, smi.id
    ),
    array_agg(DISTINCT smi.product_id)
  INTO v_items, v_product_ids
  FROM public.stock_movement_items smi
  WHERE smi.movement_id = p_movement_id;

  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Itens da movimentação não encontrados'
      USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_movement_items smi
    LEFT JOIN public.products p
      ON p.id = smi.product_id AND p.partner_id = p_partner_id
    LEFT JOIN public.product_variants pv
      ON pv.id = smi.variant_id AND pv.product_id = smi.product_id
    WHERE smi.movement_id = p_movement_id
      AND (p.id IS NULL OR (smi.variant_id IS NOT NULL AND pv.id IS NULL))
  ) THEN
    RAISE EXCEPTION 'A movimentação contém produto ou variação fora do parceiro'
      USING ERRCODE = '42501';
  END IF;

  v_reason := left(
    COALESCE(NULLIF(btrim(p_reason), ''), 'Estorno da movimentação ' || left(p_movement_id::text, 8)),
    500
  );

  -- This call creates the compensating ledger row and updates inventory. Any
  -- later error rolls it back together with the original's reversal marker.
  v_result := public.create_batch_stock_movement(
    p_partner_id,
    'adjustment',
    v_reason,
    'Estorno da movimentação ID: ' || left(p_movement_id::text, 8),
    p_user_id,
    v_items,
    v_original.store_id,
    left(p_movement_id::text, 8),
    'adjustment'
  );

  v_reversal_id := NULLIF(v_result->>'id', '')::uuid;
  IF v_reversal_id IS NULL THEN
    RAISE EXCEPTION 'RPC de estoque não retornou a movimentação compensatória';
  END IF;

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
    'product_ids', to_jsonb(COALESCE(v_product_ids, ARRAY[]::uuid[]))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.undo_stock_movement_atomic(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.undo_stock_movement_atomic(uuid, uuid, uuid, text)
  TO service_role;

COMMIT;
