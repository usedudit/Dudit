-- ============================================================================
-- Migration: Fix Stock Movements Reference, XML Import Batch Movements & Undo Idempotency
--
-- 1. Add reversal tracking columns to stock_movements
-- 2. Update create_batch_stock_movement to accept reference_name & reference_type
-- 3. Update execute_xml_import to create ONE stock movement for all items,
--    save reference_name as 'NF <number>', and handle 'Gerar automaticamente' SKU
-- 4. Update revert_xml_import to properly revert product stock, set reference_name,
--    and mark original stock movements as reversed
-- ============================================================================

-- 1. Reversal tracking on stock_movements
ALTER TABLE public.stock_movements 
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reversed_by UUID DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reversal_movement_id UUID DEFAULT NULL REFERENCES public.stock_movements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_reversal ON public.stock_movements(reversal_movement_id);

-- 2. Update create_batch_stock_movement with reference_name & reference_type support
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
) RETURNS JSON AS $$
DECLARE
    v_movement_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_variant_id UUID;
    v_qty INT;
    v_previous_stock INT;
    v_new_stock INT;
    v_items_count INT;
BEGIN
    v_items_count := COALESCE(jsonb_array_length(p_items), 0);

    IF v_items_count = 0 THEN
        RAISE EXCEPTION 'Nenhum item fornecido';
    END IF;

    INSERT INTO public.stock_movements (
        partner_id, movement_type, reason, notes, reference_name, reference_type, created_by, store_id, created_at
    ) VALUES (
        p_partner_id, p_movement_type, p_reason, p_notes, p_reference_name, p_reference_type, p_created_by, p_store_id, NOW()
    )
    RETURNING id INTO v_movement_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := NULLIF(v_item->>'product_id', '')::UUID;
        v_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
        v_qty := COALESCE((v_item->>'quantity')::INT, 0);

        IF v_product_id IS NULL OR v_qty <= 0 THEN
            CONTINUE;
        END IF;

        -- Variant
        IF v_variant_id IS NOT NULL THEN
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

            INSERT INTO public.stock_movement_items (
                movement_id, product_id, variant_id, quantity, previous_quantity, new_quantity, created_at
            ) VALUES (
                v_movement_id, v_product_id, v_variant_id,
                CASE WHEN p_movement_type = 'in' THEN v_qty ELSE -v_qty END,
                v_previous_stock, v_new_stock, NOW()
            );

        -- Product only
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

            INSERT INTO public.stock_movement_items (
                movement_id, product_id, variant_id, quantity, previous_quantity, new_quantity, created_at
            ) VALUES (
                v_movement_id, v_product_id, NULL,
                CASE WHEN p_movement_type = 'in' THEN v_qty ELSE -v_qty END,
                v_previous_stock, v_new_stock, NOW()
            );
        END IF;
    END LOOP;

    RETURN json_build_object('id', v_movement_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update execute_xml_import to create a single stock movement for all items
CREATE OR REPLACE FUNCTION public.execute_xml_import(
  p_xml_import_id UUID,
  p_partner_id UUID,
  p_store_id UUID,
  p_items JSONB,
  p_supplier_actions JSONB DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_item JSONB;
  v_item_id UUID;
  v_decision TEXT;
  v_stock_action TEXT;
  v_cost_action TEXT;
  v_supplier_action TEXT;
  v_existing_product_id UUID;
  v_created_product_id UUID;
  v_fiscal_data JSONB;
  v_logistics_data JSONB;

  v_raw_sku TEXT;
  v_raw_name TEXT;
  v_raw_ean TEXT;
  v_raw_ncm TEXT;
  v_raw_cest TEXT;
  v_raw_unit TEXT;
  v_raw_quantity NUMERIC(10,4);
  v_raw_unit_cost NUMERIC(10,4);
  v_raw_weight_gross NUMERIC(10,4);
  v_raw_weight_net NUMERIC(10,4);
  v_raw_width NUMERIC(10,4);
  v_raw_height NUMERIC(10,4);
  v_raw_length NUMERIC(10,4);
  v_raw_origin TEXT;

  v_sku_candidate TEXT;
  v_sku_base TEXT;
  v_sku_attempt INTEGER;

  v_previous_stock INTEGER;
  v_new_stock INTEGER;
  v_previous_cost NUMERIC(14,2);
  v_new_cost_value NUMERIC(14,2);
  v_xml_unit_cost NUMERIC(14,2);
  v_single_movement_id UUID := NULL;
  v_total_imported INTEGER := 0;
  v_total_skipped INTEGER := 0;
  v_errors JSONB := '[]'::JSONB;
  v_error TEXT;

  v_update_fields TEXT[];
  v_keep_fields TEXT[];
  v_update_data JSONB;
  v_fiscal_update JSONB;
  v_logistics_update JSONB;
  v_decision_data JSONB;
  v_conflicts JSONB;
  v_field_values TEXT[];
  v_field_name TEXT;
  v_valor_xml TEXT;
  v_has_fiscal BOOLEAN;
  v_has_logistics BOOLEAN;

  v_supplier_id UUID;
  v_invoice_key TEXT;
  v_invoice_number TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_has_any_stock_addition BOOLEAN := false;
BEGIN
  -- Verifica permissão
  IF NOT EXISTS (
    SELECT 1 FROM public.partner_users
    WHERE partner_id = p_partner_id AND user_id = COALESCE(p_created_by, auth.uid())
    UNION
    SELECT 1 FROM public.partners
    WHERE id = p_partner_id AND user_id = COALESCE(p_created_by, auth.uid())
  ) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  -- Lock xml_imports
  SELECT supplier_id, access_key, invoice_number INTO v_supplier_id, v_invoice_key, v_invoice_number
  FROM public.xml_imports
  WHERE id = p_xml_import_id AND partner_id = p_partner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Importação não encontrada');
  END IF;

  -- Check if any item will add stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_stock_action := COALESCE((v_item->>'stock_action')::TEXT, 'ignore');
    v_decision := (v_item->>'decision')::TEXT;
    v_item_id := (v_item->>'item_id')::UUID;
    
    IF v_decision != 'ignore' AND v_stock_action IN ('add', 'weighted_average') THEN
      SELECT raw_quantity INTO v_raw_quantity FROM public.xml_import_items WHERE id = v_item_id;
      IF COALESCE(v_raw_quantity, 0) > 0 THEN
        v_has_any_stock_addition := true;
        EXIT;
      END IF;
    END IF;
  END LOOP;

  -- Create ONE single stock movement for the entire XML import
  IF v_has_any_stock_addition THEN
    INSERT INTO public.stock_movements (
      partner_id,
      movement_type,
      reason,
      notes,
      reference_name,
      reference_type,
      created_by,
      store_id,
      created_at
    ) VALUES (
      p_partner_id,
      'in',
      'Importação XML: NF ' || COALESCE(v_invoice_number, ''),
      'Chave NF-e: ' || COALESCE(v_invoice_key, ''),
      'NF ' || COALESCE(v_invoice_number, ''),
      'xml_import',
      COALESCE(p_created_by, auth.uid()),
      p_store_id,
      v_now
    ) RETURNING id INTO v_single_movement_id;
  END IF;

  -- Loop pelos itens
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    BEGIN
      v_item_id := (v_item->>'item_id')::UUID;
      v_decision := (v_item->>'decision')::TEXT;
      v_stock_action := COALESCE((v_item->>'stock_action')::TEXT, 'ignore');
      v_cost_action := COALESCE((v_item->>'cost_action')::TEXT, 'ignore');
      v_existing_product_id := (v_item->>'product_id')::UUID;
      v_decision_data := v_item->'decision_data';

      -- Busca dados do item no banco com lock
      SELECT
        raw_sku, raw_name, raw_ean, raw_ncm, raw_cest, raw_unit,
        raw_quantity, raw_unit_cost, raw_weight_gross, raw_weight_net,
        raw_width, raw_height, raw_length, raw_origin,
        matched_product_id, conflicts
      INTO
        v_raw_sku, v_raw_name, v_raw_ean, v_raw_ncm, v_raw_cest, v_raw_unit,
        v_raw_quantity, v_raw_unit_cost, v_raw_weight_gross, v_raw_weight_net,
        v_raw_width, v_raw_height, v_raw_length, v_raw_origin,
        v_existing_product_id, v_conflicts
      FROM public.xml_import_items
      WHERE id = v_item_id AND xml_import_id = p_xml_import_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Item % não encontrado', v_item_id;
      END IF;

      -- Se for ignorar, apenas marca e continua
      IF v_decision = 'ignore' THEN
        UPDATE public.xml_import_items
        SET match_status = 'skipped', user_decision = 'ignore', updated_at = v_now
        WHERE id = v_item_id;
        v_total_skipped := v_total_skipped + 1;
        CONTINUE;
      END IF;

      -- Resolve qual produto usar
      IF v_decision = 'create_product' THEN
        -- Cria novo produto
        v_created_product_id := gen_random_uuid();

        -- Trata SKU automático / placeholder literal
        IF v_raw_sku IS NOT NULL AND (
          LOWER(TRIM(v_raw_sku)) = 'gerar automaticamente' OR 
          LOWER(TRIM(v_raw_sku)) = 'gerar' OR 
          LOWER(TRIM(v_raw_sku)) = 'sem sku' OR
          TRIM(v_raw_sku) = ''
        ) THEN
          v_raw_sku := NULL;
        END IF;

        -- Define o SKU inicial (do XML ou gerado a partir do ID do produto)
        v_sku_candidate := COALESCE(v_raw_sku, 'XML-' || substring(v_created_product_id::text, 1, 8));

        -- Garante unicidade do SKU para o parceiro (produtos deletados são ignorados)
        IF v_sku_candidate IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.products
          WHERE partner_id = p_partner_id AND sku = v_sku_candidate
            AND deleted_at IS NULL AND status <> 'deleted'
        ) THEN
          v_sku_base := v_sku_candidate;
          FOR v_sku_attempt IN 1..20 LOOP
            v_sku_candidate := v_sku_base || '-' || substring(v_created_product_id::text, 1, 4) || lpad(v_sku_attempt::TEXT, 2, '0');
            IF NOT EXISTS (
              SELECT 1 FROM public.products
              WHERE partner_id = p_partner_id AND sku = v_sku_candidate
                AND deleted_at IS NULL AND status <> 'deleted'
            ) THEN
              EXIT;
            END IF;
          END LOOP;
        END IF;

        INSERT INTO public.products (
          id, partner_id, store_id, name, sku, gtin, unit, condition,
          cost_price, price, stock_quantity,
          status, created_at, updated_at
        ) VALUES (
          v_created_product_id,
          p_partner_id,
          p_store_id,
          v_raw_name,
          v_sku_candidate,
          v_raw_ean,
          COALESCE(v_raw_unit, 'UN'),
          'Novo',
          v_raw_unit_cost,
          v_raw_unit_cost,
          0,
          'ativo', v_now, v_now
        );

        -- Cria dados fiscais se tiver NCM
        IF v_raw_ncm IS NOT NULL THEN
          INSERT INTO public.product_fiscal_profiles (
            product_id, ncm, cest, origin, cfop_internal, cfop_external, csosn,
            pis_cst, cofins_cst, created_at, updated_at
          ) VALUES (
            v_created_product_id,
            v_raw_ncm,
            v_raw_cest,
            COALESCE(v_raw_origin, '0')::INTEGER,
            '5102',
            '6102',
            CASE WHEN v_raw_cest IS NOT NULL THEN '500' ELSE '102' END,
            '99',
            '99',
            v_now,
            v_now
          );
        END IF;

        -- Cria dados logísticos se tiver peso/dimensões
        IF v_raw_weight_gross IS NOT NULL OR v_raw_width IS NOT NULL THEN
          INSERT INTO public.product_logistics (
            product_id, weight_gross, weight_net, width, height, length, created_at, updated_at
          ) VALUES (
            v_created_product_id,
            v_raw_weight_gross,
            v_raw_weight_net,
            v_raw_width,
            v_raw_height,
            v_raw_length,
            v_now,
            v_now
          );
        END IF;

        v_existing_product_id := v_created_product_id;

      ELSIF v_decision IN ('keep_product', 'update_fields') THEN
        IF v_existing_product_id IS NULL THEN
          RAISE EXCEPTION 'Produto não vinculado para o item %', v_item_id;
        END IF;

        -- Se for update_fields, atualiza os campos selecionados
        IF v_decision = 'update_fields' AND v_decision_data IS NOT NULL THEN
          v_update_fields := ARRAY(SELECT jsonb_array_elements_text(v_decision_data->'update_fields'));

          -- Atualiza campos em products
          UPDATE public.products
          SET
            name = CASE WHEN 'nome' = ANY(v_update_fields) THEN v_raw_name ELSE name END,
            sku = CASE WHEN 'codigo' = ANY(v_update_fields) THEN COALESCE(v_raw_sku, sku) ELSE sku END,
            gtin = CASE WHEN 'gtin' = ANY(v_update_fields) THEN v_raw_ean ELSE gtin END,
            unit = CASE WHEN 'unidade' = ANY(v_update_fields) THEN COALESCE(v_raw_unit, unit) ELSE unit END,
            updated_at = v_now
          WHERE id = v_existing_product_id;

          -- Atualiza dados fiscais se necessário
          IF 'ncm' = ANY(v_update_fields) OR 'cest' = ANY(v_update_fields) THEN
            INSERT INTO public.product_fiscal_profiles (product_id, ncm, cest, updated_at)
            VALUES (v_existing_product_id, v_raw_ncm, v_raw_cest, v_now)
            ON CONFLICT (product_id) DO UPDATE
            SET
              ncm = CASE WHEN 'ncm' = ANY(v_update_fields) THEN v_raw_ncm ELSE product_fiscal_profiles.ncm END,
              cest = CASE WHEN 'cest' = ANY(v_update_fields) THEN v_raw_cest ELSE product_fiscal_profiles.cest END,
              updated_at = v_now;
          END IF;

          -- Atualiza logística se necessário
          IF 'peso_bruto' = ANY(v_update_fields) OR 'peso_liquido' = ANY(v_update_fields) OR
             'largura' = ANY(v_update_fields) OR 'altura' = ANY(v_update_fields) OR 'comprimento' = ANY(v_update_fields) THEN
            INSERT INTO public.product_logistics (product_id, weight_gross, weight_net, width, height, length, updated_at)
            VALUES (v_existing_product_id, v_raw_weight_gross, v_raw_weight_net, v_raw_width, v_raw_height, v_raw_length, v_now)
            ON CONFLICT (product_id) DO UPDATE
            SET
              weight_gross = COALESCE(v_raw_weight_gross, product_logistics.weight_gross),
              weight_net = COALESCE(v_raw_weight_net, product_logistics.weight_net),
              width = COALESCE(v_raw_width, product_logistics.width),
              height = COALESCE(v_raw_height, product_logistics.height),
              length = COALESCE(v_raw_length, product_logistics.length);
          END IF;
        END IF;

      ELSE
        RAISE EXCEPTION 'Decisão inválida: %', v_decision;
      END IF;

      -- =========================================================
      -- ESTOQUE
      -- =========================================================
      IF v_decision != 'ignore' AND v_existing_product_id IS NOT NULL THEN
        -- Busca estoque anterior do produto
        SELECT COALESCE(stock_quantity, 0) INTO v_previous_stock
        FROM public.products
        WHERE id = v_existing_product_id
        FOR UPDATE;

        -- Calcula novo estoque
        IF v_stock_action = 'add' THEN
          v_new_stock := v_previous_stock + v_raw_quantity;
        ELSIF v_stock_action = 'weighted_average' THEN
          v_new_stock := v_previous_stock + v_raw_quantity;
        ELSE
          v_new_stock := v_previous_stock;
        END IF;

        -- Cria item no movimento de estoque único se houver adição
        IF v_raw_quantity > 0 AND v_stock_action IN ('add', 'weighted_average') AND v_single_movement_id IS NOT NULL THEN
          -- Cria item do movimento no movimento centralizado
          INSERT INTO public.stock_movement_items (
            movement_id,
            product_id,
            variant_id,
            quantity,
            previous_quantity,
            new_quantity,
            created_at
          ) VALUES (
            v_single_movement_id,
            v_existing_product_id,
            NULL,
            v_raw_quantity::INTEGER,
            v_previous_stock,
            v_new_stock,
            v_now
          );

          -- Atualiza estoque do produto
          UPDATE public.products
          SET stock_quantity = v_new_stock, updated_at = v_now
          WHERE id = v_existing_product_id;
        END IF;

        -- Atualiza xml_import_items
        UPDATE public.xml_import_items
        SET stock_movement_id = v_single_movement_id,
            stock_added = CASE WHEN v_stock_action IN ('add', 'weighted_average') THEN v_raw_quantity ELSE 0 END,
            updated_at = v_now
        WHERE id = v_item_id;
      END IF;

      -- =========================================================
      -- CUSTO
      -- =========================================================
      IF v_decision != 'ignore' AND v_existing_product_id IS NOT NULL AND v_cost_action != 'ignore' THEN
        SELECT COALESCE(cost_price, 0) INTO v_previous_cost
        FROM public.products
        WHERE id = v_existing_product_id;

        IF v_cost_action = 'update' THEN
          v_new_cost_value := v_raw_unit_cost;
        ELSIF v_cost_action = 'weighted_average' THEN
          IF v_previous_stock > 0 THEN
            v_new_cost_value := (v_previous_cost * v_previous_stock + v_raw_unit_cost * v_raw_quantity) / (v_previous_stock + v_raw_quantity);
          ELSE
            v_new_cost_value := v_raw_unit_cost;
          END IF;
        ELSE
          v_new_cost_value := v_previous_cost;
        END IF;

        INSERT INTO public.purchase_cost_history (
          product_id, supplier_id, xml_import_id, invoice_key,
          previous_cost, new_cost, unit_cost_from_xml, changed_at, created_by
        ) VALUES (
          v_existing_product_id, v_supplier_id, p_xml_import_id, v_invoice_key,
          v_previous_cost, v_new_cost_value, v_raw_unit_cost, v_now,
          COALESCE(p_created_by, auth.uid())
        );

        UPDATE public.products
        SET cost_price = v_new_cost_value, updated_at = v_now
        WHERE id = v_existing_product_id;

        UPDATE public.xml_import_items
        SET cost_action = v_cost_action, cost_applied = v_new_cost_value, updated_at = v_now
        WHERE id = v_item_id;
      END IF;

      -- =========================================================
      -- FORNECEDOR
      -- =========================================================
      IF p_supplier_actions IS NOT NULL THEN
        v_supplier_action := (p_supplier_actions->>v_item_id)::TEXT;
        IF v_supplier_action = 'add' AND v_supplier_id IS NOT NULL THEN
          INSERT INTO public.product_suppliers (product_id, supplier_id, is_preferred, created_at)
          VALUES (v_existing_product_id, v_supplier_id, false, v_now)
          ON CONFLICT (product_id, supplier_id) DO NOTHING;
        END IF;
      END IF;

      -- Marca item como importado
      UPDATE public.xml_import_items
      SET user_decision = v_decision,
          match_status = CASE
            WHEN v_decision = 'create_product' THEN 'matched'
            WHEN v_decision IN ('keep_product', 'update_fields') THEN 'matched'
            ELSE 'error'
          END,
          created_product_id = CASE WHEN v_decision = 'create_product' THEN v_created_product_id ELSE NULL END,
          updated_at = v_now
      WHERE id = v_item_id;

      v_total_imported := v_total_imported + 1;

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object('item_id', v_item_id, 'error', SQLERRM);
    END;
  END LOOP;

  -- Atualiza status final da importação
  UPDATE public.xml_imports
  SET status = CASE
      WHEN v_total_imported > 0 THEN 'completed'
      ELSE 'failed'
    END,
    imported_items = v_total_imported,
    skipped_items = v_total_skipped,
    errors = v_errors,
    processed_at = v_now,
    updated_at = v_now
  WHERE id = p_xml_import_id;

  -- Audit log
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
    p_partner_id,
    COALESCE(p_created_by, auth.uid()),
    'xml_imports',
    p_xml_import_id,
    'xml_import_executed',
    ARRAY[
      'Importação executada: NF ' || COALESCE(v_invoice_number, v_invoice_key, 'N/A'),
      'Itens importados: ' || v_total_imported,
      'Itens ignorados: ' || v_total_skipped,
      CASE WHEN v_errors IS NOT NULL AND jsonb_array_length(v_errors) > 0
        THEN 'Erros: ' || jsonb_array_length(v_errors) ELSE NULL END
    ],
    'system',
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'imported', v_total_imported,
    'skipped', v_total_skipped,
    'errors', v_errors,
    'stock_movement_id', v_single_movement_id
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update revert_xml_import with stock reversal, reference_name and audit
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
  v_paid_amt NUMERIC(14,2);
  v_refund_ref TEXT;
  v_has_stock_to_revert BOOLEAN := false;
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

  SELECT EXISTS (
    SELECT 1 FROM public.xml_import_items
    WHERE xml_import_id = p_xml_import_id
      AND (stock_movement_id IS NOT NULL OR COALESCE(stock_added, 0) > 0)
  ) INTO v_has_stock_to_revert;

  IF v_has_stock_to_revert THEN
    -- Create a reversal stock movement with proper reference_name
    INSERT INTO public.stock_movements (
      partner_id,
      movement_type,
      reason,
      notes,
      reference_name,
      reference_type,
      created_by,
      store_id,
      created_at
    ) VALUES (
      v_import.partner_id,
      'out',
      'Reversão de importação XML: NF ' || COALESCE(v_import.invoice_number, ''),
      COALESCE(p_reason, 'Reversão de importação'),
      'NF ' || COALESCE(v_import.invoice_number, ''),
      'xml_import',
      COALESCE(p_created_by, auth.uid()),
      v_import.store_id,
      v_now
    ) RETURNING id INTO v_reverse_movement_id;

    -- For each item with stock added, revert product stock and insert item
    FOR v_item IN
      SELECT id, matched_product_id, created_product_id, stock_action, stock_added, raw_unit, raw_quantity, stock_movement_id
      FROM public.xml_import_items
      WHERE xml_import_id = p_xml_import_id
        AND COALESCE(stock_added, 0) > 0
    LOOP
      DECLARE
        v_product_id UUID;
        v_qty NUMERIC(10,4);
      BEGIN
        v_product_id := COALESCE(v_item.created_product_id, v_item.matched_product_id);
        IF v_product_id IS NULL THEN
          CONTINUE;
        END IF;

        v_qty := v_item.stock_added;
        IF v_qty <= 0 THEN
          CONTINUE;
        END IF;

        -- Get previous stock
        SELECT COALESCE(stock_quantity, 0) INTO v_previous_stock
        FROM public.products
        WHERE id = v_product_id
        FOR UPDATE;

        v_new_stock := GREATEST(0, v_previous_stock - v_qty::INTEGER);

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
          -v_qty::INTEGER,
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

    -- Mark original stock movements as reversed
    UPDATE public.stock_movements
    SET reversed_at = v_now,
        reversed_by = COALESCE(p_created_by, auth.uid()),
        reversal_movement_id = v_reverse_movement_id
    WHERE id IN (
      SELECT DISTINCT stock_movement_id 
      FROM public.xml_import_items 
      WHERE xml_import_id = p_xml_import_id AND stock_movement_id IS NOT NULL
    );
  END IF;

  -- =========================================================
  -- REVERT FINANCE (cancel unpaid accounts + refund paid accounts)
  -- =========================================================

  -- 1. Cancel unpaid accounts payable
  UPDATE public.transactions
  SET status = 'cancelled',
      notes = COALESCE(notes || E'\n', '') || 'Cancelado devido à reversão da importação XML NF-e ' || COALESCE(v_import.invoice_number, '') || COALESCE(' - Motivo: ' || p_reason, ''),
      updated_at = v_now
  WHERE partner_id = v_import.partner_id
    AND (v_import.store_id IS NULL OR store_id = v_import.store_id)
    AND transaction_type = 'expense'
    AND status NOT IN ('paid', 'cancelled')
    AND reference_note = 'xml_import:' || p_xml_import_id::TEXT;

  -- 2. For paid accounts, create refund entries
  FOR v_tx IN
    SELECT id, amount, paid_amount, due_date, account_id, contact_id, store_id, notes
    FROM public.transactions
    WHERE partner_id = v_import.partner_id
      AND (v_import.store_id IS NULL OR store_id = v_import.store_id)
      AND transaction_type = 'expense'
      AND status = 'paid'
      AND reference_note = 'xml_import:' || p_xml_import_id::TEXT
  LOOP
    v_paid_amt := COALESCE(NULLIF(v_tx.paid_amount, 0), v_tx.amount);
    v_refund_ref := 'xml_import_refund:' || p_xml_import_id::TEXT || ':' || v_tx.id::TEXT;

    IF v_paid_amt > 0 AND NOT EXISTS (
      SELECT 1 FROM public.transactions
      WHERE partner_id = v_import.partner_id
        AND reference_note = v_refund_ref
    ) THEN
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
        origin,
        category,
        reference_note,
        description,
        notes,
        due_date,
        created_by_user_id,
        created_at,
        updated_at
      ) VALUES (
        v_import.partner_id,
        v_tx.store_id,
        v_tx.contact_id,
        v_tx.account_id,
        v_paid_amt,
        v_tx.amount,
        0,
        'refund',
        'expense_refund',
        'pending',
        'xml_import',
        'Estorno de compra',
        v_refund_ref,
        'Estorno: ' || COALESCE(v_import.invoice_number, '') || ' - Reversão de importação',
        CASE WHEN p_reason IS NOT NULL AND p_reason <> ''
          THEN 'Motivo: ' || p_reason
          ELSE NULL
        END,
        (v_now + INTERVAL '30 days')::DATE,
        COALESCE(p_created_by, auth.uid()),
        v_now,
        v_now
      );

      UPDATE public.transactions
      SET notes = COALESCE(notes || E'\n', '') || 'Importação XML revertida. Estorno a receber de R$ ' || v_paid_amt::TEXT || ' gerado.',
          updated_at = v_now
      WHERE id = v_tx.id;
    END IF;
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
    ARRAY['Importação revertida: NF ' || COALESCE(v_import.invoice_number, '') || COALESCE(' - ' || p_reason, '')],
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

GRANT EXECUTE ON FUNCTION public.execute_xml_import(UUID, UUID, UUID, JSONB, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revert_xml_import(UUID, TEXT, UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_batch_stock_movement(UUID, TEXT, TEXT, TEXT, UUID, JSONB, UUID, TEXT, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
