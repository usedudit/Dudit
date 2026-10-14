-- ============================================================================
-- Migration: 20261014_fix_execute_xml_import_last_purchase.sql
-- Description: Restores last_purchase tracking on product_suppliers during
--              XML import execution.
--
-- History:
--   2026-06-27/2026-07-22: execute_xml_import upserted product_suppliers with
--     supplier_sku, cost_price, last_purchase_price, last_purchase_date and
--     last_invoice_key on every imported item.
--   2026-08-03 onwards: the RPC was rewritten (store_id, stock_movements,
--     default margin...) and the FORNECEDOR block degraded to a bare
--     INSERT ... ON CONFLICT DO NOTHING (product_id, supplier_id, is_preferred),
--     silently dropping the last_purchase_* columns. Result: the product
--     supplier tab never shows "Última Compra" anymore.
--
-- This migration:
--   1. Re-creates execute_xml_import based on the latest version
--      (20261009_unify_default_margin_key.sql) with the FORNECEDOR block
--      restoring the full upsert of last purchase fields.
--   2. Optionally backfills last_purchase_* for existing product_suppliers
--      from the most recent purchase_cost_history row per (product, supplier).
-- ============================================================================

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

  v_default_margin NUMERIC;
  v_calc_price NUMERIC(14,2);

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

  -- Busca margem padrão configurada no parceiro
  SELECT COALESCE(
    NULLIF(business_info->'salesSettings'->>'defaultMarginPercent', '')::NUMERIC,
    NULL
  ) INTO v_default_margin
  FROM public.partners
  WHERE id = p_partner_id;

  -- Se tiver loja específica e a loja tiver margem própria, sobrescreve
  IF p_store_id IS NOT NULL THEN
    SELECT COALESCE(
      NULLIF(business_info->'salesSettings'->>'defaultMarginPercent', '')::NUMERIC,
      v_default_margin
    ) INTO v_default_margin
    FROM public.stores
    WHERE id = p_store_id AND partner_id = p_partner_id;
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

        -- Calcula preço de venda aplicando margem padrão sobre o custo se configurada
        IF v_default_margin IS NOT NULL AND v_default_margin > 0 AND v_raw_unit_cost IS NOT NULL AND v_raw_unit_cost > 0 THEN
          v_calc_price := ROUND(v_raw_unit_cost * (1.0 + (v_default_margin / 100.0)), 2);
        ELSE
          v_calc_price := v_raw_unit_cost;
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
          COALESCE(v_calc_price, v_raw_unit_cost, 0),
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
            CASE WHEN v_raw_origin ~ '^\d+$' THEN v_raw_origin::INTEGER ELSE 0 END,
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
        IF COALESCE(v_raw_weight_gross, v_raw_weight_net, v_raw_width, v_raw_height, v_raw_length) IS NOT NULL THEN
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
      -- Restaura o upsert completo: além de vincular o fornecedor ao
      -- produto, mantém os campos de última compra atualizados
      -- (last_purchase_price, last_purchase_date, last_invoice_key),
      -- custo de compra e SKU do fornecedor. Sem isso a aba
      -- Fornecedores do produto nunca exibe "Última Compra".
      v_supplier_action := COALESCE((p_supplier_actions->>v_item_id)::TEXT, 'add');
      IF v_decision != 'ignore' AND v_supplier_id IS NOT NULL AND v_supplier_action = 'add' THEN
        INSERT INTO public.product_suppliers (
          product_id, supplier_id, supplier_sku, cost_price,
          last_purchase_price, last_purchase_date, last_invoice_key, created_at
        ) VALUES (
          v_existing_product_id, v_supplier_id,
          v_raw_sku, v_raw_unit_cost,
          v_raw_unit_cost, v_now, v_invoice_key, v_now
        ) ON CONFLICT (product_id, supplier_id) DO UPDATE SET
          supplier_sku = COALESCE(EXCLUDED.supplier_sku, product_suppliers.supplier_sku),
          cost_price = EXCLUDED.cost_price,
          last_purchase_price = EXCLUDED.last_purchase_price,
          last_purchase_date = EXCLUDED.last_purchase_date,
          last_invoice_key = EXCLUDED.last_invoice_key;
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

GRANT EXECUTE ON FUNCTION public.execute_xml_import(UUID, UUID, UUID, JSONB, JSONB, UUID) TO authenticated, service_role;

-- ============================================================================
-- Backfill: preenche last_purchase_* das vínculos existentes a partir do
-- histórico de custo mais recente de cada (product_id, supplier_id).
-- ============================================================================
UPDATE public.product_suppliers ps
SET
  last_purchase_date = sub.changed_at,
  last_invoice_key = COALESCE(sub.invoice_key, ps.last_invoice_key),
  last_purchase_price = COALESCE(sub.unit_cost_from_xml, sub.new_cost, ps.last_purchase_price)
FROM (
  SELECT DISTINCT ON (product_id, supplier_id)
    product_id, supplier_id, changed_at, invoice_key, unit_cost_from_xml, new_cost
  FROM public.purchase_cost_history
  WHERE supplier_id IS NOT NULL
  ORDER BY product_id, supplier_id, changed_at DESC
) sub
WHERE ps.product_id = sub.product_id
  AND ps.supplier_id = sub.supplier_id
  AND ps.last_purchase_date IS NULL;

NOTIFY pgrst, 'reload schema';
