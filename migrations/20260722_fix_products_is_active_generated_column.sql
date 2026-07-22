-- Fix "cannot insert a non-DEFAULT value into column is_active" error when creating/updating products
-- The column products.is_active is a generated column (GENERATED ALWAYS AS (status = 'ativo') STORED).
-- The RPC functions must insert/update 'status' instead of 'is_active'.

BEGIN;

CREATE OR REPLACE FUNCTION create_product_transaction(
  p_product_data JSONB,
  p_fiscal_data JSONB,
  p_logistics_data JSONB
) RETURNS JSONB AS $$
DECLARE
  v_product_id UUID;
  v_result JSONB;
  v_partner_id UUID;
  v_store_id UUID;
BEGIN
  v_partner_id := (p_product_data->>'partner_id')::UUID;
  v_store_id := (p_product_data->>'store_id')::UUID;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: usuário não autenticado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM partner_users 
    WHERE partner_id = v_partner_id AND user_id = auth.uid()
    UNION
    SELECT 1 FROM partners
    WHERE id = v_partner_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Acesso negado: você não tem permissão para adicionar produtos a este negócio (partner_id: %)', v_partner_id;
  END IF;

  INSERT INTO products (
    id, partner_id, store_id, name, description, sku, gtin,
    brand_id, category_id, subcategory_id, marketplace_category_id,
    condition, unit, product_type, location_id,
    cost_price, price, promotional_price, min_stock, max_stock, stock_quantity,
    status, is_on_promotion, show_price_in_store, show_in_marketplace,
    images, is_featured, availability_value, availability_unit,
    warranty, video_url, technical_specs, delivery_format,
    tags, allow_sell_without_stock, moderation_status, created_at, updated_at
  ) VALUES (
    COALESCE((p_product_data->>'id')::UUID, gen_random_uuid()),
    v_partner_id,
    v_store_id,
    p_product_data->>'name',
    p_product_data->>'description',
    p_product_data->>'sku',
    p_product_data->>'gtin',
    CASE WHEN p_product_data->>'brand_id' IS NOT NULL AND p_product_data->>'brand_id' <> '' THEN (p_product_data->>'brand_id')::UUID ELSE NULL END,
    CASE WHEN p_product_data->>'category_id' IS NOT NULL AND p_product_data->>'category_id' <> '' THEN (p_product_data->>'category_id')::UUID ELSE NULL END,
    CASE WHEN p_product_data->>'subcategory_id' IS NOT NULL AND p_product_data->>'subcategory_id' <> '' THEN (p_product_data->>'subcategory_id')::UUID ELSE NULL END,
    CASE WHEN p_product_data->>'marketplace_category_id' IS NOT NULL AND p_product_data->>'marketplace_category_id' <> '' THEN (p_product_data->>'marketplace_category_id')::UUID ELSE NULL END,
    p_product_data->>'condition',
    p_product_data->>'unit',
    p_product_data->>'product_type',
    CASE WHEN p_product_data->>'location_id' IS NOT NULL AND p_product_data->>'location_id' <> '' THEN (p_product_data->>'location_id')::UUID ELSE NULL END,
    (p_product_data->>'cost_price')::NUMERIC,
    COALESCE((p_product_data->>'price')::NUMERIC, 0),
    (p_product_data->>'promotional_price')::NUMERIC,
    (p_product_data->>'min_stock')::INTEGER,
    (p_product_data->>'max_stock')::INTEGER,
    COALESCE((p_product_data->>'stock_quantity')::INTEGER, 0),
    COALESCE(p_product_data->>'status', CASE WHEN (p_product_data->>'is_active')::BOOLEAN = false THEN 'inativo' ELSE 'ativo' END),
    (p_product_data->>'is_on_promotion')::BOOLEAN,
    (p_product_data->>'show_price_in_store')::BOOLEAN,
    COALESCE((p_product_data->>'show_in_marketplace')::BOOLEAN, true),
    COALESCE(p_product_data->'images', '[]'::JSONB),
    (p_product_data->>'is_featured')::BOOLEAN,
    COALESCE((p_product_data->>'availability_value')::INTEGER, 0),
    p_product_data->>'availability_unit',
    p_product_data->>'warranty',
    p_product_data->>'video_url',
    COALESCE(p_product_data->'technical_specs', '{}'::JSONB),
    p_product_data->>'delivery_format',
    (SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_product_data->'tags', '[]'::JSONB))::TEXT)),
    COALESCE((p_product_data->>'allow_sell_without_stock')::BOOLEAN, false),
    COALESCE(p_product_data->>'moderation_status', 'approved'),
    COALESCE((p_product_data->>'created_at')::TIMESTAMPTZ, NOW()),
    COALESCE((p_product_data->>'updated_at')::TIMESTAMPTZ, NOW())
  ) RETURNING id, row_to_json(products.*) INTO v_product_id, v_result;

  IF v_store_id IS NOT NULL THEN
    INSERT INTO store_products (product_id, store_id, is_active, updated_at)
    VALUES (v_product_id, v_store_id, true, NOW())
    ON CONFLICT (product_id, store_id) DO UPDATE SET updated_at = NOW();
  END IF;

  -- Fiscal
  IF jsonb_typeof(p_fiscal_data) = 'object' AND p_fiscal_data::text <> '{}' THEN
    INSERT INTO product_fiscal_profiles (
      product_id, ncm, cest, origin, item_type, cfop_internal, cfop_external, csosn, tax_percentage, pis_cst, pis_rate, cofins_cst, cofins_rate, ipi_cst, ipi_code, product_situation, c_benef, inf_ad_prod, fci_code
    ) VALUES (
      v_product_id,
      p_fiscal_data->>'ncm', p_fiscal_data->>'cest', (p_fiscal_data->>'origin')::INTEGER,
      p_fiscal_data->>'item_type', p_fiscal_data->>'cfop_internal', p_fiscal_data->>'cfop_external',
      p_fiscal_data->>'csosn', (p_fiscal_data->>'tax_percentage')::NUMERIC,
      p_fiscal_data->>'pis_cst', (p_fiscal_data->>'pis_rate')::NUMERIC,
      p_fiscal_data->>'cofins_cst', (p_fiscal_data->>'cofins_rate')::NUMERIC,
      p_fiscal_data->>'ipi_cst', p_fiscal_data->>'ipi_code',
      p_fiscal_data->>'product_situation', p_fiscal_data->>'c_benef',
      p_fiscal_data->>'inf_ad_prod', p_fiscal_data->>'fci_code'
    );
  END IF;

  -- Logistics
  IF jsonb_typeof(p_logistics_data) = 'object' AND p_logistics_data::text <> '{}' THEN
    INSERT INTO product_logistics (
      product_id, weight_gross, weight_net, width, height, length, packaging_type, preparation_days
    ) VALUES (
      v_product_id,
      (p_logistics_data->>'weight_gross')::NUMERIC, (p_logistics_data->>'weight_net')::NUMERIC,
      (p_logistics_data->>'width')::NUMERIC, (p_logistics_data->>'height')::NUMERIC,
      (p_logistics_data->>'length')::NUMERIC, p_logistics_data->>'packaging_type',
      (p_logistics_data->>'preparation_days')::INTEGER
    );
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION public.create_product_transaction(JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_product_transaction(JSONB, JSONB, JSONB) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION update_product_transaction(
  p_product_id UUID,
  p_product_data JSONB,
  p_fiscal_data JSONB,
  p_logistics_data JSONB
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: usuário não autenticado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM products p
    LEFT JOIN partner_users pu ON p.partner_id = pu.partner_id
    LEFT JOIN partners pt ON p.partner_id = pt.id
    WHERE p.id = p_product_id AND (pu.user_id = auth.uid() OR pt.user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Acesso negado: você não tem permissão para editar este produto (%)', p_product_id;
  END IF;

  IF jsonb_typeof(p_product_data) = 'object' AND p_product_data::text <> '{}' THEN
    UPDATE products SET
      name = CASE WHEN p_product_data ? 'name' THEN p_product_data->>'name' ELSE name END,
      description = CASE WHEN p_product_data ? 'description' THEN p_product_data->>'description' ELSE description END,
      sku = CASE WHEN p_product_data ? 'sku' THEN p_product_data->>'sku' ELSE sku END,
      gtin = CASE WHEN p_product_data ? 'gtin' THEN p_product_data->>'gtin' ELSE gtin END,
      brand_id = CASE WHEN p_product_data ? 'brand_id' THEN CASE WHEN p_product_data->>'brand_id' IS NOT NULL AND p_product_data->>'brand_id' <> '' THEN (p_product_data->>'brand_id')::UUID ELSE NULL END ELSE brand_id END,
      category_id = CASE WHEN p_product_data ? 'category_id' THEN CASE WHEN p_product_data->>'category_id' IS NOT NULL AND p_product_data->>'category_id' <> '' THEN (p_product_data->>'category_id')::UUID ELSE NULL END ELSE category_id END,
      subcategory_id = CASE WHEN p_product_data ? 'subcategory_id' THEN CASE WHEN p_product_data->>'subcategory_id' IS NOT NULL AND p_product_data->>'subcategory_id' <> '' THEN (p_product_data->>'subcategory_id')::UUID ELSE NULL END ELSE subcategory_id END,
      marketplace_category_id = CASE WHEN p_product_data ? 'marketplace_category_id' THEN CASE WHEN p_product_data->>'marketplace_category_id' IS NOT NULL AND p_product_data->>'marketplace_category_id' <> '' THEN (p_product_data->>'marketplace_category_id')::UUID ELSE NULL END ELSE marketplace_category_id END,
      condition = CASE WHEN p_product_data ? 'condition' THEN p_product_data->>'condition' ELSE condition END,
      unit = CASE WHEN p_product_data ? 'unit' THEN p_product_data->>'unit' ELSE unit END,
      product_type = CASE WHEN p_product_data ? 'product_type' THEN p_product_data->>'product_type' ELSE product_type END,
      location_id = CASE WHEN p_product_data ? 'location_id' THEN CASE WHEN p_product_data->>'location_id' IS NOT NULL AND p_product_data->>'location_id' <> '' THEN (p_product_data->>'location_id')::UUID ELSE NULL END ELSE location_id END,
      cost_price = CASE WHEN p_product_data ? 'cost_price' THEN (p_product_data->>'cost_price')::NUMERIC ELSE cost_price END,
      price = CASE WHEN p_product_data ? 'price' THEN (p_product_data->>'price')::NUMERIC ELSE price END,
      promotional_price = CASE WHEN p_product_data ? 'promotional_price' THEN (p_product_data->>'promotional_price')::NUMERIC ELSE promotional_price END,
      min_stock = CASE WHEN p_product_data ? 'min_stock' THEN (p_product_data->>'min_stock')::INTEGER ELSE min_stock END,
      max_stock = CASE WHEN p_product_data ? 'max_stock' THEN (p_product_data->>'max_stock')::INTEGER ELSE max_stock END,
      stock_quantity = CASE WHEN p_product_data ? 'stock_quantity' THEN (p_product_data->>'stock_quantity')::INTEGER ELSE stock_quantity END,
      status = CASE WHEN p_product_data ? 'status' THEN p_product_data->>'status' WHEN p_product_data ? 'is_active' THEN CASE WHEN (p_product_data->>'is_active')::BOOLEAN THEN 'ativo' ELSE 'inativo' END ELSE status END,
      is_on_promotion = CASE WHEN p_product_data ? 'is_on_promotion' THEN (p_product_data->>'is_on_promotion')::BOOLEAN ELSE is_on_promotion END,
      show_price_in_store = CASE WHEN p_product_data ? 'show_price_in_store' THEN (p_product_data->>'show_price_in_store')::BOOLEAN ELSE show_price_in_store END,
      show_in_marketplace = CASE WHEN p_product_data ? 'show_in_marketplace' THEN (p_product_data->>'show_in_marketplace')::BOOLEAN ELSE show_in_marketplace END,
      images = CASE WHEN p_product_data ? 'images' THEN p_product_data->'images' ELSE images END,
      is_featured = CASE WHEN p_product_data ? 'is_featured' THEN (p_product_data->>'is_featured')::BOOLEAN ELSE is_featured END,
      availability_value = CASE WHEN p_product_data ? 'availability_value' THEN (p_product_data->>'availability_value')::INTEGER ELSE availability_value END,
      availability_unit = CASE WHEN p_product_data ? 'availability_unit' THEN p_product_data->>'availability_unit' ELSE availability_unit END,
      warranty = CASE WHEN p_product_data ? 'warranty' THEN p_product_data->>'warranty' ELSE warranty END,
      video_url = CASE WHEN p_product_data ? 'video_url' THEN p_product_data->>'video_url' ELSE video_url END,
      technical_specs = CASE WHEN p_product_data ? 'technical_specs' THEN p_product_data->'technical_specs' ELSE technical_specs END,
      delivery_format = CASE WHEN p_product_data ? 'delivery_format' THEN p_product_data->>'delivery_format' ELSE delivery_format END,
      tags = CASE WHEN p_product_data ? 'tags' THEN (SELECT ARRAY(SELECT jsonb_array_elements_text(p_product_data->'tags')::TEXT)) ELSE tags END,
      allow_sell_without_stock = CASE WHEN p_product_data ? 'allow_sell_without_stock' THEN (p_product_data->>'allow_sell_without_stock')::BOOLEAN ELSE allow_sell_without_stock END,
      updated_at = NOW()
    WHERE id = p_product_id
    RETURNING row_to_json(products.*) INTO v_result;
  END IF;

  -- Fiscal
  IF jsonb_typeof(p_fiscal_data) = 'object' AND p_fiscal_data::text <> '{}' THEN
    INSERT INTO product_fiscal_profiles (
      product_id, ncm, cest, origin, item_type, cfop_internal, cfop_external, csosn, tax_percentage, pis_cst, pis_rate, cofins_cst, cofins_rate, ipi_cst, ipi_code, product_situation, c_benef, inf_ad_prod, fci_code
    ) VALUES (
      p_product_id,
      p_fiscal_data->>'ncm', p_fiscal_data->>'cest', (p_fiscal_data->>'origin')::INTEGER,
      p_fiscal_data->>'item_type', p_fiscal_data->>'cfop_internal', p_fiscal_data->>'cfop_external',
      p_fiscal_data->>'csosn', (p_fiscal_data->>'tax_percentage')::NUMERIC,
      p_fiscal_data->>'pis_cst', (p_fiscal_data->>'pis_rate')::NUMERIC,
      p_fiscal_data->>'cofins_cst', (p_fiscal_data->>'cofins_rate')::NUMERIC,
      p_fiscal_data->>'ipi_cst', p_fiscal_data->>'ipi_code',
      p_fiscal_data->>'product_situation', p_fiscal_data->>'c_benef',
      p_fiscal_data->>'inf_ad_prod', p_fiscal_data->>'fci_code'
    ) ON CONFLICT (product_id) DO UPDATE SET
      ncm = EXCLUDED.ncm, cest = EXCLUDED.cest, origin = EXCLUDED.origin,
      item_type = EXCLUDED.item_type, cfop_internal = EXCLUDED.cfop_internal,
      cfop_external = EXCLUDED.cfop_external, csosn = EXCLUDED.csosn,
      tax_percentage = EXCLUDED.tax_percentage, pis_cst = EXCLUDED.pis_cst,
      pis_rate = EXCLUDED.pis_rate, cofins_cst = EXCLUDED.cofins_cst,
      cofins_rate = EXCLUDED.cofins_rate, ipi_cst = EXCLUDED.ipi_cst,
      ipi_code = EXCLUDED.ipi_code, product_situation = EXCLUDED.product_situation,
      c_benef = EXCLUDED.c_benef, inf_ad_prod = EXCLUDED.inf_ad_prod,
      fci_code = EXCLUDED.fci_code;
  END IF;

  -- Logistics
  IF jsonb_typeof(p_logistics_data) = 'object' AND p_logistics_data::text <> '{}' THEN
    INSERT INTO product_logistics (
      product_id, weight_gross, weight_net, width, height, length, packaging_type, preparation_days
    ) VALUES (
      p_product_id,
      (p_logistics_data->>'weight_gross')::NUMERIC, (p_logistics_data->>'weight_net')::NUMERIC,
      (p_logistics_data->>'width')::NUMERIC, (p_logistics_data->>'height')::NUMERIC,
      (p_logistics_data->>'length')::NUMERIC, p_logistics_data->>'packaging_type',
      (p_logistics_data->>'preparation_days')::INTEGER
    ) ON CONFLICT (product_id) DO UPDATE SET
      weight_gross = EXCLUDED.weight_gross, weight_net = EXCLUDED.weight_net,
      width = EXCLUDED.width, height = EXCLUDED.height, length = EXCLUDED.length,
      packaging_type = EXCLUDED.packaging_type, preparation_days = EXCLUDED.preparation_days;
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION public.update_product_transaction(UUID, JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_product_transaction(UUID, JSONB, JSONB, JSONB) TO authenticated, service_role;


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
  IF NOT EXISTS (
    SELECT 1 FROM public.partner_users
    WHERE partner_id = p_partner_id AND user_id = COALESCE(p_created_by, auth.uid())
    UNION
    SELECT 1 FROM public.partners
    WHERE id = p_partner_id AND user_id = COALESCE(p_created_by, auth.uid())
  ) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  UPDATE public.xml_imports
  SET status = 'preview', updated_at = NOW()
  WHERE id = p_xml_import_id
    AND partner_id = p_partner_id
    AND status IN ('preview', 'pending', 'failed');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Importação não encontrada ou já processada' USING ERRCODE = 'P0002';
  END IF;

  SELECT supplier_id, access_key INTO v_supplier_id, v_invoice_key
  FROM public.xml_imports
  WHERE id = p_xml_import_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    BEGIN
      v_item_id := (v_item->>'item_id')::UUID;
      v_decision := v_item->>'decision';
      v_stock_action := COALESCE(v_item->>'stock_action', 'add');
      v_cost_action := COALESCE(v_item->>'cost_action', 'update');
      v_decision_data := v_item->'decision_data';

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

      IF v_decision = 'ignore' THEN
        UPDATE public.xml_import_items
        SET match_status = 'skipped', user_decision = 'ignore', updated_at = NOW()
        WHERE id = v_item_id;
        v_total_skipped := v_total_skipped + 1;
        CONTINUE;
      END IF;

      IF v_decision = 'create_product' THEN
        v_created_product_id := gen_random_uuid();

        INSERT INTO public.products (
          id, partner_id, store_id, name, sku, gtin, unit, condition,
          cost_price, price, stock_quantity,
          status, created_at, updated_at
        ) VALUES (
          v_created_product_id,
          p_partner_id,
          p_store_id,
          v_raw_name,
          COALESCE(v_raw_sku, 'XML-' || substring(v_created_product_id::text, 1, 8)),
          v_raw_ean,
          COALESCE(v_raw_unit, 'UN'),
          'Novo',
          v_raw_unit_cost,
          v_raw_unit_cost,
          0,
          'ativo', NOW(), NOW()
        );

        IF v_raw_ncm IS NOT NULL THEN
          INSERT INTO public.product_fiscal_profiles (
            product_id, ncm, cest, origin
          ) VALUES (
            v_created_product_id,
            v_raw_ncm, v_raw_cest,
            CASE WHEN v_raw_origin ~ '^\d+$' THEN v_raw_origin::INTEGER ELSE 0 END
          );
        END IF;

        IF COALESCE(v_raw_weight_gross, v_raw_weight_net, v_raw_width, v_raw_height, v_raw_length) IS NOT NULL THEN
          INSERT INTO public.product_logistics (
            product_id, weight_gross, weight_net, width, height, length
          ) VALUES (
            v_created_product_id,
            v_raw_weight_gross, v_raw_weight_net,
            v_raw_width, v_raw_height, v_raw_length
          );
        END IF;

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

        INSERT INTO public.purchase_cost_history (
          product_id, supplier_id, xml_import_id, invoice_key,
          previous_cost, new_cost, unit_cost_from_xml, changed_at, created_by
        ) VALUES (
          v_created_product_id, v_supplier_id, p_xml_import_id, v_invoice_key,
          0, v_raw_unit_cost, v_raw_unit_cost, v_now, COALESCE(p_created_by, auth.uid())
        );

        v_existing_product_id := v_created_product_id;
      ELSE
        v_existing_product_id := (v_item->>'product_id')::UUID;
        IF v_existing_product_id IS NULL THEN
          RAISE EXCEPTION 'product_id não fornecido para item %', v_item_id;
        END IF;
      END IF;

      UPDATE public.xml_import_items
      SET matched_product_id = v_existing_product_id,
          user_decision = v_decision,
          match_status = 'confirmed',
          updated_at = NOW()
      WHERE id = v_item_id;

      v_total_imported := v_total_imported + 1;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      v_errors := v_errors || jsonb_build_object('item_id', v_item_id, 'error', v_error);
    END;
  END LOOP;

  UPDATE public.xml_imports
  SET status = CASE WHEN jsonb_array_length(v_errors) > 0 THEN 'failed' ELSE 'completed' END,
      processed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_xml_import_id;

  RETURN jsonb_build_object(
    'total_imported', v_total_imported,
    'total_skipped', v_total_skipped,
    'errors', v_errors
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION public.execute_xml_import(UUID, UUID, UUID, JSONB, JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_xml_import(UUID, UUID, UUID, JSONB, JSONB, UUID) TO authenticated, service_role;

COMMIT;
