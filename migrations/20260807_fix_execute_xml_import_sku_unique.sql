-- ============================================================================
-- Fix execute_xml_import RPC: duplicate SKU on product creation
-- ("duplicate key value violates unique constraint idx_products_partner_sku_unique")
-- When creating a new product during XML import, the SKU comes from the XML
-- (raw_sku). If an ACTIVE product with the same SKU already exists for the
-- partner, the insert fails. We now check for collisions and generate a unique
-- SKU.
-- Deleted products (status = 'deleted' / deleted_at set) are completely
-- ignored: they never match and never block re-creation with the same SKU.
-- ============================================================================

-- Torna o índice de SKU único por parceiro parcial: ignora produtos deletados,
-- então um SKU de produto deletado pode ser reutilizado livremente.
DROP INDEX IF EXISTS idx_products_partner_sku_unique;
CREATE UNIQUE INDEX idx_products_partner_sku_unique
  ON products(partner_id, sku)
  WHERE deleted_at IS NULL AND status <> 'deleted';

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
    AND (p_store_id IS NULL OR store_id = p_store_id)
    AND status IN ('preview', 'pending', 'failed');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Importação não encontrada ou já processada' USING ERRCODE = 'P0002';
  END IF;

  -- Busca dados fixos da importação
  SELECT supplier_id, access_key INTO v_supplier_id, v_invoice_key
  FROM public.xml_imports
  WHERE id = p_xml_import_id
    AND (p_store_id IS NULL OR store_id = p_store_id);

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
        -- Cria novo produto
        v_created_product_id := gen_random_uuid();

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
          'ativo', NOW(), NOW()
        );

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
            v_raw_weight_gross, v_raw_weight_net, v_raw_width, v_raw_height, v_raw_length
          );
        END IF;

        v_existing_product_id := v_created_product_id;

      ELSIF v_decision = 'keep_product' OR v_decision = 'update_fields' THEN
        -- Usa produto existente
        SELECT matched_product_id INTO v_existing_product_id
        FROM public.xml_import_items
        WHERE id = v_item_id;

        IF v_existing_product_id IS NULL THEN
          RAISE EXCEPTION 'Produto matchado não encontrado para item %', v_item_id;
        END IF;

        -- Se for update_fields, atualiza campos fiscais/logísticos
        IF v_decision = 'update_fields' AND v_decision_data IS NOT NULL THEN
          v_update_fields := ARRAY(SELECT jsonb_array_elements_text(v_decision_data->'update_fields'));
          v_keep_fields := ARRAY(SELECT jsonb_array_elements_text(v_decision_data->'keep_fields'));

          -- Busca dados fiscais atuais
          SELECT ncm, cest, origin INTO v_fiscal_data
          FROM public.product_fiscal_profiles
          WHERE product_id = v_existing_product_id;

          -- Busca dados logísticos atuais
          SELECT weight_gross, weight_net, width, height, length INTO v_logistics_data
          FROM public.product_logistics
          WHERE product_id = v_existing_product_id;

          -- Atualiza fiscais
          IF 'ncm' = ANY(v_update_fields) AND v_raw_ncm IS NOT NULL THEN
            INSERT INTO public.product_fiscal_profiles (product_id, ncm, cest, origin)
            VALUES (v_existing_product_id, v_raw_ncm, v_raw_cest, CASE WHEN v_raw_origin ~ '^\d+$' THEN v_raw_origin::INTEGER ELSE 0 END)
            ON CONFLICT (product_id) DO UPDATE SET ncm = v_raw_ncm, cest = v_raw_cest, origin = CASE WHEN v_raw_origin ~ '^\d+$' THEN v_raw_origin::INTEGER ELSE 0 END;
          END IF;

          -- Atualiza logísticos
          IF COALESCE(v_raw_weight_gross, v_raw_weight_net, v_raw_width, v_raw_height, v_raw_length) IS NOT NULL THEN
            INSERT INTO public.product_logistics (product_id, weight_gross, weight_net, width, height, length)
            VALUES (v_existing_product_id, v_raw_weight_gross, v_raw_weight_net, v_raw_width, v_raw_height, v_raw_length)
            ON CONFLICT (product_id) DO UPDATE SET
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
        -- Busca estoque anterior na store
        SELECT COALESCE(sp.quantity, 0) INTO v_previous_stock
        FROM public.stock_products sp
        WHERE sp.product_id = v_existing_product_id
          AND sp.store_id = p_store_id;

        -- Calcula novo estoque
        IF v_stock_action = 'add' THEN
          v_new_stock := v_previous_stock + v_raw_quantity;
        ELSIF v_stock_action = 'weighted_average' THEN
          -- Para média ponderada, usamos a quantidade do XML como delta
          v_new_stock := v_previous_stock + v_raw_quantity;
        ELSE
          v_new_stock := v_previous_stock;
        END IF;

        -- Cria movimento de estoque
        INSERT INTO public.stock_movements (
          partner_id,
          movement_type,
          reason,
          notes,
          created_by,
          store_id,
          created_at
        ) VALUES (
          p_partner_id,
          'entrada',
          'Importação XML: ' || v_invoice_key,
          'Item: ' || v_raw_name,
          COALESCE(p_created_by, auth.uid()),
          p_store_id,
          v_now
        ) RETURNING id INTO v_movement_id;

        -- Cria item do movimento
        INSERT INTO public.stock_movement_items (
          stock_movement_id,
          product_id,
          variant_id,
          quantity,
          unit,
          previous_stock,
          new_stock,
          created_at
        ) VALUES (
          v_movement_id,
          v_existing_product_id,
          NULL,
          v_raw_quantity,
          v_raw_unit,
          v_previous_stock,
          v_new_stock,
          v_now
        );

        -- Atualiza stock_products (bridge table)
        INSERT INTO public.stock_products (partner_id, store_id, product_id, variant_id, quantity, updated_at)
        VALUES (p_partner_id, p_store_id, v_existing_product_id, NULL, v_new_stock, v_now)
        ON CONFLICT (partner_id, store_id, product_id, variant_id) DO UPDATE
        SET quantity = v_new_stock, updated_at = v_now;

        -- Atualiza xml_import_items
        UPDATE public.xml_import_items
        SET stock_movement_id = v_movement_id,
            stock_added = v_raw_quantity,
            updated_at = v_now
        WHERE id = v_item_id;
      END IF;

      -- =========================================================
      -- CUSTO
      -- =========================================================
      IF v_decision != 'ignore' AND v_existing_product_id IS NOT NULL AND v_cost_action != 'ignore' THEN
        -- Busca custo anterior
        SELECT COALESCE(cost_price, 0) INTO v_previous_cost
        FROM public.products
        WHERE id = v_existing_product_id;

        -- Calcula novo custo
        IF v_cost_action = 'update' THEN
          v_new_cost_value := v_raw_unit_cost;
        ELSIF v_cost_action = 'weighted_average' THEN
          -- Média ponderada: (estoque_antigo * custo_antigo + qtd_xml * custo_xml) / (estoque_antigo + qtd_xml)
          IF v_previous_stock > 0 THEN
            v_new_cost_value := (v_previous_cost * v_previous_stock + v_raw_unit_cost * v_raw_quantity) / (v_previous_stock + v_raw_quantity);
          ELSE
            v_new_cost_value := v_raw_unit_cost;
          END IF;
        ELSE
          v_new_cost_value := v_previous_cost;
        END IF;

        -- Registra histórico de custo
        INSERT INTO public.purchase_cost_history (
          partner_id,
          product_id,
          previous_cost,
          new_cost,
          unit_cost_from_xml,
          changed_at,
          invoice_key,
          supplier_id,
          store_id
        ) VALUES (
          p_partner_id,
          v_existing_product_id,
          v_previous_cost,
          v_new_cost_value,
          v_raw_unit_cost,
          v_now,
          v_invoice_key,
          v_supplier_id,
          p_store_id
        );

        -- Atualiza custo do produto
        UPDATE public.products
        SET cost_price = v_new_cost_value, updated_at = v_now
        WHERE id = v_existing_product_id;

        -- Atualiza xml_import_items
        UPDATE public.xml_import_items
        SET cost_action = v_cost_action,
            cost_applied = v_new_cost_value,
            updated_at = v_now
        WHERE id = v_item_id;
      END IF;

      -- =========================================================
      -- FORNECEDOR
      -- =========================================================
      IF p_supplier_actions IS NOT NULL THEN
        v_supplier_action := (p_supplier_actions->>v_item_id)::TEXT;
        IF v_supplier_action = 'add' AND v_supplier_id IS NOT NULL THEN
          -- Adiciona fornecedor ao produto
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
      WHEN v_total_imported > 0 AND v_total_skipped = 0 THEN 'completed'
      WHEN v_total_imported > 0 AND v_total_skipped > 0 THEN 'completed'
      WHEN v_total_imported = 0 AND v_total_skipped > 0 THEN 'completed'
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
      'Importação executada: ' || COALESCE(v_invoice_key, 'N/A'),
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
    'errors', v_errors
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.execute_xml_import(UUID, UUID, UUID, JSONB, JSONB, UUID) TO authenticated, service_role;
