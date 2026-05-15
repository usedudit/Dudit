-- ============================================================================
-- Migration: 962_security_fix_rpc_definer.sql
-- Security audit remediation: HIGH-01 - Fix SECURITY DEFINER bypasses
-- ============================================================================

-- 1. decrement_stock_atomic
CREATE OR REPLACE FUNCTION public.decrement_stock_atomic(
  p_product_id UUID,
  p_quantity INTEGER,
  p_variant_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rows_affected INTEGER;
BEGIN
  IF p_variant_id IS NOT NULL THEN
    -- Try to decrement variant stock
    UPDATE product_variants
    SET stock_quantity = stock_quantity - p_quantity,
        updated_at = NOW()
    WHERE id = p_variant_id
      AND product_id = p_product_id
      AND stock_quantity >= p_quantity
      AND is_active = TRUE;
      
    GET DIAGNOSTICS rows_affected = ROW_COUNT;
  ELSE
    -- Try to decrement parent product stock
    UPDATE products
    SET stock_quantity = stock_quantity - p_quantity,
        updated_at = NOW()
    WHERE id = p_product_id
      AND stock_quantity >= p_quantity
      AND is_active = TRUE;
      
    GET DIAGNOSTICS rows_affected = ROW_COUNT;
  END IF;

  RETURN rows_affected > 0;
END;
$$;

-- Drop old signature if it exists to strictly maintain one version
DROP FUNCTION IF EXISTS public.decrement_stock_atomic(UUID, INTEGER);

-- Revoke public access to decrement_stock_atomic so it can only be called from server action (service_role)
REVOKE EXECUTE ON FUNCTION public.decrement_stock_atomic(UUID, INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decrement_stock_atomic(UUID, INTEGER, UUID) TO service_role;


-- 2. create_product_transaction
CREATE OR REPLACE FUNCTION create_product_transaction(
  p_product_data JSONB,
  p_fiscal_data JSONB,
  p_logistics_data JSONB
) RETURNS JSONB AS $$
DECLARE
  v_product_id UUID;
  v_result JSONB;
  v_user UUID;
  v_partner_id UUID;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_partner_id := (p_product_data->>'partner_id')::UUID;
  
  -- Verify caller has access to the specified partner_id
  IF NOT EXISTS (
    SELECT 1 FROM partners WHERE user_id = v_user AND id = v_partner_id
  ) AND NOT EXISTS (
    SELECT 1 FROM partner_users WHERE user_id = v_user AND partner_id = v_partner_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized partner access';
  END IF;

  INSERT INTO products (
    id, partner_id, store_id, name, description, sku, gtin, brand, brand_id, category, category_id, subcategory, subcategory_id, condition, unit, product_type, location, location_id, cost_price, price, promotional_price, min_stock, max_stock, stock_quantity, is_active, is_on_promotion, show_price_in_store, show_in_marketplace, images, is_featured, availability_value, availability_unit, warranty, video_url, technical_specs, delivery_format, tags, allow_sell_without_stock, moderation_status, created_at, updated_at
  ) VALUES (
    COALESCE((p_product_data->>'id')::UUID, gen_random_uuid()),
    v_partner_id,
    (p_product_data->>'store_id')::UUID,
    p_product_data->>'name',
    p_product_data->>'description',
    p_product_data->>'sku',
    p_product_data->>'gtin',
    p_product_data->>'brand',
    CASE WHEN p_product_data->>'brand_id' IS NOT NULL AND p_product_data->>'brand_id' <> '' THEN (p_product_data->>'brand_id')::UUID ELSE NULL END,
    p_product_data->>'category',
    CASE WHEN p_product_data->>'category_id' IS NOT NULL AND p_product_data->>'category_id' <> '' THEN (p_product_data->>'category_id')::UUID ELSE NULL END,
    p_product_data->>'subcategory',
    CASE WHEN p_product_data->>'subcategory_id' IS NOT NULL AND p_product_data->>'subcategory_id' <> '' THEN (p_product_data->>'subcategory_id')::UUID ELSE NULL END,
    p_product_data->>'condition',
    p_product_data->>'unit',
    p_product_data->>'product_type',
    p_product_data->>'location',
    CASE WHEN p_product_data->>'location_id' IS NOT NULL AND p_product_data->>'location_id' <> '' THEN (p_product_data->>'location_id')::UUID ELSE NULL END,
    (p_product_data->>'cost_price')::NUMERIC,
    COALESCE((p_product_data->>'price')::NUMERIC, 0),
    (p_product_data->>'promotional_price')::NUMERIC,
    (p_product_data->>'min_stock')::INTEGER,
    (p_product_data->>'max_stock')::INTEGER,
    COALESCE((p_product_data->>'stock_quantity')::INTEGER, 0),
    (p_product_data->>'is_active')::BOOLEAN,
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

  -- Insert Fiscal
  IF jsonb_typeof(p_fiscal_data) = 'object' AND p_fiscal_data::text <> '{}' THEN
    INSERT INTO product_fiscal_profiles (
      product_id, ncm, cest, origin, item_type, cfop_internal, cfop_external, csosn, tax_percentage, pis_cst, pis_rate, cofins_cst, cofins_rate, ipi_cst, ipi_code, product_situation, c_benef, inf_ad_prod, fci_code
    ) VALUES (
      v_product_id,
      p_fiscal_data->>'ncm',
      p_fiscal_data->>'cest',
      (p_fiscal_data->>'origin')::INTEGER,
      p_fiscal_data->>'item_type',
      p_fiscal_data->>'cfop_internal',
      p_fiscal_data->>'cfop_external',
      p_fiscal_data->>'csosn',
      (p_fiscal_data->>'tax_percentage')::NUMERIC,
      p_fiscal_data->>'pis_cst',
      (p_fiscal_data->>'pis_rate')::NUMERIC,
      p_fiscal_data->>'cofins_cst',
      (p_fiscal_data->>'cofins_rate')::NUMERIC,
      p_fiscal_data->>'ipi_cst',
      p_fiscal_data->>'ipi_code',
      p_fiscal_data->>'product_situation',
      p_fiscal_data->>'c_benef',
      p_fiscal_data->>'inf_ad_prod',
      p_fiscal_data->>'fci_code'
    );
  END IF;

  -- Insert Logistics
  IF jsonb_typeof(p_logistics_data) = 'object' AND p_logistics_data::text <> '{}' THEN
    INSERT INTO product_logistics (
      product_id, weight_gross, weight_net, width, height, length, packaging_type, preparation_days
    ) VALUES (
      v_product_id,
      (p_logistics_data->>'weight_gross')::NUMERIC,
      (p_logistics_data->>'weight_net')::NUMERIC,
      (p_logistics_data->>'width')::NUMERIC,
      (p_logistics_data->>'height')::NUMERIC,
      (p_logistics_data->>'length')::NUMERIC,
      p_logistics_data->>'packaging_type',
      (p_logistics_data->>'preparation_days')::INTEGER
    );
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Limit execute to authenticated
REVOKE EXECUTE ON FUNCTION public.create_product_transaction(JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_product_transaction(JSONB, JSONB, JSONB) TO authenticated, service_role;


-- 3. update_product_transaction
CREATE OR REPLACE FUNCTION update_product_transaction(
  p_product_id UUID,
  p_product_data JSONB,
  p_fiscal_data JSONB,
  p_logistics_data JSONB
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_update_query TEXT;
  v_user UUID;
  v_partner_id UUID;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT partner_id INTO v_partner_id FROM products WHERE id = p_product_id;
  
  IF NOT EXISTS (
    SELECT 1 FROM partners WHERE user_id = v_user AND id = v_partner_id
  ) AND NOT EXISTS (
    SELECT 1 FROM partner_users WHERE user_id = v_user AND partner_id = v_partner_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized product access';
  END IF;
  
  -- Product Update
  IF jsonb_typeof(p_product_data) = 'object' AND p_product_data::text <> '{}' THEN
    UPDATE products 
    SET 
      name = CASE WHEN p_product_data ? 'name' THEN p_product_data->>'name' ELSE name END,
      description = CASE WHEN p_product_data ? 'description' THEN p_product_data->>'description' ELSE description END,
      sku = CASE WHEN p_product_data ? 'sku' THEN p_product_data->>'sku' ELSE sku END,
      gtin = CASE WHEN p_product_data ? 'gtin' THEN p_product_data->>'gtin' ELSE gtin END,
      brand = CASE WHEN p_product_data ? 'brand' THEN p_product_data->>'brand' ELSE brand END,
      brand_id = CASE WHEN p_product_data ? 'brand_id' THEN CASE WHEN p_product_data->>'brand_id' IS NOT NULL AND p_product_data->>'brand_id' <> '' THEN (p_product_data->>'brand_id')::UUID ELSE NULL END ELSE brand_id END,
      category = CASE WHEN p_product_data ? 'category' THEN p_product_data->>'category' ELSE category END,
      category_id = CASE WHEN p_product_data ? 'category_id' THEN CASE WHEN p_product_data->>'category_id' IS NOT NULL AND p_product_data->>'category_id' <> '' THEN (p_product_data->>'category_id')::UUID ELSE NULL END ELSE category_id END,
      subcategory = CASE WHEN p_product_data ? 'subcategory' THEN p_product_data->>'subcategory' ELSE subcategory END,
      subcategory_id = CASE WHEN p_product_data ? 'subcategory_id' THEN CASE WHEN p_product_data->>'subcategory_id' IS NOT NULL AND p_product_data->>'subcategory_id' <> '' THEN (p_product_data->>'subcategory_id')::UUID ELSE NULL END ELSE subcategory_id END,
      condition = CASE WHEN p_product_data ? 'condition' THEN p_product_data->>'condition' ELSE condition END,
      unit = CASE WHEN p_product_data ? 'unit' THEN p_product_data->>'unit' ELSE unit END,
      product_type = CASE WHEN p_product_data ? 'product_type' THEN p_product_data->>'product_type' ELSE product_type END,
      location = CASE WHEN p_product_data ? 'location' THEN p_product_data->>'location' ELSE location END,
      location_id = CASE WHEN p_product_data ? 'location_id' THEN CASE WHEN p_product_data->>'location_id' IS NOT NULL AND p_product_data->>'location_id' <> '' THEN (p_product_data->>'location_id')::UUID ELSE NULL END ELSE location_id END,
      cost_price = CASE WHEN p_product_data ? 'cost_price' THEN (p_product_data->>'cost_price')::NUMERIC ELSE cost_price END,
      price = CASE WHEN p_product_data ? 'price' THEN (p_product_data->>'price')::NUMERIC ELSE price END,
      promotional_price = CASE WHEN p_product_data ? 'promotional_price' THEN (p_product_data->>'promotional_price')::NUMERIC ELSE promotional_price END,
      min_stock = CASE WHEN p_product_data ? 'min_stock' THEN (p_product_data->>'min_stock')::INTEGER ELSE min_stock END,
      max_stock = CASE WHEN p_product_data ? 'max_stock' THEN (p_product_data->>'max_stock')::INTEGER ELSE max_stock END,
      stock_quantity = CASE WHEN p_product_data ? 'stock_quantity' THEN (p_product_data->>'stock_quantity')::INTEGER ELSE stock_quantity END,
      is_active = CASE WHEN p_product_data ? 'is_active' THEN (p_product_data->>'is_active')::BOOLEAN ELSE is_active END,
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
      moderation_status = CASE WHEN p_product_data ? 'moderation_status' THEN p_product_data->>'moderation_status' ELSE moderation_status END,
      updated_at = NOW()
    WHERE id = p_product_id
    RETURNING row_to_json(products.*) INTO v_result;
  ELSE
    SELECT row_to_json(products.*) INTO v_result FROM products WHERE id = p_product_id;
  END IF;

  -- Upsert Fiscal
  IF jsonb_typeof(p_fiscal_data) = 'object' AND p_fiscal_data::text <> '{}' THEN
    INSERT INTO product_fiscal_profiles (
      product_id, ncm, cest, origin, item_type, cfop_internal, cfop_external, csosn, tax_percentage, pis_cst, pis_rate, cofins_cst, cofins_rate, ipi_cst, ipi_code, product_situation, c_benef, inf_ad_prod, fci_code
    ) VALUES (
      p_product_id,
      p_fiscal_data->>'ncm',
      p_fiscal_data->>'cest',
      (p_fiscal_data->>'origin')::INTEGER,
      p_fiscal_data->>'item_type',
      p_fiscal_data->>'cfop_internal',
      p_fiscal_data->>'cfop_external',
      p_fiscal_data->>'csosn',
      (p_fiscal_data->>'tax_percentage')::NUMERIC,
      p_fiscal_data->>'pis_cst',
      (p_fiscal_data->>'pis_rate')::NUMERIC,
      p_fiscal_data->>'cofins_cst',
      (p_fiscal_data->>'cofins_rate')::NUMERIC,
      p_fiscal_data->>'ipi_cst',
      p_fiscal_data->>'ipi_code',
      p_fiscal_data->>'product_situation',
      p_fiscal_data->>'c_benef',
      p_fiscal_data->>'inf_ad_prod',
      p_fiscal_data->>'fci_code'
    ) ON CONFLICT (product_id) DO UPDATE SET
      ncm = EXCLUDED.ncm,
      cest = EXCLUDED.cest,
      origin = EXCLUDED.origin,
      item_type = EXCLUDED.item_type,
      cfop_internal = EXCLUDED.cfop_internal,
      cfop_external = EXCLUDED.cfop_external,
      csosn = EXCLUDED.csosn,
      tax_percentage = EXCLUDED.tax_percentage,
      pis_cst = EXCLUDED.pis_cst,
      pis_rate = EXCLUDED.pis_rate,
      cofins_cst = EXCLUDED.cofins_cst,
      cofins_rate = EXCLUDED.cofins_rate,
      ipi_cst = EXCLUDED.ipi_cst,
      ipi_code = EXCLUDED.ipi_code,
      product_situation = EXCLUDED.product_situation,
      c_benef = EXCLUDED.c_benef,
      inf_ad_prod = EXCLUDED.inf_ad_prod,
      fci_code = EXCLUDED.fci_code;
  END IF;

  -- Upsert Logistics
  IF jsonb_typeof(p_logistics_data) = 'object' AND p_logistics_data::text <> '{}' THEN
    INSERT INTO product_logistics (
      product_id, weight_gross, weight_net, width, height, length, packaging_type, preparation_days
    ) VALUES (
      p_product_id,
      (p_logistics_data->>'weight_gross')::NUMERIC,
      (p_logistics_data->>'weight_net')::NUMERIC,
      (p_logistics_data->>'width')::NUMERIC,
      (p_logistics_data->>'height')::NUMERIC,
      (p_logistics_data->>'length')::NUMERIC,
      p_logistics_data->>'packaging_type',
      (p_logistics_data->>'preparation_days')::INTEGER
    ) ON CONFLICT (product_id) DO UPDATE SET
      weight_gross = EXCLUDED.weight_gross,
      weight_net = EXCLUDED.weight_net,
      width = EXCLUDED.width,
      height = EXCLUDED.height,
      length = EXCLUDED.length,
      packaging_type = EXCLUDED.packaging_type,
      preparation_days = EXCLUDED.preparation_days;
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Limit execute to authenticated
REVOKE EXECUTE ON FUNCTION public.update_product_transaction(UUID, JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_product_transaction(UUID, JSONB, JSONB, JSONB) TO authenticated, service_role;
