-- ============================================================================
-- Fix revert_xml_import RPC: "column finance_account_id does not exist"
--
-- The transactions table uses the column name "account_id", not
-- "finance_account_id". The 20260813 migration introduced this bug when
-- rewriting the finance reversal section.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.revert_xml_import(
  p_xml_import_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_store_id UUID DEFAULT NULL
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
BEGIN
  -- Lock the import row to prevent concurrent reversals
  SELECT id, partner_id, status, reversed_at, access_key, supplier_id, invoice_number, store_id
  INTO v_import
  FROM public.xml_imports
  WHERE id = p_xml_import_id
    AND (p_store_id IS NULL OR store_id = p_store_id)
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
  -- REVERT STOCK MOVEMENTS (create reversal movement)
  -- =========================================================

  -- Check if there are items with stock_movement_id to revert
  IF EXISTS (
    SELECT 1 FROM public.xml_import_items
    WHERE xml_import_id = p_xml_import_id
      AND stock_movement_id IS NOT NULL
  ) THEN
    -- Create a reversal stock movement
    INSERT INTO public.stock_movements (
      partner_id,
      movement_type,
      reason,
      notes,
      created_by,
      store_id,
      created_at
    ) VALUES (
      v_import.partner_id,
      'adjustment',
      'Reversão de importação XML: ' || v_import.access_key,
      'NF-e: ' || v_import.invoice_number || ' - ' || COALESCE(p_reason, 'Reversão solicitada'),
      COALESCE(p_created_by, auth.uid()),
      v_import.store_id,
      v_now
    ) RETURNING id INTO v_reverse_movement_id;

    -- For each item with stock_movement_id, create reversal movement items
    FOR v_item IN
      SELECT id, matched_product_id, created_product_id, stock_action, stock_added, raw_unit, raw_quantity
      FROM public.xml_import_items
      WHERE xml_import_id = p_xml_import_id
        AND stock_movement_id IS NOT NULL
    LOOP
      DECLARE
        v_product_id UUID;
        v_qty NUMERIC(10,4);
      BEGIN
        -- Determine which product ID to use
        v_product_id := COALESCE(v_item.created_product_id, v_item.matched_product_id);
        IF v_product_id IS NULL THEN
          CONTINUE;
        END IF;

        -- Calculate reversal quantity (negative of what was added)
        v_qty := v_item.stock_added;
        IF v_item.stock_action = 'add' THEN
          v_qty := -v_qty;
        ELSIF v_item.stock_action = 'weighted_average' THEN
          v_qty := -v_qty;
        END IF;

        IF v_qty = 0 THEN
          CONTINUE;
        END IF;

        -- Get previous stock for this product
        SELECT COALESCE(stock_quantity, 0) INTO v_previous_stock
        FROM public.products
        WHERE id = v_product_id
        FOR UPDATE;

        v_new_stock := v_previous_stock + v_qty;
        IF v_new_stock < 0 THEN
          v_new_stock := 0;
        END IF;

        -- Create stock movement item
        INSERT INTO public.stock_movement_items (
          movement_id,
          product_id,
          variant_id,
          quantity,
          previous_quantity,
          new_quantity,
          created_at
        ) VALUES (
          v_reverse_movement_id,
          v_product_id,
          NULL,
          v_qty::INTEGER,
          v_previous_stock,
          v_new_stock,
          v_now
        );

        -- Update product stock
        UPDATE public.products
        SET stock_quantity = v_new_stock, updated_at = v_now
        WHERE id = v_product_id;

      EXCEPTION WHEN OTHERS THEN
        v_errors := v_errors || jsonb_build_object('error', 'Erro ao reverter estoque do item ' || v_item.id || ': ' || SQLERRM);
      END;
    END LOOP;
  END IF;

  -- =========================================================
  -- REVERT FINANCE (cancel + create refunds)
  -- =========================================================

  -- 1. Cancel pending accounts payable (not yet paid)
  UPDATE public.transactions
  SET status = 'cancelled',
      updated_at = v_now
  WHERE partner_id = v_import.partner_id
    AND (v_import.store_id IS NULL OR store_id = v_import.store_id)
    AND description ILIKE '%' || v_import.invoice_number || '%'
    AND status = 'pending';

  -- 2. For paid accounts, create refund entries
  --    - pago: cria reembolso com valor = paid_amount, vencimento +30d
  FOR v_tx IN
    SELECT id, amount, paid_amount, due_date, account_id, contact_id, store_id
    FROM public.transactions
    WHERE partner_id = v_import.partner_id
      AND (v_import.store_id IS NULL OR store_id = v_import.store_id)
      AND description ILIKE '%' || v_import.invoice_number || '%'
      AND status = 'paid'
  LOOP
    INSERT INTO public.transactions (
      partner_id,
      store_id,
      contact_id,
      account_id,
      amount,
      original_amount,
      paid_amount,
      transaction_type,
      refund_kind,
      status,
      description,
      due_date,
      created_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      v_import.partner_id,
      v_tx.store_id,
      v_tx.contact_id,
      v_tx.account_id,
      COALESCE(v_tx.paid_amount, v_tx.amount),
      v_tx.amount,
      0,
      'refund',
      'expense_refund',
      'pending',
      'Estorno: ' || v_import.invoice_number || ' - ' || COALESCE(p_reason, 'Reversão de importação'),
      (v_now + INTERVAL '30 days')::DATE,
      COALESCE(p_created_by, auth.uid()),
      v_now,
      v_now
    );
  END LOOP;

  -- =========================================================
  -- UPDATE IMPORT STATUS
  -- =========================================================

  UPDATE public.xml_imports
  SET status = 'reversed',
      reversed_at = v_now,
      reversed_by = COALESCE(p_created_by, auth.uid()),
      reversal_reason = p_reason,
      reversal_movement_id = v_reverse_movement_id,
      updated_at = v_now
  WHERE id = p_xml_import_id;

  -- =========================================================
  -- AUDIT LOG
  -- =========================================================

  INSERT INTO public.audit_logs (
    partner_id,
    actor_user_id,
    entity_type,
    entity_id,
    action_type,
    change_lines,
    source,
    created_at
  ) VALUES (
    v_import.partner_id,
    COALESCE(p_created_by, auth.uid()),
    'xml_imports',
    p_xml_import_id,
    'xml_reverted',
    ARRAY['Importação revertida: ' || v_import.invoice_number || COALESCE(' - ' || p_reason, '')],
    'manual',
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Importação revertida com sucesso',
    'reversal_movement_id', v_reverse_movement_id
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.revert_xml_import(UUID, TEXT, UUID, UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
