-- ============================================================================
-- F4.1b - Atualizar RPC execute_xml_import
-- Remove write to products.store_id (legacy), cria store_products via bridge.
-- ============================================================================

BEGIN;

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

  v_previous_stock INTEGER;
  v_new_stock INTEGER;
  v_previous_cost NUMERIC(14,2);
  v_new_cost_value NUMERIC(14,2);
  v_xml_unit_cost NUMERIC(14,2);
  v_movement_id UUID;
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
  v_now TIMESTAMPTZ := NOW();
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

  -- Atualiza status para processing (evita reprocessamento concorrente)
  UPDATE public.xml_imports
  SET status = 'preview', updated_at = NOW()
  WHERE id = p_xml_import_id
    AND partner_id = p_partner_id
    AND status IN ('preview', 'pending', 'failed');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Importação não encontrada ou já processada' USING ERRCODE = 'P0002';
  END IF;

  -- Busca dados fixos da importação
  SELECT supplier_id, access_key INTO v_supplier_id, v_invoice_key
  FROM public.xml_imports
  WHERE id = p_xml_import_id;

  -- Processa cada item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    BEGIN
      v_item_id := (v_item->>'item_id')::UUID;
      v_decision := v_item->>'decision';
      v_stock_action := COALESCE(v_item->>'stock_action', 'add');
      v_cost_action := COALESCE(v_item->>'cost_action', 'update');
      v_decision_data := v_item->'decision_data';

      -- Busca dados do item
      SELECT
        raw_sku, raw_name, raw_ean, raw_ncm, raw_cest, raw_unit,
        raw_quantity, raw_unit_cost,
        raw_weight_gross, raw_weight_net, raw_width, raw_height, raw_length,
        raw_origin
      INTO
        v_raw_sku, v_raw_name, v_raw_ean, v_raw_ncm, v_raw_cest, v_raw_unit,
        v_raw_quantity, v_raw_unit_cost,
        v_raw_weight_gross, v_raw_weight_net, v_raw_width, v_raw_height, v_raw_length,
        v_raw_origin
      FROM public.xml_import_items
      WHERE id = v_item_id AND xml_import_id = p_xml_import_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Item % não encontrado', v_item_id;
      END IF;

      -- Se for ignorar, apenas marca e continua
      IF v_decision = 'ignore' THEN
        UPDATE public.xml_import_items
        SET match_status = 'skipped', user_decision = 'ignore', updated_at = NOW()
        WHERE id = v_item_id;
        v_total_skipped := v_total_skipped + 1;
        CONTINUE;
      END IF;

      -- Resolve qual produto usar
      IF v_decision = 'create_product' THEN
        -- Cria novo produto (sem store_id - F4.1 usa bridge store_products)
        v_created_product_id := gen_random_uuid();

        INSERT INTO public.products (
          id, partner_id, name, sku, gtin, unit, condition,
          cost_price, price, stock_quantity,
          is_active, created_at, updated_at
        ) VALUES (
          v_created_product_id,
          p_partner_id,
          v_raw_name,
          COALESCE(v_raw_sku, 'XML-' || substring(v_created_product_id::text, 1, 8)),
          v_raw_ean,
          COALESCE(v_raw_unit, 'UN'),
          'Novo',
          v_raw_unit_cost,
          v_raw_unit_cost,
          0,
          true, NOW(), NOW()
        );

        -- F4.1: criar bridge store_products
        INSERT INTO public.store_products (product_id, store_id, is_active, updated_at)
        VALUES (v_created_product_id, p_store_id, true, NOW())
        ON CONFLICT (product_id, store_id) DO UPDATE SET updated_at = NOW();

        -- Cria dados fiscais se tiver NCM
        IF v_raw_ncm IS NOT NULL THEN
          INSERT INTO public.product_fiscal_profiles (
            product_id, ncm, cest, origin
          ) VALUES (
            v_created_product_id,
            v_raw_ncm, v_raw_cest,
            CASE WHEN v_raw_origin ~ '^\d+$' THEN v_raw_origin::INTEGER ELSE 0 END
          );
        END IF;

        -- Cria dados logísticos se tiver peso/dimensões
        IF COALESCE(v_raw_weight_gross, v_raw_weight_net, v_raw_width, v_raw_height, v_raw_length) IS NOT NULL THEN
          INSERT INTO public.product_logistics (
            product_id, weight_gross, weight_net, width, height, length
          ) VALUES (
            v_created_product_id,
            v_raw_weight_gross, v_raw_weight_net,
            v_raw_width, v_raw_height, v_raw_length
          );
        END IF;

        -- Vincula fornecedor
        INSERT INTO public.product_suppliers (
          product_id, supplier_id, supplier_sku, cost_price,
          last_purchase_price, last_purchase_date, last_invoice_key
        ) VALUES (
          v_created_product_id, v_supplier_id,
          v_raw_sku, v_raw_unit_cost,
          v_raw_unit_cost, v_now, v_invoice_key
        ) ON CONFLICT (product_id, supplier_id) DO UPDATE SET
          cost_price = EXCLUDED.cost_price,
          last_purchase_price = EXCLUDED.last_purchase_price,
          last_purchase_date = EXCLUDED.last_purchase_date,
          last_invoice_key = EXCLUDED.last_invoice_key,
          supplier_sku = COALESCE(EXCLUDED.supplier_sku, product_suppliers.supplier_sku);

        -- Registra custo inicial no histórico
        INSERT INTO public.purchase_cost_history (
          product_id, supplier_id, xml_import_id, invoice_key,
          previous_cost, new_cost, unit_cost_from_xml, changed_at, created_by
        ) VALUES (
          v_created_product_id, v_supplier_id, p_xml_import_id, v_invoice_key,
          0, v_raw_unit_cost, v_raw_unit_cost, v_now, COALESCE(p_created_by, auth.uid())
        );

        v_existing_product_id := v_created_product_id;
      ELSE
        -- Usa produto existente (matched ou similar)
        v_existing_product_id := (v_item->>'product_id')::UUID;

        IF v_existing_product_id IS NULL THEN
          RAISE EXCEPTION 'Produto não informado para decisão %', v_decision;
        END IF;

        -- Se for update_fields, aplica apenas os campos selecionados
        IF v_decision = 'update_fields' AND v_decision_data IS NOT NULL THEN
          v_update_fields := ARRAY(
            SELECT jsonb_array_elements_text(v_decision_data->'update_fields')
          );
          v_keep_fields := ARRAY(
            SELECT jsonb_array_elements_text(v_decision_data->'keep_fields')
          );

          -- Constrói UPDATE dinâmico para products
          v_update_data := '{}'::JSONB;

          IF v_raw_name IS NOT NULL AND v_raw_name = ANY(v_update_fields) THEN
            v_update_data := v_update_data || jsonb_build_object('name', v_raw_name);
          END IF;

          IF v_raw_ean IS NOT NULL AND v_raw_ean = ANY(v_update_fields) THEN
            v_update_data := v_update_data || jsonb_build_object('gtin', v_raw_ean);
          END IF;

          IF v_raw_unit IS NOT NULL AND v_raw_unit = ANY(v_update_fields) THEN
            v_update_data := v_update_data || jsonb_build_object('unit', v_raw_unit);
          END IF;

          IF v_update_data::text <> '{}'::text THEN
            EXECUTE format(
              'UPDATE public.products SET %s, updated_at = NOW() WHERE id = $1',
              (
                SELECT string_agg(format('%I = $2.%I', key, key), ', ')
                FROM jsonb_object_keys(v_update_data) AS key
              )
            ) USING v_existing_product_id, v_update_data;
          END IF;

          -- Atualiza dados fiscais
          v_has_fiscal := false;
          v_fiscal_update := '{}'::JSONB;

          IF v_raw_ncm IS NOT NULL AND v_raw_ncm = ANY(v_update_fields) THEN
            v_fiscal_update := v_fiscal_update || jsonb_build_object('ncm', v_raw_ncm);
            v_has_fiscal := true;
          END IF;

          IF v_raw_cest IS NOT NULL AND v_raw_cest = ANY(v_update_fields) THEN
            v_fiscal_update := v_fiscal_update || jsonb_build_object('cest', v_raw_cest);
            v_has_fiscal := true;
          END IF;

          IF v_has_fiscal THEN
            INSERT INTO public.product_fiscal_profiles (product_id, ncm, cest, origin)
            VALUES (v_existing_product_id,
              v_fiscal_update->>'ncm', v_fiscal_update->>'cest',
              CASE WHEN v_raw_origin ~ '^\d+$' THEN v_raw_origin::INTEGER ELSE 0 END
            )
            ON CONFLICT (product_id) DO UPDATE SET
              ncm = COALESCE(EXCLUDED.ncm, product_fiscal_profiles.ncm),
              cest = COALESCE(EXCLUDED.cest, product_fiscal_profiles.cest);
          END IF;

          -- Atualiza dados logísticos
          v_has_logistics := false;
          v_logistics_update := '{}'::JSONB;

          IF v_raw_weight_gross IS NOT NULL AND 'weight_gross' = ANY(v_update_fields) THEN
            v_logistics_update := v_logistics_update || jsonb_build_object('weight_gross', v_raw_weight_gross);
            v_has_logistics := true;
          END IF;

          IF v_raw_weight_net IS NOT NULL AND 'weight_net' = ANY(v_update_fields) THEN
            v_logistics_update := v_logistics_update || jsonb_build_object('weight_net', v_raw_weight_net);
            v_has_logistics := true;
          END IF;

          IF v_raw_width IS NOT NULL AND 'width' = ANY(v_update_fields) THEN
            v_logistics_update := v_logistics_update || jsonb_build_object('width', v_raw_width);
            v_has_logistics := true;
          END IF;

          IF v_raw_height IS NOT NULL AND 'height' = ANY(v_update_fields) THEN
            v_logistics_update := v_logistics_update || jsonb_build_object('height', v_raw_height);
            v_has_logistics := true;
          END IF;

          IF v_raw_length IS NOT NULL AND 'length' = ANY(v_update_fields) THEN
            v_logistics_update := v_logistics_update || jsonb_build_object('length', v_raw_length);
            v_has_logistics := true;
          END IF;

          IF v_has_logistics THEN
            INSERT INTO public.product_logistics (product_id, weight_gross, weight_net, width, height, length)
            VALUES (v_existing_product_id,
              (v_logistics_update->>'weight_gross')::NUMERIC,
              (v_logistics_update->>'weight_net')::NUMERIC,
              (v_logistics_update->>'width')::NUMERIC,
              (v_logistics_update->>'height')::NUMERIC,
              (v_logistics_update->>'length')::NUMERIC
            )
            ON CONFLICT (product_id) DO UPDATE SET
              weight_gross = COALESCE(EXCLUDED.weight_gross, product_logistics.weight_gross),
              weight_net = COALESCE(EXCLUDED.weight_net, product_logistics.weight_net),
              width = COALESCE(EXCLUDED.width, product_logistics.width),
              height = COALESCE(EXCLUDED.height, product_logistics.height),
              length = COALESCE(EXCLUDED.length, product_logistics.length);
          END IF;
        END IF;
      END IF;

      -- Aplica ações de estoque
      IF v_stock_action = 'add' THEN
        SELECT stock_quantity INTO v_previous_stock
        FROM public.products WHERE id = v_existing_product_id
        FOR UPDATE;

        v_new_stock := v_previous_stock + v_raw_quantity::INTEGER;

        UPDATE public.products
        SET stock_quantity = v_new_stock, updated_at = NOW()
        WHERE id = v_existing_product_id;
      ELSIF v_stock_action = 'weighted_average' THEN
        -- Salva custo do XML antes de sobrescrever v_raw_unit_cost
        v_xml_unit_cost := v_raw_unit_cost;
        SELECT stock_quantity, cost_price INTO v_previous_stock, v_previous_cost
        FROM public.products WHERE id = v_existing_product_id
        FOR UPDATE;

        v_new_stock := v_previous_stock + v_raw_quantity::INTEGER;
        v_new_cost_value := ROUND(
          ((COALESCE(v_previous_cost, 0) * v_previous_stock) + (v_xml_unit_cost * v_raw_quantity::INTEGER))
          / NULLIF(v_new_stock, 0),
          2
        );

        UPDATE public.products
        SET
          stock_quantity = v_new_stock,
          cost_price = v_new_cost_value,
          updated_at = NOW()
        WHERE id = v_existing_product_id;

        -- Registra histórico de custo
        INSERT INTO public.purchase_cost_history (
          product_id, supplier_id, xml_import_id, invoice_key,
          previous_cost, new_cost, unit_cost_from_xml, changed_at, created_by
        ) VALUES (
          v_existing_product_id, v_supplier_id, p_xml_import_id, v_invoice_key,
          v_previous_cost, v_new_cost_value, v_xml_unit_cost, v_now, COALESCE(p_created_by, auth.uid())
        );
      ELSE
        -- stock_action = 'ignore' - mantém estoque atual
        SELECT stock_quantity INTO v_previous_stock
        FROM public.products WHERE id = v_existing_product_id;

        v_new_stock := v_previous_stock;
      END IF;

      -- Aplica ação de custo (separada do estoque)
      IF v_cost_action = 'update' AND v_decision = 'create_product' THEN
        -- Já foi definido na criação; histórico já registrado acima
        NULL;
      ELSIF v_cost_action = 'update' THEN
        SELECT cost_price INTO v_previous_cost
        FROM public.products WHERE id = v_existing_product_id;

        UPDATE public.products
        SET cost_price = v_raw_unit_cost, updated_at = NOW()
        WHERE id = v_existing_product_id;

        INSERT INTO public.purchase_cost_history (
          product_id, supplier_id, xml_import_id, invoice_key,
          previous_cost, new_cost, unit_cost_from_xml, changed_at, created_by
        ) VALUES (
          v_existing_product_id, v_supplier_id, p_xml_import_id, v_invoice_key,
          v_previous_cost, v_raw_unit_cost, v_raw_unit_cost, v_now, COALESCE(p_created_by, auth.uid())
        );
      END IF;

      -- Registra movimentação de estoque
      IF v_stock_action IN ('add', 'weighted_average') AND v_raw_quantity > 0 THEN
        INSERT INTO public.stock_movements (
          partner_id, movement_type, reference_type, reference_name, reason, notes, created_by
        ) VALUES (
          p_partner_id, 'in', 'supplier',
          (SELECT 'NF-e ' || COALESCE(invoice_number, '') FROM public.xml_imports WHERE id = p_xml_import_id),
          'Importação XML NF-e', NULL,
          COALESCE(p_created_by, auth.uid())
        )
        RETURNING id INTO v_movement_id;

        INSERT INTO public.stock_movement_items (
          movement_id, product_id, quantity, previous_quantity, new_quantity
        ) VALUES (
          v_movement_id, v_existing_product_id, v_raw_quantity::INTEGER,
          v_previous_stock, v_new_stock
        );
      END IF;

      -- Atualiza/vincula fornecedor ao produto (existente ou novo)
      v_supplier_action := COALESCE(p_supplier_actions->>(v_item_id::text), 'add');
      IF v_decision != 'ignore' AND v_supplier_id IS NOT NULL AND v_supplier_action = 'add' THEN
        INSERT INTO public.product_suppliers (
          product_id, supplier_id, supplier_sku, cost_price,
          last_purchase_price, last_purchase_date, last_invoice_key
        ) VALUES (
          v_existing_product_id, v_supplier_id,
          v_raw_sku, v_raw_unit_cost,
          v_raw_unit_cost, v_now, v_invoice_key
        ) ON CONFLICT (product_id, supplier_id) DO UPDATE SET
          supplier_sku = COALESCE(EXCLUDED.supplier_sku, product_suppliers.supplier_sku),
          cost_price = EXCLUDED.cost_price,
          last_purchase_price = EXCLUDED.last_purchase_price,
          last_purchase_date = EXCLUDED.last_purchase_date,
          last_invoice_key = EXCLUDED.last_invoice_key;
      END IF;

      -- Atualiza o item da importação
      UPDATE public.xml_import_items
      SET
        match_status = CASE WHEN v_decision = 'ignore' THEN 'skipped' ELSE 'matched' END,
        user_decision = v_decision,
        user_decision_data = v_decision_data,
        stock_action = v_stock_action,
        cost_action = v_cost_action,
        stock_added = CASE WHEN v_stock_action IN ('add', 'weighted_average') THEN v_raw_quantity ELSE 0 END,
        cost_applied = v_raw_unit_cost,
        created_product_id = CASE WHEN v_decision = 'create_product' THEN v_existing_product_id ELSE NULL END,
        stock_movement_id = v_movement_id,
        updated_at = NOW()
      WHERE id = v_item_id;

      IF v_decision != 'ignore' THEN
        v_total_imported := v_total_imported + 1;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
      v_errors := v_errors || jsonb_build_object(
        'item_id', v_item_id,
        'error', v_error
      );
    END;
  END LOOP;

  -- Finaliza a importação
  UPDATE public.xml_imports
  SET
    status = CASE WHEN jsonb_array_length(v_errors) > 0 THEN 'failed' ELSE 'completed' END,
    imported_items = v_total_imported,
    skipped_items = v_total_skipped,
    errors = CASE WHEN jsonb_array_length(v_errors) > 0 THEN v_errors ELSE NULL END,
    updated_at = NOW()
  WHERE id = p_xml_import_id;

  RETURN jsonb_build_object(
    'success', jsonb_array_length(v_errors) = 0,
    'imported', v_total_imported,
    'skipped', v_total_skipped,
    'errors', v_errors
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION public.execute_xml_import(UUID, UUID, UUID, JSONB, JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_xml_import(UUID, UUID, UUID, JSONB, JSONB, UUID) TO authenticated, service_role;

COMMIT;
