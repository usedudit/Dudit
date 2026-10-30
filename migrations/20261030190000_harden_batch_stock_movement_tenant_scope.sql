BEGIN;

-- The SECURITY DEFINER stock RPC is callable by the service role from server
-- actions. Validate every product/variant tenant and requested store inside
-- the same transaction that changes stock, including variant movements.
CREATE OR REPLACE FUNCTION public.create_batch_stock_movement(
  p_partner_id UUID,
  p_movement_type TEXT,
  p_reason TEXT,
  p_notes TEXT,
  p_created_by UUID DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::JSONB,
  p_store_id UUID DEFAULT NULL,
  p_reference_name TEXT DEFAULT NULL,
  p_reference_type TEXT DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_movement_id UUID;
  v_item JSONB;
  v_product_id UUID;
  v_variant_id UUID;
  v_qty INT;
  v_previous_stock INT;
  v_new_stock INT;
  v_delta INT;
  v_product_store_id UUID;
  v_items_count INT;
BEGIN
  IF p_partner_id IS NULL THEN
    RAISE EXCEPTION 'Parceiro obrigatório' USING ERRCODE = '22004';
  END IF;

  IF p_movement_type NOT IN ('sale', 'return', 'adjustment', 'purchase', 'damage', 'loss', 'in', 'out') THEN
    RAISE EXCEPTION 'Tipo de movimentação inválido' USING ERRCODE = '22023';
  END IF;

  IF p_store_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.stores s WHERE s.id = p_store_id AND s.partner_id = p_partner_id
  ) THEN
    RAISE EXCEPTION 'Loja não pertence ao parceiro' USING ERRCODE = '42501';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Lista de itens inválida' USING ERRCODE = '22023';
  END IF;
  v_items_count := jsonb_array_length(p_items);
  IF v_items_count = 0 OR v_items_count > 100 THEN
    RAISE EXCEPTION 'A movimentação deve conter de 1 a 100 itens' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.stock_movements (
    partner_id, movement_type, reason, notes, reference_name, reference_type,
    created_by, store_id, created_at
  ) VALUES (
    p_partner_id, p_movement_type, p_reason, p_notes, p_reference_name,
    p_reference_type, p_created_by, p_store_id, NOW()
  ) RETURNING id INTO v_movement_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'Item de movimentação inválido' USING ERRCODE = '22023';
    END IF;

    v_product_id := NULLIF(v_item->>'product_id', '')::UUID;
    v_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
    IF v_product_id IS NULL OR NULLIF(v_item->>'quantity', '') IS NULL THEN
      RAISE EXCEPTION 'Produto e quantidade são obrigatórios' USING ERRCODE = '22023';
    END IF;
    IF (v_item->>'quantity')::NUMERIC <> trunc((v_item->>'quantity')::NUMERIC) THEN
      RAISE EXCEPTION 'Quantidade deve ser inteira' USING ERRCODE = '22023';
    END IF;
    v_qty := (v_item->>'quantity')::INT;
    IF (p_movement_type = 'adjustment' AND v_qty < 0)
       OR (p_movement_type <> 'adjustment' AND v_qty <= 0) THEN
      RAISE EXCEPTION 'Quantidade inválida' USING ERRCODE = '22023';
    END IF;

    IF v_variant_id IS NOT NULL THEN
      SELECT v.stock_quantity, p.store_id
        INTO v_previous_stock, v_product_store_id
      FROM public.product_variants v
      JOIN public.products p ON p.id = v.product_id
      WHERE v.id = v_variant_id
        AND v.product_id = v_product_id
        AND p.partner_id = p_partner_id
      FOR UPDATE OF v;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variação não pertence ao produto/parceiro informado' USING ERRCODE = '42501';
      END IF;
    ELSE
      SELECT p.stock_quantity, p.store_id
        INTO v_previous_stock, v_product_store_id
      FROM public.products p
      WHERE p.id = v_product_id AND p.partner_id = p_partner_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não pertence ao parceiro informado' USING ERRCODE = '42501';
      END IF;
    END IF;

    IF p_store_id IS NOT NULL AND v_product_store_id IS NOT NULL AND v_product_store_id <> p_store_id THEN
      RAISE EXCEPTION 'Produto pertence a outra loja' USING ERRCODE = '42501';
    END IF;

    IF p_movement_type = 'in' THEN
      v_new_stock := v_previous_stock + v_qty;
      v_delta := v_qty;
    ELSIF p_movement_type = 'adjustment' THEN
      v_new_stock := v_qty;
      v_delta := v_new_stock - v_previous_stock;
    ELSE
      v_new_stock := GREATEST(0, v_previous_stock - v_qty);
      v_delta := v_new_stock - v_previous_stock;
    END IF;

    IF v_variant_id IS NOT NULL THEN
      UPDATE public.product_variants
      SET stock_quantity = v_new_stock, updated_at = NOW()
      WHERE id = v_variant_id AND product_id = v_product_id;
    ELSE
      UPDATE public.products
      SET stock_quantity = v_new_stock, updated_at = NOW()
      WHERE id = v_product_id AND partner_id = p_partner_id;
    END IF;

    INSERT INTO public.stock_movement_items (
      movement_id, product_id, variant_id, quantity,
      previous_quantity, new_quantity, created_at
    ) VALUES (
      v_movement_id, v_product_id, v_variant_id, v_delta,
      v_previous_stock, v_new_stock, NOW()
    );
  END LOOP;

  RETURN json_build_object('id', v_movement_id, 'success', true, 'items_count', v_items_count);
END;
$$;

-- Preserve the restricted server-only grant from the prior hardening migration.
REVOKE ALL ON FUNCTION public.create_batch_stock_movement(UUID, TEXT, TEXT, TEXT, UUID, JSONB, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_batch_stock_movement(UUID, TEXT, TEXT, TEXT, UUID, JSONB, UUID, TEXT, TEXT)
  TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
