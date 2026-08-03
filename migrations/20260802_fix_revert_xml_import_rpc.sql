-- ============================================================================
-- Fix revert_xml_import RPC: only reverse items that actually have a linked
-- stock movement item.
--
-- Root cause: the current execute_xml_import RPC no longer creates per-item
-- stock movements, so xml_import_items.stock_movement_id stays NULL. The
-- revert loop used a LEFT JOIN and then inserted a reverse line with
-- quantity = NULL, violating stock_movement_items.quantity NOT NULL and
-- surfacing as "Campo obrigatório não preenchido".
-- ============================================================================

CREATE OR REPLACE FUNCTION public.revert_xml_import(
  p_xml_import_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_import RECORD;
  v_item RECORD;
  v_reverse_movement_id UUID;
  v_previous_stock INTEGER;
  v_new_stock INTEGER;
  v_now TIMESTAMPTZ := NOW();
  v_partner_id UUID;
  v_errors JSONB := '[]'::JSONB;
  v_error TEXT;
  v_tx RECORD;
  v_reversed_items INTEGER := 0;
BEGIN
  -- Lock the import row to prevent concurrent reversals
  SELECT id, partner_id, status, reversed_at, access_key, supplier_id, invoice_number
  INTO v_import
  FROM public.xml_imports
  WHERE id = p_xml_import_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Importação não encontrada');
  END IF;

  -- Validate status
  IF v_import.status != 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error',
      CASE
        WHEN v_import.status = 'reversed' THEN 'Importação já foi revertida anteriormente'
        WHEN v_import.status = 'failed' THEN 'Importação com falha não pode ser revertida'
        ELSE 'Importação não está concluída (status: ' || v_import.status || ')'
      END
    );
  END IF;

  -- Prevent double reversal
  IF v_import.reversed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Importação já foi revertida em ' || v_import.reversed_at::TEXT);
  END IF;

  -- Verify permission
  IF NOT EXISTS (
    SELECT 1 FROM public.partner_users
    WHERE partner_id = v_import.partner_id AND user_id = COALESCE(p_created_by, auth.uid())
    UNION
    SELECT 1 FROM public.partners
    WHERE id = v_import.partner_id AND user_id = COALESCE(p_created_by, auth.uid())
  ) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  -- =========================================================
  -- 1. Create reverse stock movement
  --    Only reverses items that actually generated a stock
  --    movement (smi.id IS NOT NULL). Items imported without
  --    stock changes (or from newer imports that no longer
  --    create movements) are skipped gracefully.
  -- =========================================================
  FOR v_item IN
    SELECT
      xii.id AS item_id,
      xii.matched_product_id,
      xii.created_product_id,
      xii.stock_added,
      xii.stock_movement_id,
      smi.product_id,
      smi.quantity,
      smi.previous_quantity,
      smi.new_quantity
    FROM public.xml_import_items xii
    LEFT JOIN public.stock_movement_items smi ON smi.id = (
      SELECT smi2.id FROM public.stock_movement_items smi2
      WHERE smi2.movement_id = xii.stock_movement_id
      AND smi2.product_id = COALESCE(xii.matched_product_id, xii.created_product_id)
      LIMIT 1
    )
    WHERE xii.xml_import_id = p_xml_import_id
      AND xii.match_status != 'skipped'
      AND COALESCE(xii.matched_product_id, xii.created_product_id) IS NOT NULL
      AND smi.id IS NOT NULL
  LOOP
    BEGIN
      SELECT stock_quantity INTO v_previous_stock
      FROM public.products
      WHERE id = COALESCE(v_item.product_id, v_item.matched_product_id, v_item.created_product_id)
      FOR UPDATE;

      v_previous_stock := COALESCE(v_previous_stock, 0);
      v_new_stock := GREATEST(v_previous_stock - v_item.quantity, 0);

      IF v_reverse_movement_id IS NULL THEN
        INSERT INTO public.stock_movements (
          partner_id, movement_type, reference_type, reference_name, reason, notes, created_by
        ) VALUES (
          v_import.partner_id, 'adjustment', 'internal',
          'NF-e ' || COALESCE(v_import.invoice_number, ''),
          'Reversão importação NF-e',
          COALESCE(p_reason, 'Reversão da importação ' || v_import.access_key),
          COALESCE(p_created_by, auth.uid())
        )
        RETURNING id INTO v_reverse_movement_id;
      END IF;

      UPDATE public.products
      SET stock_quantity = v_new_stock, updated_at = v_now
      WHERE id = COALESCE(v_item.product_id, v_item.matched_product_id, v_item.created_product_id);

      INSERT INTO public.stock_movement_items (
        movement_id, product_id, quantity, previous_quantity, new_quantity
      ) VALUES (
        v_reverse_movement_id,
        COALESCE(v_item.product_id, v_item.matched_product_id, v_item.created_product_id),
        -(v_item.quantity),
        v_previous_stock,
        v_new_stock
      );

      v_reversed_items := v_reversed_items + 1;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
      v_errors := v_errors || jsonb_build_object(
        'item_id', v_item.item_id,
        'error', v_error
      );
    END;
  END LOOP;

  IF jsonb_array_length(v_errors) > 0 THEN
    RAISE EXCEPTION 'Erro na reversão: %', v_errors::TEXT
      USING ERRCODE = 'P0001';
  END IF;

  -- =========================================================
  -- 2. Handle financial transactions generated by this import
  --    Match by partner_id + description containing invoice_number.
  --    - Pending/overdue → cancel
  --    - Paid/partially paid → create estorno (refund transaction)
  -- =========================================================
  FOR v_tx IN
    SELECT id, amount, paid_amount, status, transaction_type, contact_id, contact_type,
           description, category, due_date, payment_type, original_amount
    FROM public.transactions
    WHERE partner_id = v_import.partner_id
      AND description LIKE '%' || COALESCE(v_import.invoice_number, '') || '%'
      AND status IN ('pending', 'overdue', 'paid')
    FOR UPDATE
  LOOP
    IF v_tx.status = 'paid' OR COALESCE(v_tx.paid_amount, 0) > 0 THEN
      -- Create reversal transaction (estorno)
      INSERT INTO public.transactions (
        partner_id, contact_id, contact_type,
        transaction_type, category, amount,
        description, due_date, status, paid_amount, payment_date,
        original_amount, interest_amount, discount_amount, payment_type,
        notes, created_by_user_id, created_at, updated_at
      ) VALUES (
        v_import.partner_id,
        v_tx.contact_id,
        v_tx.contact_type,
        'refund',
        v_tx.category,
        COALESCE(v_tx.paid_amount, v_tx.amount),
        '[Estorno] ' || v_tx.description,
        v_now::DATE,
        'paid',
        COALESCE(v_tx.paid_amount, v_tx.amount),
        v_now,
        COALESCE(v_tx.original_amount, v_tx.amount),
        0, 0,
        v_tx.payment_type,
        'Estorno gerado automaticamente por reversão de importação NF-e ' || COALESCE(v_import.invoice_number, ''),
        COALESCE(p_created_by, auth.uid()),
        v_now, v_now
      );

      -- Cancel the original paid transaction
      UPDATE public.transactions
      SET
        status = 'cancelled',
        notes = COALESCE(notes, '') || ' | Cancelado por reversão de importação NF-e em ' || v_now::TEXT,
        updated_at = v_now
      WHERE id = v_tx.id;
    ELSE
      -- Pending/overdue → just cancel
      UPDATE public.transactions
      SET
        status = 'cancelled',
        notes = COALESCE(notes, '') || ' | Cancelado por reversão de importação NF-e em ' || v_now::TEXT,
        updated_at = v_now
      WHERE id = v_tx.id;
    END IF;
  END LOOP;

  -- =========================================================
  -- 3. Mark the import as reversed
  -- =========================================================
  UPDATE public.xml_imports
  SET
    status = 'reversed',
    reversal_movement_id = v_reverse_movement_id,
    reversal_reason = p_reason,
    reversed_at = v_now,
    reversed_by = COALESCE(p_created_by, auth.uid()),
    updated_at = v_now
  WHERE id = p_xml_import_id;

  -- =========================================================
  -- 4. Audit log
  -- =========================================================
  INSERT INTO public.audit_logs (table_name, action, user_id, new_values, created_at)
  VALUES (
    'xml_imports',
    'revert',
    COALESCE(p_created_by, auth.uid()),
    jsonb_build_object(
      'xml_import_id', p_xml_import_id,
      'access_key', v_import.access_key,
      'reversal_movement_id', v_reverse_movement_id,
      'reversed_items', v_reversed_items,
      'reason', p_reason,
      'reverted_at', v_now
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Importação revertida com sucesso',
    'reversal_movement_id', v_reverse_movement_id,
    'reversed_items', v_reversed_items
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION public.revert_xml_import(UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revert_xml_import(UUID, TEXT, UUID) TO authenticated, service_role;
